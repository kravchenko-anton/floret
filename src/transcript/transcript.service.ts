import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
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

export type TranscriptResult = {
  videoId: string;
  language?: string;
  segments: TranscriptResponse[];
  text: string;
};

@Injectable()
export class TranscriptService {
  async fetch(
    videoIdOrUrl: string,
    lang?: string,
  ): Promise<TranscriptResult> {
    const videoId = this.extractVideoId(videoIdOrUrl);

    try {
      const segments = await fetchTranscript(videoId, lang ? { lang } : undefined);

      return {
        videoId,
        language: lang ?? segments[0]?.lang,
        segments,
        text: segments.map((s) => s.text).join(' '),
      };
    } catch (error) {
      this.rethrow(error, videoId, lang);
    }
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

      const embed = url.pathname.match(/\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
      if (embed?.[1]) return embed[1];
    } catch {
      // not a URL — fall through
    }

    throw new UnprocessableEntityException(
      `Could not extract a YouTube video ID from "${input}"`,
    );
  }

  private rethrow(error: unknown, videoId: string, lang?: string): never {
    if (error instanceof YoutubeTranscriptTooManyRequestError) {
      throw new ServiceUnavailableException(
        'YouTube is rate-limiting transcript requests. Try again later.',
      );
    }

    if (error instanceof YoutubeTranscriptVideoUnavailableError) {
      throw new NotFoundException(`Video "${videoId}" is unavailable`);
    }

    if (
      error instanceof YoutubeTranscriptDisabledError ||
      error instanceof YoutubeTranscriptNotAvailableError
    ) {
      throw new NotFoundException(
        `No transcript is available for video "${videoId}"`,
      );
    }

    if (error instanceof YoutubeTranscriptNotAvailableLanguageError) {
      throw new NotFoundException(
        `Transcript language "${lang}" is not available for video "${videoId}"`,
      );
    }

    if (error instanceof YoutubeTranscriptError) {
      throw new UnprocessableEntityException(error.message);
    }

    throw error;
  }
}
