import type { TranscriptResult } from '../transcript/transcript.service';
import {
  formatChapterHeader,
  type VideoChapter,
} from './chapters';

const CHAPTER_HEADER_RE = /^\d{1,2}:\d{2}(?::\d{2})? {2}.+$/;

export function isScriptFormattedText(text: string): boolean {
  return text.includes('\n');
}

export function isChapterHeaderLine(line: string): boolean {
  return CHAPTER_HEADER_RE.test(line.trimEnd());
}

export function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  return normalized
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type TimedLine = {
  startSec: number;
  text: string;
};

/** youtube-transcript offsets/durations are milliseconds. */
function offsetMsToSec(offsetMs: number): number {
  return offsetMs / 1000;
}

function cleanSegmentText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * One cleaned caption segment per line — used when ASR has no sentence punctuation.
 */
function linesFromSegments(
  segments: TranscriptResult['segments'],
): TimedLine[] {
  return segments
    .map((s) => ({
      startSec: offsetMsToSec(s.offset),
      text: cleanSegmentText(s.text),
    }))
    .filter((s) => s.text);
}

/**
 * Prefer punctuation-based sentences when the transcript has real sentence breaks.
 * Otherwise fall back to one caption segment per line.
 */
function linesFromTranscript(
  transcript: TranscriptResult,
): TimedLine[] {
  const segmentLines = linesFromSegments(transcript.segments);
  if (!segmentLines.length) {
    return splitIntoSentences(transcript.text).map((text) => ({
      startSec: 0,
      text,
    }));
  }

  // Build continuous string with index → segment time map, then sentence-split.
  let cursor = 0;
  const pieces: Array<{ start: number; end: number; startSec: number }> = [];
  const parts: string[] = [];

  for (const seg of segmentLines) {
    if (parts.length) {
      parts.push(' ');
      cursor += 1;
    }
    const start = cursor;
    parts.push(seg.text);
    cursor += seg.text.length;
    pieces.push({ start, end: cursor, startSec: seg.startSec });
  }

  const full = parts.join('');
  const sentences = splitIntoSentences(full);

  // Unpunctuated ASR usually yields a single blob — use segments instead.
  if (sentences.length < 2) {
    return segmentLines;
  }

  const timed: TimedLine[] = [];
  let searchFrom = 0;

  for (const sentence of sentences) {
    const idx = full.indexOf(sentence, searchFrom);
    const at = idx >= 0 ? idx : searchFrom;
    const piece =
      pieces.find((p) => at >= p.start && at < p.end) ??
      pieces[pieces.length - 1];
    timed.push({
      startSec: piece?.startSec ?? 0,
      text: sentence,
    });
    searchFrom = at + sentence.length;
  }

  return timed;
}

function pickChapterIndex(startSec: number, chapters: VideoChapter[]): number {
  let idx = 0;
  for (let i = 0; i < chapters.length; i += 1) {
    if (chapters[i]!.startSec <= startSec) idx = i;
    else break;
  }
  return idx;
}

/**
 * Build analyze `text`: one sentence (or caption segment) per line.
 * When chapters exist, prefix each section with `MM:SS  Title` (two spaces).
 */
export function formatAsSentenceScript(
  transcript: TranscriptResult,
  chapters: VideoChapter[],
): string {
  const lines = linesFromTranscript(transcript);

  if (!lines.length) {
    return transcript.text.trim();
  }

  if (chapters.length < 2) {
    return lines.map((s) => s.text).join('\n');
  }

  const buckets: string[][] = chapters.map(() => []);
  for (const line of lines) {
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
    return lines.map((s) => s.text).join('\n');
  }

  return blocks.join('\n\n');
}
