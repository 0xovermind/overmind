-- Wallet alerts (Hive Pro): members follow wallets and get an alert in the bell when one buys, sells,
-- sends or receives a token. Plus the member's last known $OVHIVE holding, for the holder badge.
-- Additive only.
CREATE TABLE "wallet_watch" (
	"member_id" text NOT NULL REFERENCES "members"("id"),
	"wallet" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_watch_pk" PRIMARY KEY("member_id", "wallet")
);
--> statement-breakpoint
CREATE INDEX "wallet_watch_wallet_idx" ON "wallet_watch" USING btree ("wallet");
--> statement-breakpoint
CREATE TABLE "wallet_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL REFERENCES "members"("id"),
	"wallet" text NOT NULL,
	"kind" text NOT NULL,
	"token" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"usd" numeric,
	"counterparty" text,
	"tx" text NOT NULL,
	"log_index" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"pushed_at" timestamp with time zone,
	CONSTRAINT "wallet_alerts_kind_check" CHECK ("kind" IN ('buy', 'sell', 'in', 'out')),
	CONSTRAINT "wallet_alerts_once" UNIQUE ("member_id", "wallet", "tx", "log_index")
);
--> statement-breakpoint
CREATE INDEX "wallet_alerts_member_idx" ON "wallet_alerts" USING btree ("member_id", "created_at");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "transfers_from_time_idx" ON "transfers" USING btree ("from", "time");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "transfers_to_time_idx" ON "transfers" USING btree ("to", "time");
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "ovhive_balance" numeric;
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "ovhive_checked_at" timestamp with time zone;
