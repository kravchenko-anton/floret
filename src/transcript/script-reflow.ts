import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import {
  fetchVideoChapters,
  formatChapterHeader,
  type VideoChapter,
} from '../analyze/chapters';
import {
  buildIndexedScriptDraft,
  buildScriptDraft,
  formatScriptFromLineEnds,
  formatScriptWithBoundedLines,
  hasCaptionNoise,
  isCurrentScriptFormat,
  sameSpokenWords,
} from '../analyze/script-format';
import type { TranscriptSegment } from '../db/schema';

type TranscriptForReflow = {
  videoId: string;
  segments: TranscriptSegment[];
  text: string;
};

const SCRIPT_REFLOW_PROMPT = `You choose natural line breaks for a YouTube transcript.

Every spoken word has a stable numeric index like [42]word. Do not reproduce or edit the transcript.
Return ONLY valid JSON with this exact shape:
{"lineEnds":[12,27,42]}

Rules:
- Each number is the inclusive index of the final word on one spoken thought / natural sentence.
- Keep lines concise and readable, usually 8–25 words and never more than 40 words.
- Include the final word index of every chapter as a line ending. Never make a line cross a chapter header.
- Include every word exactly once by selecting ordered line endings.
- Do not return markdown fences, transcript text, chapter headers, or commentary.`;

type AiLineEndsPayload = {
  lineEnds?: unknown;
};

@Injectable()
export class ScriptReflowService {
  constructor(
    private readonly aiService: AiService,
    @InjectPinoLogger(ScriptReflowService.name)
    private readonly logger: PinoLogger,
  ) {}

  isUsableScript(scriptText: string | null | undefined): boolean {
    return Boolean(
      scriptText &&
        isCurrentScriptFormat(scriptText) &&
        !hasCaptionNoise(scriptText),
    );
  }

  async buildScript(transcript: TranscriptForReflow): Promise<string> {
    const chapters = await fetchVideoChapters(transcript.videoId);
    const draft = buildScriptDraft(transcript, chapters);

    this.logger.info(
      {
        youtubeId: transcript.videoId,
        segments: transcript.segments.length,
        chapters: chapters.length,
        draftChars: draft.length,
        model: this.aiService.model,
      },
      'Running AI script reflow',
    );

    return this.reflowScriptWithAi(draft, chapters);
  }

  private async reflowScriptWithAi(
    draft: string,
    chapters: VideoChapter[],
  ): Promise<string> {
    const indexed = buildIndexedScriptDraft(draft);
    if (!indexed.wordCount) return formatScriptWithBoundedLines(draft);

    const chapterHeaders =
      chapters.length >= 2
        ? chapters
            .map((chapter) =>
              formatChapterHeader(chapter.startSec, chapter.title),
            )
            .join('\n')
        : '(none)';
    const request = [
      `WORD COUNT: ${indexed.wordCount}`,
      `REQUIRED CHAPTER-END INDEXES: ${indexed.chapterEndIndexes.join(', ')}`,
      `CHAPTER HEADERS:\n${chapterHeaders}`,
      `INDEXED TRANSCRIPT:\n${indexed.annotated}`,
    ].join('\n\n');

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const correction =
        attempt === 1
          ? ''
          : '\n\nYour previous response was invalid or produced an oversized line. Return complete, ordered lineEnds JSON and obey every required chapter-end index.';
      const raw = await this.aiService.generateJson(
        SCRIPT_REFLOW_PROMPT,
        request + correction,
      );
      const lineEnds = this.parseLineEnds(raw);
      const formatted = formatScriptFromLineEnds(draft, lineEnds);

      if (
        formatted &&
        sameSpokenWords(draft, formatted) &&
        isCurrentScriptFormat(formatted)
      ) {
        return formatted;
      }

      this.logger.warn(
        {
          attempt,
          rawPreview: raw.slice(0, 180),
          requiredChapterEnds: indexed.chapterEndIndexes,
        },
        'AI returned invalid script line boundaries',
      );
    }

    this.logger.warn(
      { words: indexed.wordCount },
      'AI script boundary retries exhausted; using bounded fallback',
    );
    return formatScriptWithBoundedLines(draft);
  }

  private parseLineEnds(raw: string): unknown {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return (JSON.parse(cleaned) as AiLineEndsPayload).lineEnds;
    } catch {
      return undefined;
    }
  }
}
