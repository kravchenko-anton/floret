import { ConflictException, UnprocessableEntityException } from '@nestjs/common'
import { VoteService } from './vote.service'

jest.mock('../db', () => ({
  db: {
    insert: jest.fn(),
    select: jest.fn(),
  },
}));

import { db } from '../db'

const mockDb = db as unknown as {
  insert: jest.Mock;
  select: jest.Mock;
};

describe('VoteService', () => {
  const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
  let service: VoteService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VoteService(logger as never);
  });

  it('rejects invalid purpose', async () => {
    await expect(service.vote('not_a_purpose', '1.2.3.4')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('records a vote and returns total', async () => {
    const values = jest.fn().mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({ values });
    mockDb.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([{ total: 3 }]),
      }),
    });

    const result = await service.vote('script_writing_tool', '1.2.3.4');

    expect(result).toEqual({
      purpose: 'script_writing_tool',
      counted: true,
      total: 3,
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'script_writing_tool',
        voterHash: expect.any(String),
      }),
    );
  });

  it('rejects duplicate votes (unique constraint)', async () => {
    const values = jest.fn().mockRejectedValue({ code: '23505' });
    mockDb.insert.mockReturnValue({ values });

    await expect(
      service.vote('niche_finding', '1.2.3.4'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
