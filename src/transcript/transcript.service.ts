import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  fetchTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
  type TranscriptResponse,
} from 'youtube-transcript';
import { db } from '../db';
import { transcripts } from '../db/schema';
import { createYoutubeFetch } from './youtube-fetch';

export type TranscriptResult = {
  videoId: string;
  language?: string;
  segments: TranscriptResponse[];
  text: string;
};

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 2000;

@Injectable()
export class TranscriptService {
  private readonly proxyConfigured = Boolean(
    process.env.YOUTUBE_PROXY_URL?.trim(),
  );
  private readonly youtubeFetch = createYoutubeFetch(
    process.env.YOUTUBE_PROXY_URL?.trim() || undefined,
  );

  constructor(
    @InjectPinoLogger(TranscriptService.name)
    private readonly logger: PinoLogger,
  ) {}

  async fetch(
    videoIdOrUrl: string,
    lang?: string,
  ): Promise<TranscriptResult> {
    const videoId = this.extractVideoId(videoIdOrUrl);

    const cached = await this.readCache(videoId, lang);
    if (cached) {
      this.logger.info(
        { videoId, lang, segments: cached.segments.length },
        'Transcript cache hit',
      );
      return cached;
    }

    this.logger.info(
      { videoId, lang, proxyConfigured: this.proxyConfigured },
      'Fetching transcript from YouTube',
    );

    const segments = await this.fetchWithRetry(videoId, lang);
    const result: TranscriptResult = {
      videoId,
      language: lang ?? segments[0]?.lang,
      segments,
      text: segments.map((s) => s.text).join(' '),
    };

    await this.writeCache(result);
    this.logger.info(
      { videoId, language: result.language, segments: segments.length },
      'Transcript fetched',
    );
    return result;
  }

  extractVideoId(input: string): string {
    const trimmed = input.trim();

    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }

    try {
      const url = new URL(trimmed);
      if (url.hostname.includes('youtu.be')) {
        const id = url.pathname.split('/').filter(Boolean)[0];
        if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }

      const v = url.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      const embed = url.pathname.match(
        /\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/,
      );
      if (embed?.[1]) return embed[1];
    } catch {
      // not a URL — fall through
    }

    this.logger.warn({ input: trimmed.slice(0, 120) }, 'Invalid video ID input');
    throw new UnprocessableEntityException(
      `Could not extract a YouTube video ID from "${input}"`,
    );
  }

  private async fetchWithRetry(
    videoId: string,
    lang?: string,
  ): Promise<TranscriptResponse[]> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await fetchTranscript(videoId, {
          ...(lang ? { lang } : {}),
          fetch: this.youtubeFetch,
        });
      } catch (error) {
        lastError = error;
        const errorName =
          error instanceof Error ? error.constructor.name : typeof error;

        if (!this.isRetryable(error) || attempt === MAX_ATTEMPTS) {
          this.logger.warn(
            {
              videoId,
              lang,
              attempt,
              errorName,
              proxyConfigured: this.proxyConfigured,
              message: error instanceof Error ? error.message : String(error),
            },
            'Transcript fetch failed',
          );
          this.rethrow(error, videoId, lang, attempt);
        }

        const delayMs = this.backoffMs(attempt);
        this.logger.warn(
          {
            videoId,
            attempt,
            nextAttempt: attempt + 1,
            delayMs,
            errorName,
            proxyConfigured: this.proxyConfigured,
          },
          'Retrying transcript fetch after YouTube rate-limit/block',
        );
        await this.sleep(delayMs);
      }
    }

    this.rethrow(lastError, videoId, lang, MAX_ATTEMPTS);
  }

  private isRetryable(error: unknown): boolean {
    return (
      error instanceof YoutubeTranscriptTooManyRequestError ||
      this.looksLikeIpBlock(error)
    );
  }

  private looksLikeIpBlock(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return (
      message.includes('captcha') ||
      message.includes('too many request') ||
      message.includes('rate') ||
      /status code 429|status code 403|\b429\b|\b403\b/.test(message)
    );
  }

  private backoffMs(attempt: number): number {
    const exp = BASE_DELAY_MS * 2 ** (attempt - 1);
    const jitter = Math.floor(Math.random() * 500);
    return exp + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async readCache(
    videoId: string,
    lang?: string,
  ): Promise<TranscriptResult | null> {
    try {
      const row = await db.query.transcripts.findFirst({
        where: eq(transcripts.youtubeId, videoId),
      });

      if (!row?.segments?.length) {
        return null;
      }

      if (lang && row.language && row.language !== lang) {
        return null;
      }

      return {
        videoId,
        language: row.language ?? undefined,
        segments: row.segments,
        text: row.segments.map((s) => s.text).join(' '),
      };
    } catch (error) {
      this.logger.warn(
        {
          videoId,
          errorName: error instanceof Error ? error.constructor.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
        },
        'Transcript cache read failed',
      );
      return null;
    }
  }

  private async writeCache(result: TranscriptResult): Promise<void> {
    try {
      await db
        .insert(transcripts)
        .values({
          youtubeId: result.videoId,
          language: result.language ?? null,
          segments: result.segments,
        })
        .onConflictDoUpdate({
          target: transcripts.youtubeId,
          set: {
            language: result.language ?? null,
            segments: result.segments,
          },
        });
    } catch (error) {
      this.logger.warn(
        {
          videoId: result.videoId,
          errorName: error instanceof Error ? error.constructor.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
        },
        'Transcript cache write failed',
      );
    }
  }

  private rethrow(
    error: unknown,
    videoId: string,
    lang?: string,
    attempt?: number,
  ): never {
    const errorName =
      error instanceof Error ? error.constructor.name : typeof error;
    const base = {
      videoId,
      lang,
      attempt,
      errorName,
      proxyConfigured: this.proxyConfigured,
    };

    if (
      error instanceof YoutubeTranscriptTooManyRequestError ||
      this.looksLikeIpBlock(error)
    ) {
      this.logger.error(
        base,
        'YouTube transcript blocked or rate-limited',
      );
      throw new ServiceUnavailableException(
        'YouTube is rate-limiting or blocking transcript requests from this IP. Try again later, or set YOUTUBE_PROXY_URL to a residential proxy.',
      );
    }

    if (error instanceof YoutubeTranscriptVideoUnavailableError) {
      this.logger.warn(base, 'YouTube video unavailable');
      throw new NotFoundException(`Video "${videoId}" is unavailable`);
    }

    // NotAvailable is often a mislabeled 429/403 from the library when our
    // fetch wrapper did not see the status (e.g. empty body). Prefer 503.
    if (error instanceof YoutubeTranscriptNotAvailableError) {
      this.logger.error(
        base,
        'YouTube transcript not available (often IP block mislabeled)',
      );
      throw new ServiceUnavailableException(
        `Could not retrieve transcript for video "${videoId}". YouTube may be blocking this IP; try again later or set YOUTUBE_PROXY_URL.`,
      );
    }

    if (error instanceof YoutubeTranscriptDisabledError) {
      this.logger.warn(base, 'YouTube captions disabled or missing');
      throw new NotFoundException(
        `No transcript is available for video "${videoId}"`,
      );
    }

    if (error instanceof YoutubeTranscriptNotAvailableLanguageError) {
      this.logger.warn(base, 'Requested transcript language not available');
      throw new NotFoundException(
        `Transcript language "${lang}" is not available for video "${videoId}"`,
      );
    }

    if (error instanceof YoutubeTranscriptError) {
      this.logger.error(
        { ...base, message: error.message },
        'YouTube transcript library error',
      );
      throw new UnprocessableEntityException(error.message);
    }

    this.logger.error(
      {
        ...base,
        message: error instanceof Error ? error.message : String(error),
      },
      'Unexpected transcript fetch error',
    );
    throw error;
  }
}
