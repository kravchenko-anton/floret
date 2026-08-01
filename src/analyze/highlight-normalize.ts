import { isChapterHeaderLine } from './script-format'

type HighlightType = 'hook' | 'cta' | 'rehook';

type AnalysisHighlight = {
  type: HighlightType;
  start: number;
  end: number;
  quote: string;
};

const WORD_CHAR = /[A-Za-z0-9\u00C0-\u024F']/;

function isWordChar(ch: string | undefined): boolean {
  return !!ch && WORD_CHAR.test(ch);
}

export function snapToWordBounds(
  text: string,
  start: number,
  end: number,
): { start: number; end: number } | null {
  let s = Math.max(0, Math.min(start, text.length));
  let e = Math.max(0, Math.min(end, text.length));
  if (s >= e) return null;

  if (isWordChar(text[s]) && s > 0 && isWordChar(text[s - 1])) {
    while (s > 0 && isWordChar(text[s - 1])) s -= 1;
  }

  if (e > 0 && isWordChar(text[e - 1]) && isWordChar(text[e])) {
    while (e < text.length && isWordChar(text[e])) e += 1;
  }

  while (s < e && /\s/.test(text[s]!)) s += 1;
  while (e > s && /\s/.test(text[e - 1]!)) e -= 1;

  if (s >= e) return null;
  return { start: s, end: e };
}

function rangeIsOnlyChapterHeader(text: string, start: number, end: number): boolean {
  const slice = text.slice(start, end).trim();
  if (!slice) return true;
  const lines = slice.split(/\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 && lines.every(isChapterHeaderLine);
}

function findUniqueQuoteRange(
  text: string,
  quote: string,
): { start: number; end: number } | null {
  const needle = quote.trim();
  if (!needle || needle.length < 3) return null;

  const first = text.indexOf(needle);
  if (first === -1) return null;
  const second = text.indexOf(needle, first + 1);
  if (second !== -1) return null;

  return { start: first, end: first + needle.length };
}

function resolveHighlightRange(
  text: string,
  start: number,
  end: number,
  quote: unknown,
): { start: number; end: number } | null {
  if (typeof quote === 'string' && quote.trim()) {
    const byQuote = findUniqueQuoteRange(text, quote);
    if (byQuote) {
      const snapped = snapToWordBounds(text, byQuote.start, byQuote.end);
      if (snapped && !rangeIsOnlyChapterHeader(text, snapped.start, snapped.end)) {
        return snapped;
      }
    }
  }

  const snapped = snapToWordBounds(text, start, end);
  if (!snapped) return null;
  if (rangeIsOnlyChapterHeader(text, snapped.start, snapped.end)) return null;
  return snapped;
}

function rangesOverlapOrTouch(
  a: AnalysisHighlight,
  b: AnalysisHighlight,
  text: string,
): boolean {
  if (a.end >= b.start) return true;
  const gap = text.slice(a.end, b.start);
  return /^[\s]*$/.test(gap);
}

export function mergeAdjacentHighlights(
  highlights: AnalysisHighlight[],
  text: string,
): AnalysisHighlight[] {
  if (highlights.length <= 1) return highlights;

  const sorted = [...highlights].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: AnalysisHighlight[] = [];

  for (const current of sorted) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.type === current.type &&
      rangesOverlapOrTouch(prev, current, text)
    ) {
      const start = Math.min(prev.start, current.start);
      const end = Math.max(prev.end, current.end);
      merged[merged.length - 1] = {
        type: prev.type,
        start,
        end,
        quote: text.slice(start, end),
      };
    } else {
      merged.push(current);
    }
  }

  return merged;
}

export function normalizeHighlightItems(
  value: unknown,
  text: string,
): AnalysisHighlight[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowed: HighlightType[] = ['hook', 'cta', 'rehook'];
  const highlights: AnalysisHighlight[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const type = row.type;
    const start = row.start;
    const end = row.end;

    if (typeof type !== 'string' || !allowed.includes(type as HighlightType)) {
      continue;
    }
    if (typeof start !== 'number' || typeof end !== 'number') continue;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    const resolved = resolveHighlightRange(text, start, end, row.quote);
    if (!resolved) continue;

    highlights.push({
      type: type as HighlightType,
      start: resolved.start,
      end: resolved.end,
      quote: text.slice(resolved.start, resolved.end),
    });
  }

  return mergeAdjacentHighlights(highlights, text);
}
