import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { count, eq } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { db } from '../db';
import {
  VOTE_PURPOSES,
  votes,
  type VotePurpose,
} from '../db/schema/votes';
import type { VoteCountsResponseDto, VoteResponseDto } from './dto/vote-response.dto';

@Injectable()
export class VoteService {
  constructor(
    @InjectPinoLogger(VoteService.name)
    private readonly logger: PinoLogger,
  ) {}

  async vote(purposeInput: string, clientIp: string): Promise<VoteResponseDto> {
    const purpose = this.parsePurpose(purposeInput);
    const voterHash = this.hashVoter(clientIp);

    try {
      await db.insert(votes).values({ purpose, voterHash });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Already voted for this purpose. One vote per purpose per visitor — spam is not allowed.',
        );
      }
      throw error;
    }

    const total = await this.countForPurpose(purpose);
    this.logger.info({ purpose, total }, 'Vote recorded');
    return { purpose, counted: true, total };
  }

  async counts(): Promise<VoteCountsResponseDto> {
    const rows = await db
      .select({
        purpose: votes.purpose,
        total: count(),
      })
      .from(votes)
      .groupBy(votes.purpose);

    const counts = Object.fromEntries(
      VOTE_PURPOSES.map((purpose) => [purpose, 0]),
    ) as Record<VotePurpose, number>;

    for (const row of rows) {
      if ((VOTE_PURPOSES as readonly string[]).includes(row.purpose)) {
        counts[row.purpose as VotePurpose] = Number(row.total);
      }
    }

    return { counts };
  }

  private async countForPurpose(purpose: VotePurpose): Promise<number> {
    const [row] = await db
      .select({ total: count() })
      .from(votes)
      .where(eq(votes.purpose, purpose));
    return Number(row?.total ?? 0);
  }

  private parsePurpose(purposeInput: string): VotePurpose {
    if ((VOTE_PURPOSES as readonly string[]).includes(purposeInput)) {
      return purposeInput as VotePurpose;
    }
    throw new UnprocessableEntityException(
      `Invalid purpose. Allowed: ${VOTE_PURPOSES.join(', ')}`,
    );
  }

  private hashVoter(clientIp: string): string {
    const ip = clientIp.trim() || 'unknown';
    return createHash('sha256').update(ip).digest('hex');
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
