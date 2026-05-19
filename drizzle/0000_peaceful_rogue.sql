CREATE TYPE "public"."option_kind" AS ENUM('home', 'restaurant');--> statement-breakpoint
CREATE TABLE "dinner_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_id" uuid NOT NULL,
	"eaten_on" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dinner_log_option_eaten_on_unique" UNIQUE("option_id","eaten_on")
);
--> statement-breakpoint
CREATE TABLE "option_tags" (
	"option_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "option_tags_option_id_tag_id_pk" PRIMARY KEY("option_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "option_kind" NOT NULL,
	"url" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"address" text,
	"phone" text,
	"lat" double precision,
	"lng" double precision,
	"google_place_id" text,
	"maps_url" text
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dinner_log" ADD CONSTRAINT "dinner_log_option_id_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_tags" ADD CONSTRAINT "option_tags_option_id_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_tags" ADD CONSTRAINT "option_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "option_tags_tag_id_idx" ON "option_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_lower_name_unique" ON "tags" USING btree (lower("name"));