import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const playlists = sqliteTable("playlists", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	folderPath: text("folder_path").notNull().unique(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export type Playlist = typeof playlists.$inferSelect;
export type NewPlaylist = typeof playlists.$inferInsert;
