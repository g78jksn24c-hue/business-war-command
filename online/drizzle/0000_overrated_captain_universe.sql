CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_event` ON `audit` (`event_id`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_companies_event` ON `companies` (`event_id`);--> statement-breakpoint
CREATE TABLE `app_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`day` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`gate` text DEFAULT '' NOT NULL,
	`settled` integer DEFAULT 0 NOT NULL,
	`snapshot` text,
	`boss` integer DEFAULT 30 NOT NULL,
	`finance` integer DEFAULT 20 NOT NULL,
	`staff` integer DEFAULT 50 NOT NULL,
	`staff_mode` text DEFAULT 'equal' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`hash` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`role` text NOT NULL,
	`person_id` text,
	`expires_at` text NOT NULL,
	`consumed_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_invites_event` ON `invites` (`event_id`);--> statement-breakpoint
CREATE TABLE `persons` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`company_id` text,
	`position` text DEFAULT 'staff' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`user_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_persons_event_company` ON `persons` (`event_id`,`company_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_persons_event_user` ON `persons` (`event_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`person_id` text NOT NULL,
	`day` integer NOT NULL,
	`amount` integer NOT NULL,
	`category` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`submit_by` text NOT NULL,
	`submit_at` text NOT NULL,
	`review_by` text,
	`review_at` text,
	`reject_reason` text DEFAULT '' NOT NULL,
	`request_id` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_records_event_status` ON `records` (`event_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_records_person_day` ON `records` (`person_id`,`day`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_records_request` ON `records` (`submit_by`,`request_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`event_id` text,
	`created_at` text NOT NULL
);
