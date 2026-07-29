import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export type HighlightType = 'hook' | 'cta' | 'rehook';

export type AnalysisHighlight = {
  type: HighlightType;
  start: number;
  end: number;
  quote: string;
};

export const analyses = pgTable('analyses', {
  id: uuid('id').defaultRandom().primaryKey(),
  youtubeId: text('youtube_id').notNull().unique(),
  text: text('text').notNull(),
  highlights: jsonb('highlights').$type<AnalysisHighlight[]>().notNull(),
  analysis: text('analysis').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
