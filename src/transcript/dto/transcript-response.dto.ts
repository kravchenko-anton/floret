import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TranscriptSegmentDto } from './transcript-segment.dto';

export class TranscriptResponseDto {
  @ApiProperty({ example: 'dQw4w9WgXcQ' })
  videoId: string;

  @ApiPropertyOptional({ example: 'en' })
  language?: string;

  @ApiProperty({ type: [TranscriptSegmentDto] })
  segments: TranscriptSegmentDto[];

  @ApiProperty({
    example:
      '<b>0:00  Intro</b>\n\nThis is Shazam algorithm explained in 90 seconds.\nIt all starts when you press this single button.',
    description:
      'AI-reflowed script: one thought/sentence per line. When the video has chapters/timestamps, sections are prefixed with `<b>MM:SS  Title</b>`.',
  })
  text: string;
}
