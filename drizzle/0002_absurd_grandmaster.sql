PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`done` integer NOT NULL,
	`priority` text DEFAULT 'Nízká' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_todos`("id", "title", "done", "priority") SELECT "id", "title", "done", "priority" FROM `todos`;--> statement-breakpoint
DROP TABLE `todos`;--> statement-breakpoint
ALTER TABLE `__new_todos` RENAME TO `todos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;