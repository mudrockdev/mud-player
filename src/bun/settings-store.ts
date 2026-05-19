import { eq, inArray } from "drizzle-orm";
import { db as defaultDb } from "./db";
import { settings } from "./db/schema";

export type AppSettings = {
	shuffle?: boolean;
	repeat?: "off" | "all" | "one";
	volume?: number;
	windowFrame?: { x: number; y: number; width: number; height: number };
};

export const DEFAULT_SETTINGS: Required<AppSettings> = {
	shuffle: false,
	repeat: "off",
	volume: 1,
	windowFrame: { x: 200, y: 200, width: 1000, height: 700 },
};

type SettingsDb = Pick<typeof defaultDb, "select" | "insert" | "delete">;

function isFrame(v: unknown): v is { x: number; y: number; width: number; height: number } {
	if (!v || typeof v !== "object") return false;
	const f = v as Record<string, unknown>;
	return (
		typeof f.x === "number" &&
		typeof f.y === "number" &&
		typeof f.width === "number" &&
		typeof f.height === "number"
	);
}

/**
 * Parse a raw `(key, value)` row collection into a typed settings object,
 * falling back to defaults for missing or invalid entries. Exposed so tests
 * can exercise the validator without a real DB.
 */
export function parseSettings(
	rows: Array<{ key: string; value: string }>,
): Required<AppSettings> {
	const out: Required<AppSettings> = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
	for (const row of rows) {
		try {
			const value = JSON.parse(row.value);
			if (row.key === "shuffle" && typeof value === "boolean") out.shuffle = value;
			else if (row.key === "repeat" && (value === "off" || value === "all" || value === "one"))
				out.repeat = value;
			else if (row.key === "volume" && typeof value === "number") out.volume = value;
			else if (row.key === "windowFrame" && isFrame(value)) out.windowFrame = value;
		} catch {
			// ignore corrupt rows; defaults stay
		}
	}
	return out;
}

export async function loadSettings(db: SettingsDb = defaultDb): Promise<Required<AppSettings>> {
	const rows = await db.select().from(settings);
	return parseSettings(rows);
}

export async function setSetting<K extends keyof AppSettings>(
	key: K,
	value: AppSettings[K],
	db: SettingsDb = defaultDb,
): Promise<void> {
	const encoded = JSON.stringify(value);
	await db
		.insert(settings)
		.values({ key, value: encoded })
		.onConflictDoUpdate({ target: settings.key, set: { value: encoded } });
}

export async function deleteSetting(
	key: keyof AppSettings,
	db: SettingsDb = defaultDb,
): Promise<void> {
	await db.delete(settings).where(eq(settings.key, key));
}

export async function clearSettings(
	keys: (keyof AppSettings)[],
	db: SettingsDb = defaultDb,
): Promise<void> {
	if (keys.length === 0) return;
	await db.delete(settings).where(inArray(settings.key, keys));
}
