-- Watchlists and hive alerts: members star tokens, and get an alert when the hive's reading of a
-- starred token flips (selling -> buying or back). Additive only; touches no existing table.
CREATE TABLE "watchlist" (
	"member_id" text NOT NULL REFERENCES "members"("id"),
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_pk" PRIMARY KEY("member_id", "token")
);
--> statement-breakpoint
CREATE INDEX "watchlist_token_idx" ON "watchlist" USING btree ("token");
--> statement-breakpoint
-- The last hive reading of every watched token: what a flip is measured against.
CREATE TABLE "hive_watch_state" (
	"token" text PRIMARY KEY NOT NULL,
	"side" text NOT NULL,
	"score" integer,
	"voters" integer NOT NULL DEFAULT 0,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hive_watch_state_side_check" CHECK ("side" IN ('buying', 'selling', 'split'))
);
--> statement-breakpoint
CREATE TABLE "hive_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL REFERENCES "members"("id"),
	"token" text NOT NULL,
	"side" text NOT NULL,
	"score" integer,
	"prev_side" text,
	"prev_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "hive_alerts_side_check" CHECK ("side" IN ('buying', 'selling'))
);
--> statement-breakpoint
CREATE INDEX "hive_alerts_member_idx" ON "hive_alerts" USING btree ("member_id", "created_at");
