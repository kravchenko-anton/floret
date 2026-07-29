export type VideoChapter = {
  startSec: number;
  title: string;
};

const TIMESTAMP_LINE =
  /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.+?)\s*$/;

function parseTimestampToSec(raw: string): number | null {
  const match = raw.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function formatTimestamp(startSec: number): string {
  const total = Math.max(0, Math.floor(startSec));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatChapterHeader(startSec: number, title: string): string {
  // Exactly two spaces between timestamp and title.
  return `${formatTimestamp(startSec)}  ${title.trim()}`;
}

function dedupeChapters(chapters: VideoChapter[]): VideoChapter[] {
  const byStart = new Map<number, VideoChapter>();
  for (const chapter of chapters) {
    if (!chapter.title.trim()) continue;
    if (!Number.isFinite(chapter.startSec) || chapter.startSec < 0) continue;
    byStart.set(chapter.startSec, {
      startSec: chapter.startSec,
      title: chapter.title.trim(),
    });
  }
  return [...byStart.values()].sort((a, b) => a.startSec - b.startSec);
}

function chaptersFromDescription(description: string): VideoChapter[] {
  const chapters: VideoChapter[] = [];
  for (const line of description.split(/\r?\n/)) {
    const match = line.trim().match(TIMESTAMP_LINE);
    if (!match) continue;
    const raw =
      match[1] !== undefined
        ? `${match[1]}:${match[2]}:${match[3]}`
        : `${match[2]}:${match[3]}`;
    const startSec = parseTimestampToSec(raw);
    if (startSec === null) continue;
    chapters.push({ startSec, title: match[4]! });
  }
  return dedupeChapters(chapters);
}

function extractJsonAssignment(html: string, name: string): unknown | null {
  const marker = `${name}`;
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  const eq = html.indexOf('=', idx + marker.length);
  if (eq === -1) return null;

  let i = eq + 1;
  while (i < html.length && /\s/.test(html[i]!)) i += 1;
  if (html[i] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  const start = i;

  for (; i < html.length; i += 1) {
    const ch = html[i]!;
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function walkForChapters(node: unknown, out: VideoChapter[]): void {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const item of node) walkForChapters(item, out);
    return;
  }

  const obj = node as Record<string, unknown>;

  // macroMarkersListRenderer contents
  const chapterRenderer = obj.chapterRenderer as
    | {
        title?: { simpleText?: string; runs?: Array<{ text?: string }> };
        timeRangeStartMillis?: string | number;
      }
    | undefined;

  if (chapterRenderer?.timeRangeStartMillis != null) {
    const ms = Number(chapterRenderer.timeRangeStartMillis);
    const title =
      chapterRenderer.title?.simpleText ??
      chapterRenderer.title?.runs?.map((r) => r.text ?? '').join('') ??
      '';
    if (Number.isFinite(ms) && title.trim()) {
      out.push({ startSec: ms / 1000, title: title.trim() });
    }
  }

  // markersMap chapters style
  if (
    typeof obj.startMillis === 'number' ||
    typeof obj.startMillis === 'string'
  ) {
    const titleObj = obj.title as
      | { simpleText?: string; runs?: Array<{ text?: string }> }
      | string
      | undefined;
    const title =
      typeof titleObj === 'string'
        ? titleObj
        : (titleObj?.simpleText ??
          titleObj?.runs?.map((r) => r.text ?? '').join('') ??
          '');
    const ms = Number(obj.startMillis);
    if (Number.isFinite(ms) && title.trim() && obj.durationMillis != null) {
      out.push({ startSec: ms / 1000, title: title.trim() });
    }
  }

  for (const value of Object.values(obj)) {
    walkForChapters(value, out);
  }
}

function chaptersFromPlayerPayloads(html: string): VideoChapter[] {
  const found: VideoChapter[] = [];
  for (const name of ['ytInitialPlayerResponse', 'ytInitialData']) {
    const payload = extractJsonAssignment(html, name);
    if (payload) walkForChapters(payload, found);
  }
  return dedupeChapters(found);
}

function descriptionFromHtml(html: string): string {
  const player = extractJsonAssignment(html, 'ytInitialPlayerResponse') as {
    videoDetails?: { shortDescription?: string };
  } | null;
  const short = player?.videoDetails?.shortDescription;
  if (typeof short === 'string' && short.trim()) return short;

  const data = extractJsonAssignment(html, 'ytInitialData');
  const found: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (typeof obj.simpleText === 'string' && obj.simpleText.includes(':')) {
      // skip — too noisy
    }
    if (typeof obj.content === 'string' && /\d+:\d{2}/.test(obj.content)) {
      found.push(obj.content);
    }
    for (const value of Object.values(obj)) walk(value);
  };
  if (data) walk(data);
  return found.join('\n');
}

/**
 * Best-effort YouTube chapters. Returns [] when the video has none
 * or when the watch page cannot be parsed.
 */
export async function fetchVideoChapters(
  youtubeId: string,
): Promise<VideoChapter[]> {
  try {
    const response = await fetch(
      `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}&hl=en`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; FloretBot/1.0; +https://github.com/floret)',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(12_000),
      },
    );

    if (!response.ok) return [];

    const html = await response.text();
    const fromPlayer = chaptersFromPlayerPayloads(html);
    if (fromPlayer.length >= 2) return fromPlayer;

    const description = descriptionFromHtml(html);
    const fromDescription = chaptersFromDescription(description);
    if (fromDescription.length >= 2) return fromDescription;

    // Single 0:00 marker is not useful as chapters.
    return fromPlayer.length >= 2 ? fromPlayer : [];
  } catch {
    return [];
  }
}
