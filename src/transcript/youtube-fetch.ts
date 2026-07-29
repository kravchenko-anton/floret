import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { YoutubeTranscriptTooManyRequestError } from 'youtube-transcript';

type FetchFn = typeof globalThis.fetch;

const BLOCKED_STATUSES = new Set([403, 429]);

function createProxyDispatcher(proxyUrl: string): ProxyAgent {
  return new ProxyAgent(proxyUrl);
}

/**
 * Fetch for youtube-transcript that:
 * - optionally routes through YOUTUBE_PROXY_URL
 * - remaps 403/429 from YouTube into TooManyRequestError so callers
 *   don't misclassify IP blocks as "no transcript"
 */
export function createYoutubeFetch(proxyUrl?: string): FetchFn {
  const dispatcher = proxyUrl ? createProxyDispatcher(proxyUrl) : undefined;

  const youtubeFetch: FetchFn = async (input, init) => {
    const response = dispatcher
      ? await undiciFetch(input as string | URL, {
          ...(init as Parameters<typeof undiciFetch>[1]),
          dispatcher,
        })
      : await fetch(input, init);

    if (BLOCKED_STATUSES.has(response.status)) {
      throw new YoutubeTranscriptTooManyRequestError();
    }

    return response as Response;
  };

  return youtubeFetch;
}
