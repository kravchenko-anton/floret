import { ApiProperty } from '@nestjs/swagger';

export class AnalyzeFormatDto {
  @ApiProperty({
    enum: ['educational', 'entertainment', 'mixed'],
    example: 'educational',
  })
  category!: 'educational' | 'entertainment' | 'mixed';

  @ApiProperty({ example: 'explainer with personality' })
  flavor!: string;
}

export class AnalyzeTopicAndAngleDto {
  @ApiProperty({ example: 'How Shazam identifies songs in seconds' })
  topic!: string;

  @ApiProperty({
    example: 'It is not magic — it is a fingerprint of peaks in the audio',
  })
  angle!: string;

  @ApiProperty({
    example: 'People think song ID needs the full track or a huge database search',
  })
  commonBeliefChallenge!: string;

  @ApiProperty({
    example: 'Only a tiny constellation of frequency peaks is enough to match',
  })
  constrainReality!: string;
}

export class AnalyzeKeyMoveDto {
  @ApiProperty({ example: 'cold open' })
  name!: string;

  @ApiProperty({
    example: 'Starts with the mystery of recognizing any song in under a second',
  })
  description!: string;
}

export class AnalyzeStorytellingStructureDto {
  @ApiProperty({ type: [AnalyzeKeyMoveDto] })
  keyMoves!: AnalyzeKeyMoveDto[];
}

export class AnalyzeVisualLayoutDto {
  @ApiProperty({ example: 'talking-head + b-roll' })
  category!: string;

  @ApiProperty({ example: 'fast cuts, on-screen diagrams, high energy' })
  style!: string;
}

export class AnalyzeResponseDto {
  @ApiProperty({ example: 'dQw4w9WgXcQ' })
  videoId!: string;

  @ApiProperty({ type: AnalyzeFormatDto })
  format!: AnalyzeFormatDto;

  @ApiProperty({ type: AnalyzeTopicAndAngleDto })
  topicAndAngle!: AnalyzeTopicAndAngleDto;

  @ApiProperty({ type: AnalyzeStorytellingStructureDto })
  storytellingStructure!: AnalyzeStorytellingStructureDto;

  @ApiProperty({
    example:
      'Opens with a curiosity gap about instantaneous recognition, then proves the mechanism.',
  })
  hookAnalysis!: string;

  @ApiProperty({ type: AnalyzeVisualLayoutDto })
  visualLayout!: AnalyzeVisualLayoutDto;
}
