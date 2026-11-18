-- Browser push for hive alerts: a member's push subscriptions (one per browser), and when each alert
-- was pushed. Additive only.
CREATE TABLE "push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL REFERENCES "members"("id"),
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "push_subscriptions_member_idx" ON "push_subscriptions" USING btree ("member_id");
--> statement-breakpoint
ALTER TABLE "hive_alerts" ADD COLUMN "pushed_at" timestamp with time zone;
