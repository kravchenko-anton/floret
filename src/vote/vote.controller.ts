import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { VoteRequestDto } from './dto/vote-request.dto';
import { VoteCountsResponseDto, VoteResponseDto } from './dto/vote-response.dto';
import { VoteService } from './vote.service';

@ApiTags('votes')
@Controller('votes')
export class VoteController {
  constructor(private readonly voteService: VoteService) {}

  @Post()
  @ApiOperation({
    summary: 'Cast one vote for an upcoming feature',
    description:
      'Simple interest vote. Anti-spam: one vote per purpose per visitor IP (stored as a hash, not the raw IP). Duplicate votes return 409.',
  })
  @ApiOkResponse({ type: VoteResponseDto })
  @ApiConflictResponse({
    description: 'This visitor already voted for this purpose',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid purpose',
  })
  vote(
    @Body() body: VoteRequestDto,
    @Req() req: Request,
  ): Promise<VoteResponseDto> {
    return this.voteService.vote(body.purpose, this.clientIp(req));
  }

  @Get()
  @ApiOperation({
    summary: 'Get vote totals per purpose',
  })
  @ApiOkResponse({ type: VoteCountsResponseDto })
  counts(): Promise<VoteCountsResponseDto> {
    return this.voteService.counts();
  }

  private clientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]!.trim();
    }
    if (Array.isArray(forwarded) && forwarded[0]) {
      return forwarded[0].split(',')[0]!.trim();
    }
    const ip = req.ip ?? req.socket.remoteAddress;
    if (!ip) {
      throw new UnprocessableEntityException('Could not determine client IP');
    }
    return ip;
  }
}
