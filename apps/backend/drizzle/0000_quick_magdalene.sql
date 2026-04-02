CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`parent_agent_id` text,
	`name` text,
	`model` text,
	`team_name` text,
	`is_sidechain` integer DEFAULT 0 NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`ended_at` integer,
	`metadata` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agents_session_id_idx` ON `agents` (`session_id`);--> statement-breakpoint
CREATE INDEX `agents_parent_agent_id_idx` ON `agents` (`parent_agent_id`);--> statement-breakpoint
CREATE TABLE `event_blobs` (
	`event_id` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`session_id` text NOT NULL,
	`agent_id` text,
	`sequence_num` integer NOT NULL,
	`event_type` text NOT NULL,
	`timestamp` integer NOT NULL,
	`payload` text NOT NULL,
	`is_truncated` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_session_event_id_uq` ON `events` (`session_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `events_session_seq_idx` ON `events` (`session_id`,`sequence_num`);--> statement-breakpoint
CREATE INDEX `events_session_ts_idx` ON `events` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `events_agent_ts_idx` ON `events` (`agent_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `events_event_type_idx` ON `events` (`event_type`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`slug` text,
	`cwd` text,
	`transcript_path` text,
	`model` text,
	`ingestion_source` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`ended_at` integer,
	`root_agent_id` text,
	`metadata` text
);
--> statement-breakpoint
CREATE INDEX `sessions_created_at_idx` ON `sessions` (`created_at`);--> statement-breakpoint
CREATE INDEX `sessions_status_idx` ON `sessions` (`status`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`sequence_num` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`state` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `snapshots_session_seq_idx` ON `snapshots` (`session_id`,`sequence_num`);--> statement-breakpoint
CREATE TABLE `token_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`agent_id` text,
	`timestamp` integer NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `token_usage_session_id_idx` ON `token_usage` (`session_id`);--> statement-breakpoint
CREATE INDEX `token_usage_agent_id_idx` ON `token_usage` (`agent_id`);--> statement-breakpoint
CREATE INDEX `token_usage_timestamp_idx` ON `token_usage` (`timestamp`);--> statement-breakpoint
CREATE TABLE `tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`agent_id` text,
	`tool_name` text NOT NULL,
	`phase` text DEFAULT 'pre' NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_ms` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tool_calls_session_started_idx` ON `tool_calls` (`session_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `tool_calls_tool_name_idx` ON `tool_calls` (`tool_name`);--> statement-breakpoint
CREATE INDEX `tool_calls_agent_id_idx` ON `tool_calls` (`agent_id`);