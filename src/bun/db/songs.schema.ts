import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { playlists } from "./playlists.schema";

export const songs = sqliteTable(
	"songs",
	{
		id: text("id").primaryKey(),
		playlistId: text("playlist_id")
			.notNull()
			.references(() => playlists.id, { onDelete: "cascade" }),
		path: text("path").notNull(),
		name: text("name").notNull(),
		addedAt: integer("added_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(t) => [uniqueIndex("songs_playlist_path").on(t.playlistId, t.path)],
);

export type Song = typeof songs.$inferSelect;
export type NewSong = typeof songs.$inferInsert;
