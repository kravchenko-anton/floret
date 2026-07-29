import { ApiProperty } from '@nestjs/swagger';

export class AnalysisHighlightDto {
  @ApiProperty({
    enum: ['hook', 'cta', 'rehook'],
    example: 'hook',
  })
  type: 'hook' | 'cta' | 'rehook';

  @ApiProperty({
    example: 0,
    description: 'Inclusive start character offset in text',
  })
  start: number;

  @ApiProperty({
    example: 42,
    description: 'Exclusive end character offset in text',
  })
  end: number;

  @ApiProperty({ example: 'Hey, stop scrolling for a second' })
  quote: string;
}

export class AnalyzeResponseDto {
  @ApiProperty({
    example:
      '0:00  Intro\n\nThis is Shazam algorithm explained in 90 seconds.\nIt all starts when you press this single button.',
    description:
      'Transcript as a script: one sentence per line. When the video has chapters/timestamps, sections are prefixed with `MM:SS  Title` (two spaces). Chapter headers are omitted when the video has no timestamps.',
  })
  text: string;

  @ApiProperty({ type: [AnalysisHighlightDto] })
  highlights: AnalysisHighlightDto[];

  @ApiProperty({
    example:
      'Strong opening hook that creates curiosity, followed by a mid-video rehook and a clear end CTA.',
  })
  analysis: string;
}
