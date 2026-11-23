-- Hive signals per scope: 'all' (the whole chain) and 'pons' (Pons launches, read by their own smart set).
ALTER TABLE "hive_signals" ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'all';
--> statement-breakpoint
ALTER TABLE "hive_signal_state" ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'all';
--> statement-breakpoint
ALTER TABLE "hive_signal_state" DROP CONSTRAINT IF EXISTS "hive_signal_state_pkey";
--> statement-breakpoint
ALTER TABLE "hive_signal_state" ADD PRIMARY KEY ("scope", "token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hive_signals_scope_at_idx" ON "hive_signals" USING btree ("scope", "at");
