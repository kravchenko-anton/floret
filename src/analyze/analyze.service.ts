import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AiService } from '../ai/ai.service';
import { db } from '../db';
import {
  analyses,
  type AnalysisHighlight,
  type HighlightType,
} from '../db/schema';
import { TranscriptService } from '../transcript/transcript.service';
import type { AnalyzeResponseDto } from './dto/analyze-response.dto';

const SYSTEM_PROMPT = `You analyze YouTube video transcripts for creators.
Return ONLY valid JSON (no markdown fences, no commentary) with this exact shape:
{
  "highlights": [
    { "type": "hook" | "cta" | "rehook", "start": number, "end": number, "quote": string }
  ],
  "analysis": string
}

Rules:
- "start" and "end" are character offsets into the transcript text provided by the user (0-based, end exclusive).
- "quote" must be the exact substring text.slice(start, end).
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

    if (cached) {
      return {
        text: cached.text,
        highlights: cached.highlights,
        analysis: cached.analysis,
      };
    }

    const transcript = await this.transcriptService.fetch(youtubeId);

    const raw = await this.aiService.generateJson(
      SYSTEM_PROMPT,
      `Transcript text:\n${transcript.text}`,
    );

    const parsed = this.parseAiJson(raw);
    const highlights = this.normalizeHighlights(parsed.highlights, transcript.text);
    const analysis = this.normalizeAnalysis(parsed.analysis);

    await db.insert(analyses).values({
      youtubeId,
      text: transcript.text,
      highlights,
      analysis,
      model: this.aiService.model,
    });

    return {
      text: transcript.text,
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
  ): AnalysisHighlight[] {
    if (!Array.isArray(value)) {
      throw new UnprocessableEntityException(
        'AI highlights field missing or invalid',
      );
    }

    const allowed: HighlightType[] = ['hook', 'cta', 'rehook'];
    const highlights: AnalysisHighlight[] = [];

    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const type = row.type;
      const start = row.start;
      const end = row.end;
      let quote = row.quote;

      if (typeof type !== 'string' || !allowed.includes(type as HighlightType)) {
        continue;
      }
      if (typeof start !== 'number' || typeof end !== 'number') continue;
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (start < 0 || end > text.length || start >= end) continue;

      const slice = text.slice(start, end);
      const normalizedQuote =
        typeof quote === 'string' && quote.trim() ? slice : slice;

      highlights.push({
        type: type as HighlightType,
        start,
        end,
        quote: normalizedQuote,
      });
    }

    if (!highlights.length) {
      throw new ServiceUnavailableException(
        'AI returned no usable highlights',
      );
    }

    return highlights;
  }
}
