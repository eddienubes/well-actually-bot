CREATE TABLE `cache` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cache_hash_unique` ON `cache` (`hash`);