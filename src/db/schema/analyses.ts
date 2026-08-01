import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export type FormatCategory = 'educational' | 'entertainment' | 'mixed';

export type AnalysisKeyMove = {
  name: string;
  description: string;
};

export type AnalysisResult = {
  format: {
    category: FormatCategory;
    flavor: string;
  };
  topicAndAngle: {
    topic: string;
    angle: string;
    commonBeliefChallenge: string;
    constrainReality: string;
  };
  storytellingStructure: {
    keyMoves: AnalysisKeyMove[];
  };
  hookAnalysis: string;
  visualLayout: {
    category: string;
    style: string;
  };
};

export const analyses = pgTable('analyses', {
  id: uuid('id').defaultRandom().primaryKey(),
  youtubeId: text('youtube_id').notNull().unique(),
  result: jsonb('result').$type<AnalysisResult>().notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
