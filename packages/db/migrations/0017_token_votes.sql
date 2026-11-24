-- Crowd vote: a one-click bullish/bearish vote on a token page, no account needed. One vote per voter per
-- token (a member id, or a salted hash of the IP for visitors), changeable. Shown next to the hive
-- score, never counted in it (anonymous votes are too easy to farm). Additive only.
CREATE TABLE "token_votes" (
	"token" text NOT NULL,
	"voter" text NOT NULL,
	"stance" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_votes_pk" PRIMARY KEY("token", "voter"),
	CONSTRAINT "token_votes_stance_check" CHECK ("stance" IN ('bullish', 'bearish'))
);
--> statement-breakpoint
CREATE INDEX "token_votes_token_time_idx" ON "token_votes" USING btree ("token", "updated_at");
