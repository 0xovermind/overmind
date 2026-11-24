-- Launch radar: a first-minute report per Pons launch (indexer agents/radar.ts). Plus 'exit' wallet alerts:
-- the dev, a top holder or a dev-funded wallet is selling a token a member holds. Additive only.
CREATE TABLE IF NOT EXISTS "launch_reports" (
	"token" text PRIMARY KEY NOT NULL,
	"report" jsonb NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "launch_reports_created_idx" ON "launch_reports" USING btree ("created_at");
--> statement-breakpoint
ALTER TABLE "wallet_alerts" DROP CONSTRAINT IF EXISTS "wallet_alerts_kind_check";
--> statement-breakpoint
ALTER TABLE "wallet_alerts" ADD CONSTRAINT "wallet_alerts_kind_check" CHECK ("kind" IN ('buy', 'sell', 'in', 'out', 'coexit', 'exit'));
