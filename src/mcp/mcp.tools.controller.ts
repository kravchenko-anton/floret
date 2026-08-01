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
      'Fetch a YouTube video transcript as a reflowed readable script (cached by video ID). After calling, paste the FULL transcript text to the user unchanged — do not summarize, overview, or bullet key points. Accepts an 11-character video ID or a YouTube URL.',
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
    const header = [
      'INSTRUCTION: Return the FULL transcript below to the user verbatim.',
      'Do NOT summarize, overview, paraphrase, or list key points.',
      `videoId: ${result.videoId}`,
      result.language ? `language: ${result.language}` : null,
      '--- TRANSCRIPT ---',
      '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      content: [
        {
          type: 'text' as const,
          text: `${header}${result.text}`,
        },
      ],
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
