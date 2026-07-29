import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export type TranscriptSegment = {
  text: string;
  duration: number;
  offset: number;
  lang?: string;
};

export const transcripts = pgTable('transcripts', {
  id: uuid('id').defaultRandom().primaryKey(),
  youtubeId: text('youtube_id').notNull().unique(),
  language: text('language'),
  segments: jsonb('segments').$type<TranscriptSegment[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
