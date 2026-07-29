import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AiService } from '../ai/ai.service';
import { db } from '../db';
import { analyses } from '../db/schema';
import { TranscriptService } from '../transcript/transcript.service';
import { fetchVideoChapters } from './chapters';
import type { AnalyzeResponseDto } from './dto/analyze-response.dto';
import { normalizeHighlightItems } from './highlight-normalize';
import {
  formatAsSentenceScript,
  isScriptFormattedText,
} from './script-format';

const SYSTEM_PROMPT = `You analyze YouTube video transcripts for creators.
The transcript is a SCRIPT:
- one sentence per line
- optional chapter headers look like "0:00  Title" (timestamp, two spaces, title) — these are section titles, NOT spoken dialogue

Return ONLY valid JSON (no markdown fences, no commentary) with this exact shape:
{
  "highlights": [
    { "type": "hook" | "cta" | "rehook", "start": number, "end": number, "quote": string }
  ],
  "analysis": string
}

Rules:
- "start" and "end" are character offsets into the script text provided by the user (0-based, end exclusive), including newline characters.
- "quote" must be the exact substring text.slice(start, end).
- NEVER cut a word in half. Boundaries must fall on whitespace, newlines, or punctuation — not mid-word.
- Do NOT highlight chapter header lines ("MM:SS  Title"). Highlight spoken sentences only.
- Prefer whole sentences or whole clauses.
- type meanings:
  - hook: opening attention grabber
  - rehook: mid-content device that re-engages attention
  - cta: call to action (subscribe, comment, click, buy, etc.)
- Prefer a small set of high-signal highlights (typically 3–10).
- "analysis" is a concise plain-text assessment of hooks, CTAs, rehooks, and overall retention structure.`;

type AiAnalysisPayload = {
  highlights?: unknown;
  analysis?: unknown;
};

@Injectable()
export class AnalyzeService {
  constructor(
    private readonly transcriptService: TranscriptService,
    private readonly aiService: AiService,
  ) {}

  async analyze(videoIdInput: string): Promise<AnalyzeResponseDto> {
    const youtubeId = this.transcriptService.extractVideoId(videoIdInput);

    const cached = await db.query.analyses.findFirst({
      where: eq(analyses.youtubeId, youtubeId),
    });

    if (cached && isScriptFormattedText(cached.text)) {
      return {
        text: cached.text,
        highlights: cached.highlights,
        analysis: cached.analysis,
      };
    }

    const transcript = await this.transcriptService.fetch(youtubeId);
    const chapters = await fetchVideoChapters(youtubeId);
    const scriptText = formatAsSentenceScript(transcript, chapters);

    const raw = await this.aiService.generateJson(
      SYSTEM_PROMPT,
      `Script text:\n${scriptText}`,
    );

    const parsed = this.parseAiJson(raw);
    const highlights = this.normalizeHighlights(parsed.highlights, scriptText);
    const analysis = this.normalizeAnalysis(parsed.analysis);

    await db
      .insert(analyses)
      .values({
        youtubeId,
        text: scriptText,
        highlights,
        analysis,
        model: this.aiService.model,
      })
      .onConflictDoUpdate({
        target: analyses.youtubeId,
        set: {
          text: scriptText,
          highlights,
          analysis,
          model: this.aiService.model,
        },
      });

    return {
      text: scriptText,
      highlights,
      analysis,
    };
  }

  private parseAiJson(raw: string): AiAnalysisPayload {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned) as AiAnalysisPayload;
    } catch {
      throw new UnprocessableEntityException(
        'AI returned invalid JSON for analysis',
      );
    }
  }

  private normalizeAnalysis(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new UnprocessableEntityException(
        'AI analysis field missing or invalid',
      );
    }
    return value.trim();
  }

  private normalizeHighlights(
    value: unknown,
    text: string,
  ): AnalyzeResponseDto['highlights'] {
    const highlights = normalizeHighlightItems(value, text);

    if (!Array.isArray(value)) {
      throw new UnprocessableEntityException(
        'AI highlights field missing or invalid',
      );
    }

    if (!highlights.length) {
      throw new ServiceUnavailableException(
        'AI returned no usable highlights',
      );
    }

    return highlights;
  }
}
