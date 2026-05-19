import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { and, eq } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { playlists, songs } from "../src/bun/db/schema";

type Db = ReturnType<typeof drizzle<typeof import("../src/bun/db/schema")>>;

async function createTestDb(): Promise<{ db: Db; cleanup: () => Promise<void> }> {
	const dir = await mkdtemp(join(tmpdir(), "mud-db-"));
	const dbPath = join(dir, "test.sqlite");
	const db = drizzle(`file:${dbPath}`, {
		schema: { playlists, songs },
	}) as unknown as Db;
	await migrate(db, {
		migrationsFolder: resolve(import.meta.dir, "../drizzle"),
	});
	return {
		db,
		cleanup: () => rm(dir, { recursive: true, force: true }),
	};
}

describe("playlists schema", () => {
	let db: Db;
	let cleanup: () => Promise<void>;

	beforeEach(async () => {
		({ db, cleanup } = await createTestDb());
	});
	afterEach(async () => {
		await cleanup();
	});

	test("insert + select round-trips a playlist with createdAt", async () => {
		const id = randomUUID();
		await db.insert(playlists).values({
			id,
			name: "Jazz",
			folderPath: "/music/jazz",
		});
		const rows = await db.select().from(playlists).where(eq(playlists.id, id));
		expect(rows).toHaveLength(1);
		expect(rows[0].name).toBe("Jazz");
		expect(rows[0].folderPath).toBe("/music/jazz");
		expect(rows[0].createdAt).toBeInstanceOf(Date);
	});

	test("folder_path is unique", async () => {
		await db.insert(playlists).values({
			id: randomUUID(),
			name: "A",
			folderPath: "/music/dup",
		});
		await expect(
			(async () => {
				await db.insert(playlists).values({
					id: randomUUID(),
					name: "B",
					folderPath: "/music/dup",
				});
			})(),
		).rejects.toThrow();
	});
});

describe("songs schema", () => {
	let db: Db;
	let cleanup: () => Promise<void>;

	beforeEach(async () => {
		({ db, cleanup } = await createTestDb());
	});
	afterEach(async () => {
		await cleanup();
	});

	test("songs require a playlist (FK enforcement)", async () => {
		await expect(
			(async () => {
				await db.insert(songs).values({
					id: randomUUID(),
					playlistId: "missing-playlist",
					path: "/music/x.mp3",
					name: "x",
				});
			})(),
		).rejects.toThrow();
	});

	test("(playlist_id, path) is unique", async () => {
		const playlistId = randomUUID();
		await db
			.insert(playlists)
			.values({ id: playlistId, name: "P", folderPath: "/p" });
		await db.insert(songs).values({
			id: randomUUID(),
			playlistId,
			path: "/p/a.mp3",
			name: "a",
		});
		await expect(
			(async () => {
				await db.insert(songs).values({
					id: randomUUID(),
					playlistId,
					path: "/p/a.mp3",
					name: "a-dup",
				});
			})(),
		).rejects.toThrow();
	});

	test("deleting a playlist cascades to its songs", async () => {
		const playlistId = randomUUID();
		await db
			.insert(playlists)
			.values({ id: playlistId, name: "P", folderPath: "/p2" });
		await db.insert(songs).values([
			{ id: randomUUID(), playlistId, path: "/p2/a.mp3", name: "a" },
			{ id: randomUUID(), playlistId, path: "/p2/b.mp3", name: "b" },
		]);

		await db.delete(playlists).where(eq(playlists.id, playlistId));

		const remaining = await db
			.select()
			.from(songs)
			.where(eq(songs.playlistId, playlistId));
		expect(remaining).toHaveLength(0);
	});

	test("songs can be queried by playlist + path", async () => {
		const playlistId = randomUUID();
		await db
			.insert(playlists)
			.values({ id: playlistId, name: "P", folderPath: "/p3" });
		const songId = randomUUID();
		await db.insert(songs).values({
			id: songId,
			playlistId,
			path: "/p3/track.mp3",
			name: "track",
		});

		const rows = await db
			.select()
			.from(songs)
			.where(
				and(eq(songs.playlistId, playlistId), eq(songs.path, "/p3/track.mp3")),
			);
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe(songId);
		expect(rows[0].addedAt).toBeInstanceOf(Date);
	});
});
