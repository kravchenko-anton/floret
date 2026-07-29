import { ApiProperty } from '@nestjs/swagger';
import { VOTE_PURPOSES, type VotePurpose } from '../../db/schema/votes';

export class VoteResponseDto {
  @ApiProperty({
    enum: VOTE_PURPOSES,
    example: 'script_writing_tool',
  })
  purpose: VotePurpose;

  @ApiProperty({
    example: true,
    description: 'Whether this request counted as a new vote',
  })
  counted: boolean;

  @ApiProperty({
    example: 42,
    description: 'Total votes for this purpose after this request',
  })
  total: number;
}

export class VoteCountsResponseDto {
  @ApiProperty({
    example: {
      name_logo_creation: 3,
      niche_finding: 7,
      audience_pain_points: 12,
      research_tool: 5,
      script_writing_tool: 21,
    },
    description: 'Vote totals per purpose',
  })
  counts: Record<VotePurpose, number>;
}
