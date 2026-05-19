CREATE TABLE `playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`folder_path` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playlists_folder_path_unique` ON `playlists` (`folder_path`);--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `songs_playlist_path` ON `songs` (`playlist_id`,`path`);