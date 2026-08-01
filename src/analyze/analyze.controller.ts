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
    summary:
      'Analyze a YouTube script for format, angle, storytelling, hook, and visuals',
    description:
      'Loads the reflowed script (via /transcripts pipeline if needed), runs a structured Alibaba Model Studio (Qwen) analysis, and caches the result by videoId.',
  })
  @ApiOkResponse({ type: AnalyzeResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Alibaba Model Studio authentication failed',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid video ID or AI returned invalid analysis JSON',
  })
  @ApiServiceUnavailableResponse({
    description:
      'Transcript unavailable (Apify) or Alibaba Model Studio unavailable',
  })
  analyze(@Body() body: AnalyzeRequestDto): Promise<AnalyzeResponseDto> {
    return this.analyzeService.analyze(body.videoId);
  }
}
