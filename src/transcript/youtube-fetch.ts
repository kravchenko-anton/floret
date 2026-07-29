import { Logger } from '@nestjs/common';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { YoutubeTranscriptTooManyRequestError } from 'youtube-transcript';

type FetchFn = typeof globalThis.fetch;

const BLOCKED_STATUSES = new Set([403, 429]);
const logger = new Logger('YoutubeFetch');

function createProxyDispatcher(proxyUrl: string): ProxyAgent {
  return new ProxyAgent(proxyUrl);
}

function requestHost(input: RequestInfo | URL): string {
  try {
    if (typeof input === 'string') return new URL(input).host;
    if (input instanceof URL) return input.host;
    if (typeof input.url === 'string') return new URL(input.url).host;
  } catch {
    // ignore
  }
  return 'unknown';
}

/**
 * Fetch for youtube-transcript that:
 * - optionally routes through YOUTUBE_PROXY_URL
 * - remaps 403/429 from YouTube into TooManyRequestError so callers
 *   don't misclassify IP blocks as "no transcript"
 */
export function createYoutubeFetch(proxyUrl?: string): FetchFn {
  const dispatcher = proxyUrl ? createProxyDispatcher(proxyUrl) : undefined;
  const proxyConfigured = Boolean(proxyUrl);

  const youtubeFetch: FetchFn = async (input, init) => {
    const host = requestHost(input);

    const response = dispatcher
      ? await undiciFetch(input as string | URL, {
          ...(init as Parameters<typeof undiciFetch>[1]),
          dispatcher,
        })
      : await fetch(input, init);

    if (BLOCKED_STATUSES.has(response.status)) {
      logger.warn(
        `YouTube blocked request status=${response.status} host=${host} proxyConfigured=${proxyConfigured}`,
      );
      throw new YoutubeTranscriptTooManyRequestError();
    }

    return response as Response;
  };

  return youtubeFetch;
}
