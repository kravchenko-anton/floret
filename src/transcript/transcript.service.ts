import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApifyClient } from 'apify-client';
import { eq } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { cleanCaptionText } from '../analyze/script-format';
import { db } from '../db';
import { transcripts, type TranscriptSegment } from '../db/schema';
import { ScriptReflowService } from './script-reflow';

export type TranscriptResult = {
  videoId: string;
  language?: string;
  segments: TranscriptSegment[];
  text: string;
};

type ApifyCaptionCue = {
  start?: string | number;
  dur?: string | number;
  text?: string;
};

type ApifyDatasetItem = {
  data?: ApifyCaptionCue[];
  searchResult?: ApifyCaptionCue[];
  transcript?: ApifyCaptionCue[];
  error?: string;
  message?: string;
};

const DEFAULT_ACTOR_ID = 'pintostudio/youtube-transcript-scraper';

@Injectable()
export class TranscriptService {
  private readonly actorId =
    process.env.APIFY_ACTOR_ID?.trim() || DEFAULT_ACTOR_ID;
  private readonly token = process.env.APIFY_TOKEN?.trim();
  private client: ApifyClient | null = null;

  constructor(
    private readonly scriptReflowService: ScriptReflowService,
    @InjectPinoLogger(TranscriptService.name)
    private readonly logger: PinoLogger,
  ) {}

  async fetch(
    videoIdOrUrl: string,
    lang?: string,
  ): Promise<TranscriptResult> {
    const videoId = this.extractVideoId(videoIdOrUrl);
    const language = lang?.trim() || 'en';

    const cached = await this.readCache(videoId, language);
    if (cached && this.scriptReflowService.isUsableScript(cached.text)) {
      this.logger.info(
        { videoId, lang: language, segments: cached.segments.length },
        'Transcript cache hit',
      );
      return cached;
    }

    let segments: TranscriptSegment[];
    let resultLanguage = language;

    if (cached?.segments.length) {
      this.logger.info(
        {
          videoId,
          reason: cached.text ? 'stale-script' : 'missing-script',
          segments: cached.segments.length,
        },
        'Transcript segments cached; reflowing script',
      );
      segments = cached.segments;
      resultLanguage = cached.language ?? language;
    } else {
      if (!this.token) {
        this.logger.error('APIFY_TOKEN is missing');
        throw new ServiceUnavailableException('APIFY_TOKEN is required');
      }

      this.logger.info(
        { videoId, lang: language, actorId: this.actorId },
        'Fetching transcript via Apify',
      );

      segments = await this.fetchFromApify(videoId, language);
    }

    const raw: TranscriptResult = {
      videoId,
      language: resultLanguage,
      segments,
      text: segments.map((s) => s.text).join(' '),
    };

    const scriptText = await this.scriptReflowService.buildScript(raw);
    const result: TranscriptResult = {
      ...raw,
      text: scriptText,
    };

    await this.writeCache(result);
    this.logger.info(
      {
        videoId,
        language: resultLanguage,
        segments: segments.length,
        scriptChars: scriptText.length,
      },
      'Transcript script ready',
    );
    return result;
  }

  /** Ensures a reflowed script exists (used by analyze). */
  async getScript(videoIdOrUrl: string, lang?: string): Promise<string> {
    const result = await this.fetch(videoIdOrUrl, lang);
    return result.text;
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

  private getClient(): ApifyClient {
    if (!this.client) {
      this.client = new ApifyClient({ token: this.token! });
    }
    return this.client;
  }

  private async fetchFromApify(
    videoId: string,
    language: string,
  ): Promise<TranscriptSegment[]> {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const client = this.getClient();

    let run: Awaited<ReturnType<ReturnType<ApifyClient['actor']>['call']>>;
    try {
      run = await client.actor(this.actorId).call({
        videoUrl,
        targetLanguage: language,
      });
    } catch (error) {
      this.logger.error(
        {
          videoId,
          actorId: this.actorId,
          message: error instanceof Error ? error.message : String(error),
        },
        'Apify actor call failed',
      );
      throw new ServiceUnavailableException(
        `Apify transcript fetch failed for video "${videoId}"`,
      );
    }

    const runStatus = run?.status;
    const runId = run?.id;
    const datasetId = run?.defaultDatasetId;

    if (runStatus && runStatus !== 'SUCCEEDED') {
      this.logger.error(
        { videoId, runId, runStatus, actorId: this.actorId },
        'Apify actor run did not succeed',
      );
      throw new ServiceUnavailableException(
        `Apify transcript run ${runStatus} for video "${videoId}"`,
      );
    }

    if (!datasetId) {
      this.logger.error(
        { videoId, runId, runStatus },
        'Apify run missing dataset id',
      );
      throw new ServiceUnavailableException(
        `Apify returned no dataset for video "${videoId}"`,
      );
    }

    let items: ApifyDatasetItem[];
    try {
      const listed = await client.dataset(datasetId).listItems();
      items = (listed.items ?? []) as ApifyDatasetItem[];
    } catch (error) {
      this.logger.error(
        {
          videoId,
          runId,
          datasetId,
          message: error instanceof Error ? error.message : String(error),
        },
        'Failed to read Apify dataset',
      );
      throw new ServiceUnavailableException(
        `Could not read Apify transcript dataset for video "${videoId}"`,
      );
    }

    this.logger.info(
      { videoId, runId, runStatus, itemCount: items.length },
      'Apify transcript run finished',
    );

    const first = items[0];
    if (!first) {
      throw new NotFoundException(
        `No transcript is available for video "${videoId}"`,
      );
    }

    if (first.error || first.message) {
      this.logger.warn(
        {
          videoId,
          runId,
          error: first.error,
          message: first.message,
        },
        'Apify dataset item reported an error',
      );
    }

    const cues = first.data ?? first.searchResult ?? first.transcript;
    const segments = this.mapCuesToSegments(cues, language);

    if (!segments.length) {
      this.logger.warn(
        { videoId, runId },
        'Apify returned empty transcript cues',
      );
      throw new NotFoundException(
        `No transcript is available for video "${videoId}"`,
      );
    }

    return segments;
  }

  private mapCuesToSegments(
    cues: ApifyCaptionCue[] | undefined,
    language: string,
  ): TranscriptSegment[] {
    if (!Array.isArray(cues) || !cues.length) {
      return [];
    }

    const segments: TranscriptSegment[] = [];
    for (const cue of cues) {
      const raw = typeof cue.text === 'string' ? cue.text : '';
      const text = cleanCaptionText(raw);
      if (!text) continue;

      const startSec = Number(cue.start);
      const durSec = Number(cue.dur);

      segments.push({
        text,
        offset: Number.isFinite(startSec) ? startSec * 1000 : 0,
        duration: Number.isFinite(durSec) ? durSec * 1000 : 0,
        lang: language,
      });
    }

    return segments;
  }

  private async readCache(
    videoId: string,
    lang: string,
  ): Promise<TranscriptResult | null> {
    try {
      const row = await db.query.transcripts.findFirst({
        where: eq(transcripts.youtubeId, videoId),
      });

      if (!row?.segments?.length) {
        return null;
      }

      if (row.language && row.language !== lang) {
        return null;
      }

      const segments = row.segments
        .map((s) => ({
          ...s,
          text: cleanCaptionText(s.text),
        }))
        .filter((s) => s.text);

      if (!segments.length) {
        return null;
      }

      const scriptText = row.scriptText?.trim() || '';
      const result: TranscriptResult = {
        videoId,
        language: row.language ?? undefined,
        segments,
        text: scriptText,
      };

      // Rewrite dirty cached captions so later reads stay clean.
      if (row.segments.some((s) => s.text !== cleanCaptionText(s.text))) {
        void this.writeCache({
          ...result,
          text: scriptText || segments.map((s) => s.text).join(' '),
        });
      }

      return result;
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
          scriptText: result.text,
        })
        .onConflictDoUpdate({
          target: transcripts.youtubeId,
          set: {
            language: result.language ?? null,
            segments: result.segments,
            scriptText: result.text,
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
}
