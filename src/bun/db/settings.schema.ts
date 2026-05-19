import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Key/value store for application settings (window frame, shuffle, repeat,
 * volume…). Values are JSON-encoded so we can evolve the shape without a
 * migration per setting.
 */
export const settings = sqliteTable("settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
});

export type SettingRow = typeof settings.$inferSelect;
