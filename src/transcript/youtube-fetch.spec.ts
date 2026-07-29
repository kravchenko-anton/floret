import { YoutubeTranscriptTooManyRequestError } from 'youtube-transcript';
import { createYoutubeFetch } from './youtube-fetch';

describe('createYoutubeFetch', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('passes through successful responses', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response('ok', { status: 200 }),
    ) as typeof fetch;

    const youtubeFetch = createYoutubeFetch();
    const res = await youtubeFetch('https://www.youtube.com/watch?v=x');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('maps 429 to YoutubeTranscriptTooManyRequestError', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response('nope', { status: 429 }),
    ) as typeof fetch;

    const youtubeFetch = createYoutubeFetch();
    await expect(
      youtubeFetch('https://www.youtube.com/api/timedtext'),
    ).rejects.toBeInstanceOf(YoutubeTranscriptTooManyRequestError);
  });

  it('maps 403 to YoutubeTranscriptTooManyRequestError', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response('nope', { status: 403 }),
    ) as typeof fetch;

    const youtubeFetch = createYoutubeFetch();
    await expect(
      youtubeFetch('https://www.youtube.com/api/timedtext'),
    ).rejects.toBeInstanceOf(YoutubeTranscriptTooManyRequestError);
  });
});
