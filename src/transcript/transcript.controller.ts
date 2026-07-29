import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { TranscriptResponseDto } from './dto/transcript-response.dto';
import { TranscriptService } from './transcript.service';

@ApiTags('transcripts')
@Controller('transcripts')
export class TranscriptController {
  constructor(private readonly transcriptService: TranscriptService) {}

  @Get(':videoId')
  @ApiOperation({
    summary: 'Fetch a YouTube video transcript',
    description:
      'Returns caption segments and full text for a video ID (or URL-compatible ID). Supports manual and auto-generated captions.',
  })
  @ApiParam({
    name: 'videoId',
    description: 'YouTube video ID (11 characters)',
    example: 'dQw4w9WgXcQ',
  })
  @ApiQuery({
    name: 'lang',
    required: false,
    description: 'Preferred caption language (ISO code)',
    example: 'en',
  })
  @ApiOkResponse({ type: TranscriptResponseDto })
  @ApiNotFoundResponse({
    description:
      'Video unavailable, captions disabled, or requested language not available',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid video ID or transcript fetch failed',
  })
  @ApiServiceUnavailableResponse({
    description:
      'YouTube is rate-limiting or blocking this IP (set YOUTUBE_PROXY_URL)',
  })
  getTranscript(
    @Param('videoId') videoId: string,
    @Query('lang') lang?: string,
  ): Promise<TranscriptResponseDto> {
    return this.transcriptService.fetch(videoId, lang);
  }
}
