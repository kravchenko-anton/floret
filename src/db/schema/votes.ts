import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const VOTE_PURPOSES = [
  'name_logo_creation',
  'niche_finding',
  'audience_pain_points',
  'research_tool',
  'script_writing_tool',
] as const;

export type VotePurpose = (typeof VOTE_PURPOSES)[number];

export const votes = pgTable(
  'votes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    purpose: text('purpose').$type<VotePurpose>().notNull(),
    /** SHA-256 of client IP — one vote per purpose per voter, no raw IPs stored. */
    voterHash: text('voter_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique('votes_purpose_voter_hash_unique').on(table.purpose, table.voterHash)],
);
