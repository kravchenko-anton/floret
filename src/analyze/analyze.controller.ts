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
      'Fetches the transcript via Apify, runs Groq AI analysis, and caches the result by videoId.',
  })
  @ApiOkResponse({ type: AnalyzeResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Groq authentication failed',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid video ID or AI returned invalid analysis JSON',
  })
  @ApiServiceUnavailableResponse({
    description: 'Transcript unavailable (Apify) or Groq unavailable',
  })
  analyze(@Body() body: AnalyzeRequestDto): Promise<AnalyzeResponseDto> {
    return this.analyzeService.analyze(body.videoId);
  }
}
