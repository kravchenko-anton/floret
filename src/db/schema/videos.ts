import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const videos = pgTable('videos', {
  id: uuid('id').defaultRandom().primaryKey(),
  youtubeId: text('youtube_id').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
