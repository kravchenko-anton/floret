import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TranscriptSegmentDto {
  @ApiProperty({ example: 'Hey there' })
  text: string;

  @ApiProperty({
    example: 1.54,
    description: 'Segment duration in seconds',
  })
  duration: number;

  @ApiProperty({
    example: 0,
    description: 'Start offset in seconds',
  })
  offset: number;

  @ApiPropertyOptional({ example: 'en' })
  lang?: string;
}
