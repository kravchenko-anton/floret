import { Ctx, Payload } from '@nestjs/microservices';
import { McpController, McpContext, Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { AnalyzeService } from '../analyze/analyze.service';
import { TranscriptService } from '../transcript/transcript.service';

@McpController()
export class McpToolsController {
  constructor(
    private readonly transcriptService: TranscriptService,
    private readonly analyzeService: AnalyzeService,
  ) {}

  @Tool({
    name: 'get_transcript',
    description:
      'Fetch a YouTube video transcript as a reflowed readable script (cached by video ID). Accepts an 11-character video ID or a YouTube URL.',
    parameters: z.object({
      videoId: z
        .string()
        .describe('YouTube video ID (11 chars) or full YouTube URL'),
      lang: z
        .string()
        .optional()
        .describe('Preferred caption language (ISO 639-1), e.g. en'),
    }),
  })
  async getTranscript(
    @Payload()
    { videoId, lang }: { videoId: string; lang?: string },
    @Ctx() _ctx: McpContext,
  ) {
    const result = await this.transcriptService.fetch(videoId, lang);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  }

  @Tool({
    name: 'analyze_video',
    description:
      'Analyze a YouTube video script for format, angle, storytelling, hooks, and visuals. Loads/reflows the transcript if needed and caches the analysis by video ID.',
    parameters: z.object({
      videoId: z
        .string()
        .describe('YouTube video ID (11 chars) or full YouTube URL'),
    }),
  })
  async analyzeVideo(
    @Payload() { videoId }: { videoId: string },
    @Ctx() _ctx: McpContext,
  ) {
    const result = await this.analyzeService.analyze(videoId);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  }
}
