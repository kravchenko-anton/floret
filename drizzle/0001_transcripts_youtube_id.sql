ALTER TABLE "transcripts" ADD COLUMN "youtube_id" text;--> statement-breakpoint
UPDATE "transcripts" AS t SET "youtube_id" = v."youtube_id" FROM "videos" AS v WHERE t."video_id" = v."id";--> statement-breakpoint
DELETE FROM "transcripts" WHERE "youtube_id" IS NULL;--> statement-breakpoint
ALTER TABLE "transcripts" ALTER COLUMN "youtube_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transcripts" DROP CONSTRAINT "transcripts_video_id_videos_id_fk";--> statement-breakpoint
ALTER TABLE "transcripts" DROP COLUMN "video_id";--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_youtube_id_unique" UNIQUE("youtube_id");
