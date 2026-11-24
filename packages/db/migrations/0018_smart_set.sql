-- The hive's smart set, stored: the cron rebuilds it every 10 minutes (indexer hive.ts refreshSmartSets) and
-- every reader just selects it. Computing it reads every position and took 40-100 s on the busy VPS, and
-- several readers used to compute it at the same time. Additive only.
CREATE TABLE "smart_set" (
	"scope" text NOT NULL,
	"wallet" text NOT NULL,
	"realized" double precision NOT NULL,
	"trades" integer NOT NULL,
	"tokens" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "smart_set_pk" PRIMARY KEY("scope", "wallet")
);
