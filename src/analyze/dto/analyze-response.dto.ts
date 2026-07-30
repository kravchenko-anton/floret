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
      '<b>0:00  Intro</b>\n\nThis is Shazam algorithm explained in 90 seconds.\nIt all starts when you press this single button.',
    description:
      'Transcript as a script: one thought/sentence per line (AI-reflowed). When the video has chapters/timestamps, sections are prefixed with `<b>MM:SS  Title</b>` (bold tags, timestamp, two spaces, title). Chapter headers are omitted when the video has no timestamps.',
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
