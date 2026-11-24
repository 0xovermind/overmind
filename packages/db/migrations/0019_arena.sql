-- Arena: the hive (smart-wallet signals), the crowd (one-click votes) and the AI agent (@overmind_ai calls) each
-- make bullish/bearish calls; every call is stored with the price at the call and scored against the price
-- 1h, 24h and 7d later (indexer agents/arena.ts). Plus 'coexit' wallet alerts: the wallets that bought a
-- token together with a member are leaving it. Additive only.
CREATE TABLE IF NOT EXISTS "arena_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"token" text NOT NULL,
	"stance" text NOT NULL,
	"price_usd" double precision NOT NULL,
	"mcap_usd" double precision,
	"weight" integer,
	"at" timestamp with time zone NOT NULL,
	"price_1h" double precision,
	"price_24h" double precision,
	"price_7d" double precision,
	CONSTRAINT "arena_calls_source_check" CHECK ("source" IN ('hive', 'crowd', 'ai')),
	CONSTRAINT "arena_calls_stance_check" CHECK ("stance" IN ('bullish', 'bearish'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "arena_calls_at_idx" ON "arena_calls" USING btree ("at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "arena_calls_source_token_idx" ON "arena_calls" USING btree ("source", "token", "at");
--> statement-breakpoint
ALTER TABLE "wallet_alerts" DROP CONSTRAINT IF EXISTS "wallet_alerts_kind_check";
--> statement-breakpoint
ALTER TABLE "wallet_alerts" ADD CONSTRAINT "wallet_alerts_kind_check" CHECK ("kind" IN ('buy', 'sell', 'in', 'out', 'coexit'));
