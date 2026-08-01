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
    summary: 'Fetch a YouTube video transcript as a formatted script',
    description:
      'Fetches captions via Apify, reflows them into a readable script with AI (chapter headers when available), and caches segments + script by video ID.',
  })
  @ApiParam({
    name: 'videoId',
    description: 'YouTube video ID (11 characters)',
    example: 'dQw4w9WgXcQ',
  })
  @ApiQuery({
    name: 'lang',
    required: false,
    description: 'Preferred caption language (ISO 639-1 code)',
    example: 'en',
  })
  @ApiOkResponse({ type: TranscriptResponseDto })
  @ApiNotFoundResponse({
    description: 'No captions available for this video',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid video ID',
  })
  @ApiServiceUnavailableResponse({
    description: 'APIFY_TOKEN missing or Apify actor run failed',
  })
  getTranscript(
    @Param('videoId') videoId: string,
    @Query('lang') lang?: string,
  ): Promise<TranscriptResponseDto> {
    return this.transcriptService.fetch(videoId, lang);
  }
}
