import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AnalyzeService } from './analyze.service';
import { AnalyzeRequestDto } from './dto/analyze-request.dto';
import { AnalyzeResponseDto } from './dto/analyze-response.dto';

@ApiTags('analyze')
@Controller('analyze')
export class AnalyzeController {
  constructor(private readonly analyzeService: AnalyzeService) {}

  @Post()
  @ApiOperation({
    summary: 'Analyze a YouTube transcript for hooks, CTAs, and rehooks',
    description:
      'Fetches the transcript, runs Cloudflare AI analysis, and caches the result by videoId.',
  })
  @ApiOkResponse({ type: AnalyzeResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Cloudflare AI authentication failed',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid video ID or AI returned invalid analysis JSON',
  })
  @ApiServiceUnavailableResponse({
    description: 'Transcript unavailable or Cloudflare AI unavailable',
  })
  analyze(@Body() body: AnalyzeRequestDto): Promise<AnalyzeResponseDto> {
    return this.analyzeService.analyze(body.videoId);
  }
}
