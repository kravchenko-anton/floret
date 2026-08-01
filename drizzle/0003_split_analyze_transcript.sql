ALTER TABLE "transcripts" ADD COLUMN "script_text" text;--> statement-breakpoint
DELETE FROM "analyses";--> statement-breakpoint
ALTER TABLE "analyses" DROP COLUMN "text";--> statement-breakpoint
ALTER TABLE "analyses" DROP COLUMN "highlights";--> statement-breakpoint
ALTER TABLE "analyses" DROP COLUMN "analysis";--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "result" jsonb NOT NULL;
