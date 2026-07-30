import type { TranscriptResult } from '../transcript/transcript.service';
import { formatChapterHeader, type VideoChapter } from './chapters';

/** Inner shape: timestamp, two spaces, title. */
const CHAPTER_HEADER_INNER = '\\d{1,2}:\\d{2}(?::\\d{2})? {2}.+';
const CHAPTER_HEADER_RE = new RegExp(
  `^(?:<b>)?${CHAPTER_HEADER_INNER}(?:</b>)?$`,
);
const PLAIN_CHAPTER_HEADER_RE = new RegExp(`^${CHAPTER_HEADER_INNER}$`);
const BOLD_CHAPTER_HEADER_RE = new RegExp(`^<b>${CHAPTER_HEADER_INNER}</b>$`);

/** Line endings that usually mean a mid-thought wrap (stale / bad format). */
const HANGING_LINE_END =
  /\b(?:a|an|the|to|of|and|or|but|for|with|as|at|by|from|into|i'm|i've|i'd|you're|we're|they're|it's|is|are|was|were|be|been|call|what|that|this|my|your|our|their)$/i;

const SHORT_LINE_WORD_MEDIAN = 8;
const SHORT_LINE_MIN_COUNT = 8;
export const MAX_SCRIPT_LINE_WORDS = 40;

export function isScriptFormattedText(text: string): boolean {
  return text.includes('\n');
}

export function isChapterHeaderLine(line: string): boolean {
  return CHAPTER_HEADER_RE.test(line.trimEnd());
}

function isPlainChapterHeaderLine(line: string): boolean {
  return PLAIN_CHAPTER_HEADER_RE.test(line.trimEnd());
}

function isBoldChapterHeaderLine(line: string): boolean {
  return BOLD_CHAPTER_HEADER_RE.test(line.trimEnd());
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * True when cached analyze `text` matches the current script format
 * (bold chapter headers; thought-length lines without mid-clause wraps).
 */
export function isCurrentScriptFormat(text: string): boolean {
  if (!text.trim()) return false;

  const lines = text.split('\n').map((l) => l.trimEnd());
  let hasChapter = false;

  for (const line of lines) {
    if (!line) continue;
    if (isPlainChapterHeaderLine(line) && !isBoldChapterHeaderLine(line)) {
      return false;
    }
    if (isBoldChapterHeaderLine(line) || isChapterHeaderLine(line)) {
      hasChapter = true;
    }
  }

  const spoken = lines.filter((l) => l.length > 0 && !isChapterHeaderLine(l));

  if (spoken.some((line) => wordCount(line) > MAX_SCRIPT_LINE_WORDS)) {
    return false;
  }

  if (spoken.some((l) => HANGING_LINE_END.test(l.trim()))) {
    return false;
  }

  if (spoken.length >= SHORT_LINE_MIN_COUNT) {
    const words = spoken.map(wordCount);
    if (median(words) < SHORT_LINE_WORD_MEDIAN) {
      return false;
    }
  }

  if (hasChapter) {
    const headers = lines.filter((l) => isChapterHeaderLine(l));
    if (headers.some((h) => !isBoldChapterHeaderLine(h))) {
      return false;
    }
  }

  return true;
}

export function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  return normalized
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type CleanSegment = {
  startSec: number;
  offsetMs: number;
  durationMs: number;
  text: string;
};

/** Caption offsets/durations are milliseconds. */
function offsetMsToSec(offsetMs: number): number {
  return offsetMs / 1000;
}

const CAPTION_NOISE_RE =
  /\[[^\]]*\]|[<>]{2,}|[♪♫♩♬]+|\(\s*(?:music|applause|laughter|laughing|cheers|cheering|silence|inaudible|crosstalk|audience|singing|clapping|noise|sound)\s*\)/i;

/** True when text still contains caption/ASR chrome that should be stripped. */
export function hasCaptionNoise(text: string): boolean {
  return CAPTION_NOISE_RE.test(text);
}

/**
 * Strip ASR/caption noise so the script is spoken words only:
 * [music], [laughter], >>, <<, ♪, etc.
 */
export function cleanCaptionText(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[<>]{2,}/g, ' ')
    .replace(/[♪♫♩♬]+/g, ' ')
    .replace(
      /\(\s*(?:music|applause|laughter|laughing|cheers|cheering|silence|inaudible|crosstalk|audience|singing|clapping|noise|sound)\s*\)/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSegmentText(text: string): string {
  return cleanCaptionText(text);
}

/** Clean a full multi-line script while preserving chapter layout. */
export function cleanScriptText(text: string): string {
  const lines = text.split('\n').map((line) => {
    if (isChapterHeaderLine(line)) return line.trimEnd();
    return cleanCaptionText(line);
  });

  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.length > 0) {
      out.push(line);
      continue;
    }

    const prev = out[out.length - 1];
    const next = lines.slice(i + 1).find((l) => l.length > 0);
    // Keep a single blank after a chapter header, or before the next chapter.
    const keep =
      (prev && isChapterHeaderLine(prev)) ||
      (next !== undefined && isChapterHeaderLine(next));
    if (keep && prev !== '') {
      out.push('');
    }
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanedSegments(
  segments: TranscriptResult['segments'],
): CleanSegment[] {
  return segments
    .map((s) => ({
      startSec: offsetMsToSec(s.offset),
      offsetMs: s.offset,
      durationMs: s.duration,
      text: cleanSegmentText(s.text),
    }))
    .filter((s) => s.text);
}

function pickChapterIndex(startSec: number, chapters: VideoChapter[]): number {
  let idx = 0;
  for (let i = 0; i < chapters.length; i += 1) {
    if (chapters[i]!.startSec <= startSec) idx = i;
    else break;
  }
  return idx;
}

/** Spoken word tokens only (chapter headers stripped), whitespace-normalized. */
export function spokenWordTokens(text: string): string[] {
  return text
    .split('\n')
    .filter((l) => !isChapterHeaderLine(l))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** Spoken words only (chapter headers stripped), lowercased, whitespace-normalized. */
export function spokenWordSequence(text: string): string[] {
  return spokenWordTokens(text).map((w) => w.toLowerCase());
}

/** Alphanumeric letters only — used to tolerate AI space merge/split errors. */
function lettersOnly(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** True when reformatted script keeps the same spoken words in order. */
export function sameSpokenWords(original: string, formatted: string): boolean {
  const a = spokenWordSequence(original);
  const b = spokenWordSequence(formatted);
  if (a.length !== b.length) return false;
  return a.every((w, i) => w === b[i]);
}

/**
 * Keep AI line breaks / chapter layout, but restore draft spoken tokens.
 * Fixes common reflow mistakes like merging "nice guy" → "niceguy".
 * Returns null when letter content truly differs (cannot safely repair).
 */
export function repairReflowToSpokenWords(
  draft: string,
  reflowed: string,
): string | null {
  const draftWords = spokenWordTokens(draft);
  const reflowedWords = spokenWordTokens(reflowed);
  if (!draftWords.length) return null;

  if (
    lettersOnly(draftWords.join('')) !== lettersOnly(reflowedWords.join(''))
  ) {
    return null;
  }

  let wordIdx = 0;
  const out: string[] = [];

  for (const rawLine of reflowed.split('\n')) {
    const line = rawLine.trimEnd();
    if (isChapterHeaderLine(line)) {
      out.push(line);
      continue;
    }
    if (!line.trim()) {
      out.push('');
      continue;
    }

    const target = lettersOnly(line);
    if (!target) {
      out.push(line);
      continue;
    }

    const taken: string[] = [];
    let letters = '';
    while (wordIdx < draftWords.length && letters.length < target.length) {
      const word = draftWords[wordIdx]!;
      taken.push(word);
      letters += lettersOnly(word);
      wordIdx += 1;
    }

    if (letters !== target) return null;
    out.push(taken.join(' '));
  }

  if (wordIdx !== draftWords.length) return null;
  return cleanScriptText(out.join('\n'));
}

type ScriptChapterWords = {
  header?: string;
  words: string[];
  startIndex: number;
  endIndex: number;
};

export type IndexedScriptDraft = {
  annotated: string;
  wordCount: number;
  chapterEndIndexes: number[];
};

function parseScriptChapterWords(draft: string): ScriptChapterWords[] {
  const chapters: ScriptChapterWords[] = [];
  let header: string | undefined;
  let words: string[] = [];
  let nextIndex = 0;

  const flush = () => {
    if (!words.length) return;
    chapters.push({
      header,
      words,
      startIndex: nextIndex,
      endIndex: nextIndex + words.length - 1,
    });
    nextIndex += words.length;
    words = [];
  };

  for (const rawLine of draft.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isChapterHeaderLine(line)) {
      flush();
      header = line;
      continue;
    }
    words.push(...line.split(/\s+/).filter(Boolean));
  }
  flush();

  return chapters;
}

/**
 * Add stable indexes to draft words. The AI selects indexes only; final text is
 * always reconstructed from the untouched draft words.
 */
export function buildIndexedScriptDraft(draft: string): IndexedScriptDraft {
  const chapters = parseScriptChapterWords(draft);
  const annotated = chapters
    .map((chapter) => {
      const indexedWords = chapter.words
        .map((word, offset) => `[${chapter.startIndex + offset}]${word}`)
        .join(' ');
      return chapter.header
        ? `${chapter.header}\n${indexedWords}`
        : indexedWords;
    })
    .join('\n\n');

  return {
    annotated,
    wordCount: chapters.reduce((sum, chapter) => sum + chapter.words.length, 0),
    chapterEndIndexes: chapters.map((chapter) => chapter.endIndex),
  };
}

/**
 * Reconstruct a script from inclusive global word indexes selected as line
 * endings. Invalid, incomplete, cross-chapter, or oversized layouts return
 * null.
 */
export function formatScriptFromLineEnds(
  draft: string,
  lineEnds: unknown,
  maxLineWords = MAX_SCRIPT_LINE_WORDS,
): string | null {
  if (!Array.isArray(lineEnds) || !lineEnds.length) return null;

  const ends = lineEnds.filter((value): value is number =>
    Number.isInteger(value),
  );
  if (ends.length !== lineEnds.length) return null;
  if (
    ends.some((value, index) => {
      const previous = ends[index - 1];
      return value < 0 || (previous !== undefined && value <= previous);
    })
  ) {
    return null;
  }

  const chapters = parseScriptChapterWords(draft);
  if (!chapters.length) return null;
  const finalIndex = chapters.at(-1)?.endIndex;
  if (finalIndex === undefined || ends.at(-1) !== finalIndex) return null;

  const chapterEnds = new Set(chapters.map((chapter) => chapter.endIndex));
  if ([...chapterEnds].some((chapterEnd) => !ends.includes(chapterEnd))) {
    return null;
  }

  const blocks: string[] = [];
  let endCursor = 0;
  for (const chapter of chapters) {
    const lines: string[] = [];
    let lineStart = chapter.startIndex;

    while (endCursor < ends.length) {
      const lineEnd = ends[endCursor];
      if (lineEnd === undefined || lineEnd > chapter.endIndex) break;
      if (lineEnd < lineStart || lineEnd - lineStart + 1 > maxLineWords) {
        return null;
      }
      const localStart = lineStart - chapter.startIndex;
      const localEnd = lineEnd - chapter.startIndex + 1;
      lines.push(chapter.words.slice(localStart, localEnd).join(' '));
      lineStart = lineEnd + 1;
      endCursor += 1;
    }

    if (lineStart !== chapter.endIndex + 1 || !lines.length) return null;
    blocks.push(
      chapter.header
        ? `${chapter.header}\n\n${lines.join('\n')}`
        : lines.join('\n'),
    );
  }

  if (endCursor !== ends.length) return null;
  return cleanScriptText(blocks.join('\n\n'));
}

const FALLBACK_MAX_LINE_WORDS = 28;
const FALLBACK_MIN_LINE_WORDS = 10;
const LINE_START_CONNECTOR =
  /^(?:and|but|so|because|if|when|while|now|then|however|instead|once|after|before|from|to)$/i;
const SENTENCE_END = /[.!?…][”"')\]]*$/;
const CLAUSE_END = /[,;:][”"')\]]*$/;

function chooseFallbackLineEnd(words: string[], start: number): number {
  const hardEnd = Math.min(
    start + FALLBACK_MAX_LINE_WORDS - 1,
    words.length - 1,
  );
  if (hardEnd === words.length - 1) return hardEnd;

  const minEnd = Math.min(start + FALLBACK_MIN_LINE_WORDS - 1, hardEnd);
  for (let index = hardEnd; index >= minEnd; index -= 1) {
    if (SENTENCE_END.test(words[index] ?? '')) return index;
  }
  for (let index = hardEnd; index >= minEnd; index -= 1) {
    if (CLAUSE_END.test(words[index] ?? '')) return index;
  }
  for (let index = hardEnd; index >= minEnd; index -= 1) {
    if (LINE_START_CONNECTOR.test(words[index + 1] ?? '')) return index;
  }
  for (let index = hardEnd; index >= minEnd; index -= 1) {
    if (!HANGING_LINE_END.test(words[index] ?? '')) return index;
  }
  return hardEnd;
}

/** A safe last resort that preserves words and never emits giant lines. */
export function formatScriptWithBoundedLines(draft: string): string {
  const chapters = parseScriptChapterWords(draft);
  const blocks = chapters.map((chapter) => {
    const lines: string[] = [];
    let start = 0;
    while (start < chapter.words.length) {
      const end = chooseFallbackLineEnd(chapter.words, start);
      lines.push(chapter.words.slice(start, end + 1).join(' '));
      start = end + 1;
    }
    return chapter.header
      ? `${chapter.header}\n\n${lines.join('\n')}`
      : lines.join('\n');
  });
  return cleanScriptText(blocks.join('\n\n'));
}

/**
 * Build a draft script for AI reflow: continuous spoken text per chapter,
 * with `<b>MM:SS  Title</b>` headers. No programmatic mid-line wrapping.
 */
export function buildScriptDraft(
  transcript: TranscriptResult,
  chapters: VideoChapter[],
): string {
  const segs = cleanedSegments(transcript.segments);
  if (!segs.length) {
    const fallback = cleanCaptionText(transcript.text);
    return fallback;
  }

  if (chapters.length < 2) {
    return segs.map((s) => s.text).join(' ');
  }

  const buckets: string[][] = chapters.map(() => []);
  for (const seg of segs) {
    const idx = pickChapterIndex(seg.startSec, chapters);
    buckets[idx]!.push(seg.text);
  }

  const blocks: string[] = [];
  for (let i = 0; i < chapters.length; i += 1) {
    const words = buckets[i]!;
    if (!words.length) continue;
    const chapter = chapters[i]!;
    blocks.push(
      `${formatChapterHeader(chapter.startSec, chapter.title)}\n\n${words.join(' ')}`,
    );
  }

  if (!blocks.length) {
    return segs.map((s) => s.text).join(' ');
  }

  return cleanScriptText(blocks.join('\n\n'));
}

/**
 * @deprecated Prefer buildScriptDraft + AI reflow. Kept for punctuation-only
 * fallbacks and tests: one sentence per line when punctuation exists.
 */
export function formatAsSentenceScript(
  transcript: TranscriptResult,
  chapters: VideoChapter[],
): string {
  const segs = cleanedSegments(transcript.segments);
  if (!segs.length) {
    const sentences = splitIntoSentences(cleanCaptionText(transcript.text));
    return sentences.join('\n');
  }

  const full = segs.map((s) => s.text).join(' ');
  const sentences = splitIntoSentences(full);

  if (sentences.length < 2) {
    // No reliable punctuation — return continuous draft (AI should reflow).
    return buildScriptDraft(transcript, chapters);
  }

  // Map sentences to times for chapter bucketing.
  let cursor = 0;
  const pieces: Array<{ start: number; end: number; startSec: number }> = [];
  const parts: string[] = [];
  for (const seg of segs) {
    if (parts.length) {
      parts.push(' ');
      cursor += 1;
    }
    const start = cursor;
    parts.push(seg.text);
    cursor += seg.text.length;
    pieces.push({ start, end: cursor, startSec: seg.startSec });
  }
  const joined = parts.join('');

  const timed = sentences.map((sentence) => {
    const idx = joined.indexOf(sentence, 0);
    const at = idx >= 0 ? idx : 0;
    const piece =
      pieces.find((p) => at >= p.start && at < p.end) ??
      pieces[pieces.length - 1];
    return { startSec: piece?.startSec ?? 0, text: sentence };
  });

  if (chapters.length < 2) {
    return cleanScriptText(timed.map((s) => s.text).join('\n'));
  }

  const buckets: string[][] = chapters.map(() => []);
  for (const line of timed) {
    const idx = pickChapterIndex(line.startSec, chapters);
    buckets[idx]!.push(line.text);
  }

  const blocks: string[] = [];
  for (let i = 0; i < chapters.length; i += 1) {
    const sectionLines = buckets[i]!;
    if (!sectionLines.length) continue;
    const chapter = chapters[i]!;
    blocks.push(
      `${formatChapterHeader(chapter.startSec, chapter.title)}\n\n${sectionLines.join('\n')}`,
    );
  }

  if (!blocks.length) {
    return cleanScriptText(timed.map((s) => s.text).join('\n'));
  }

  return cleanScriptText(blocks.join('\n\n'));
}
