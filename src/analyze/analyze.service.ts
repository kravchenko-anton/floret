import {
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AiService } from '../ai/ai.service';
import { db } from '../db';
import {
  analyses,
  type AnalysisKeyMove,
  type AnalysisResult,
  type FormatCategory,
} from '../db/schema';
import { TranscriptService } from '../transcript/transcript.service';
import { ANALYZE_SYSTEM_PROMPT } from './analyze.prompt';
import type { AnalyzeResponseDto } from './dto/analyze-response.dto';

const FORMAT_CATEGORIES: FormatCategory[] = [
  'educational',
  'entertainment',
  'mixed',
];

@Injectable()
export class AnalyzeService {
  constructor(
    private readonly transcriptService: TranscriptService,
    private readonly aiService: AiService,
    @InjectPinoLogger(AnalyzeService.name)
    private readonly logger: PinoLogger,
  ) {}

  async analyze(videoIdInput: string): Promise<AnalyzeResponseDto> {
    const youtubeId = this.transcriptService.extractVideoId(videoIdInput);

    const cached = await db.query.analyses.findFirst({
      where: eq(analyses.youtubeId, youtubeId),
    });

    if (cached?.result) {
      this.logger.info({ youtubeId }, 'Analyze cache hit');
      return this.toResponse(youtubeId, cached.result);
    }

    this.logger.info({ youtubeId }, 'Analyze cache miss; starting analysis');

    const scriptText = await this.transcriptService.getScript(youtubeId);

    this.logger.info(
      {
        youtubeId,
        scriptChars: scriptText.length,
        scriptLines: scriptText.split('\n').length,
        model: this.aiService.model,
      },
      'Running AI analysis',
    );

    const raw = await this.aiService.generateJson(
      ANALYZE_SYSTEM_PROMPT,
      `Script text:\n${scriptText}`,
    );

    let parsed: unknown;
    try {
      parsed = this.parseAiJson(raw);
    } catch (error) {
      this.logger.error(
        {
          youtubeId,
          rawPreview: raw.slice(0, 200),
          message: error instanceof Error ? error.message : String(error),
        },
        'AI returned invalid JSON for analysis',
      );
      throw error;
    }

    let result: AnalysisResult;
    try {
      result = this.normalizeResult(parsed);
    } catch (error) {
      this.logger.error(
        {
          youtubeId,
          message: error instanceof Error ? error.message : String(error),
        },
        'AI analysis payload normalization failed',
      );
      throw error;
    }

    await db
      .insert(analyses)
      .values({
        youtubeId,
        result,
        model: this.aiService.model,
      })
      .onConflictDoUpdate({
        target: analyses.youtubeId,
        set: {
          result,
          model: this.aiService.model,
        },
      });

    this.logger.info({ youtubeId }, 'Analyze completed and cached');

    return this.toResponse(youtubeId, result);
  }

  private toResponse(
    videoId: string,
    result: AnalysisResult,
  ): AnalyzeResponseDto {
    return {
      videoId,
      format: result.format,
      topicAndAngle: result.topicAndAngle,
      storytellingStructure: result.storytellingStructure,
      hookAnalysis: result.hookAnalysis,
      visualLayout: result.visualLayout,
    };
  }

  private parseAiJson(raw: string): unknown {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned) as unknown;
    } catch {
      throw new UnprocessableEntityException(
        'AI returned invalid JSON for analysis',
      );
    }
  }

  private normalizeResult(value: unknown): AnalysisResult {
    if (!value || typeof value !== 'object') {
      throw new UnprocessableEntityException(
        'AI analysis payload missing or invalid',
      );
    }

    const obj = value as Record<string, unknown>;

    return {
      format: this.normalizeFormat(obj.format),
      topicAndAngle: this.normalizeTopicAndAngle(obj.topicAndAngle),
      storytellingStructure: this.normalizeStorytelling(
        obj.storytellingStructure,
      ),
      hookAnalysis: this.requireNonEmptyString(
        obj.hookAnalysis,
        'hookAnalysis',
      ),
      visualLayout: this.normalizeVisualLayout(obj.visualLayout),
    };
  }

  private normalizeFormat(value: unknown): AnalysisResult['format'] {
    if (!value || typeof value !== 'object') {
      throw new UnprocessableEntityException(
        'AI format field missing or invalid',
      );
    }
    const obj = value as Record<string, unknown>;
    const category = obj.category;
    if (
      typeof category !== 'string' ||
      !FORMAT_CATEGORIES.includes(category as FormatCategory)
    ) {
      throw new UnprocessableEntityException(
        'AI format.category missing or invalid',
      );
    }
    return {
      category: category as FormatCategory,
      flavor: this.requireNonEmptyString(obj.flavor, 'format.flavor'),
    };
  }

  private normalizeTopicAndAngle(
    value: unknown,
  ): AnalysisResult['topicAndAngle'] {
    if (!value || typeof value !== 'object') {
      throw new UnprocessableEntityException(
        'AI topicAndAngle field missing or invalid',
      );
    }
    const obj = value as Record<string, unknown>;
    return {
      topic: this.requireNonEmptyString(obj.topic, 'topicAndAngle.topic'),
      angle: this.requireNonEmptyString(obj.angle, 'topicAndAngle.angle'),
      commonBeliefChallenge: this.requireNonEmptyString(
        obj.commonBeliefChallenge,
        'topicAndAngle.commonBeliefChallenge',
      ),
      constrainReality: this.requireNonEmptyString(
        obj.constrainReality,
        'topicAndAngle.constrainReality',
      ),
    };
  }

  private normalizeStorytelling(
    value: unknown,
  ): AnalysisResult['storytellingStructure'] {
    if (!value || typeof value !== 'object') {
      throw new UnprocessableEntityException(
        'AI storytellingStructure field missing or invalid',
      );
    }
    const obj = value as Record<string, unknown>;
    if (!Array.isArray(obj.keyMoves) || !obj.keyMoves.length) {
      throw new UnprocessableEntityException(
        'AI storytellingStructure.keyMoves missing or empty',
      );
    }

    const keyMoves: AnalysisKeyMove[] = [];
    for (const item of obj.keyMoves) {
      if (!item || typeof item !== 'object') continue;
      const move = item as Record<string, unknown>;
      if (typeof move.name !== 'string' || !move.name.trim()) continue;
      if (typeof move.description !== 'string' || !move.description.trim()) {
        continue;
      }
      keyMoves.push({
        name: move.name.trim(),
        description: move.description.trim(),
      });
    }

    if (!keyMoves.length) {
      throw new UnprocessableEntityException(
        'AI storytellingStructure.keyMoves has no usable items',
      );
    }

    return { keyMoves };
  }

  private normalizeVisualLayout(
    value: unknown,
  ): AnalysisResult['visualLayout'] {
    if (!value || typeof value !== 'object') {
      throw new UnprocessableEntityException(
        'AI visualLayout field missing or invalid',
      );
    }
    const obj = value as Record<string, unknown>;
    return {
      category: this.requireNonEmptyString(
        obj.category,
        'visualLayout.category',
      ),
      style: this.requireNonEmptyString(obj.style, 'visualLayout.style'),
    };
  }

  private requireNonEmptyString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new UnprocessableEntityException(
        `AI ${field} field missing or invalid`,
      );
    }
    return value.trim();
  }
}
