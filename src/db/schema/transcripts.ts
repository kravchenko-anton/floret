import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { videos } from './videos';

export type TranscriptSegment = {
  text: string;
  duration: number;
  offset: number;
  lang?: string;
};

export const transcripts = pgTable('transcripts', {
  id: uuid('id').defaultRandom().primaryKey(),
  videoId: uuid('video_id')
    .notNull()
    .references(() => videos.id, { onDelete: 'cascade' }),
  language: text('language'),
  segments: jsonb('segments').$type<TranscriptSegment[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
