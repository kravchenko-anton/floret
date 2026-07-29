import { ApiProperty } from '@nestjs/swagger';
import { VOTE_PURPOSES, type VotePurpose } from '../../db/schema/votes';

export class VoteRequestDto {
  @ApiProperty({
    enum: VOTE_PURPOSES,
    example: 'script_writing_tool',
    description:
      'Which upcoming feature you are voting for. One vote per purpose per IP — repeats are rejected.',
  })
  purpose: VotePurpose;
}
