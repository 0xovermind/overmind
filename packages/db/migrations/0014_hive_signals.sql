-- Hive signals: board-wide flips of the hive's side on a token, detected every 5 minutes (signals-hive.ts).
-- Hive Pro sees them as they happen; everyone else after a delay.
CREATE TABLE IF NOT EXISTS "hive_signal_state" (
	"token" text PRIMARY KEY NOT NULL,
	"side" text NOT NULL,
	"score" integer,
	"voters" integer NOT NULL DEFAULT 0,
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hive_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"kind" text NOT NULL,
	"side" text NOT NULL,
	"score" integer NOT NULL,
	"prev_side" text,
	"prev_score" integer,
	"voters" integer NOT NULL,
	"price_usd" numeric,
	"market_cap_usd" numeric,
	"at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hive_signals_at_idx" ON "hive_signals" USING btree ("at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hive_signals_token_at_idx" ON "hive_signals" USING btree ("token", "at");
