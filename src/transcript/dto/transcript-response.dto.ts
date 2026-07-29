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
    example: 'Hey there How are you',
    description: 'Full transcript text joined from segments',
  })
  text: string;
}
