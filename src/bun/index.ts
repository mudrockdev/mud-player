import { BrowserView, BrowserWindow, Tray, Updater, Utils } from "electrobun/bun";
import { basename, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { playlists, songs } from "./db/schema";
import { listAudioFiles } from "./audio";
import { createStreamServer } from "./stream-server";
import type { Folder, MudPlayerRPC, PlayerState, TrayAction } from "../shared/types";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

const allowedRoots = new Set<string>();

export async function syncPlaylistSongs(
	playlistId: string,
	folderPath: string,
): Promise<Folder["tracks"]> {
	const fsTracks = await listAudioFiles(folderPath);
	const fsByPath = new Map(fsTracks.map((t) => [t.path, t]));

	const existing = await db
		.select()
		.from(songs)
		.where(eq(songs.playlistId, playlistId));
	const existingByPath = new Map(existing.map((s) => [s.path, s]));

	const toInsert = fsTracks
		.filter((t) => !existingByPath.has(t.path))
		.map((t) => ({
			id: randomUUID(),
			playlistId,
			path: t.path,
			name: t.name,
		}));
	if (toInsert.length) {
		await db.insert(songs).values(toInsert);
	}

	for (const row of existing) {
		if (!fsByPath.has(row.path)) {
			await db
				.delete(songs)
				.where(and(eq(songs.playlistId, playlistId), eq(songs.path, row.path)));
		}
	}

	const final = await db
		.select()
		.from(songs)
		.where(eq(songs.playlistId, playlistId));
	final.sort((a, b) =>
		a.name.localeCompare(b.name, undefined, { numeric: true }),
	);
	return final.map((s) => ({ path: s.path, name: s.name, folder: folderPath }));
}

export async function buildFolder(
	playlistId: string,
	folderPath: string,
	name: string,
): Promise<Folder> {
	const tracks = await syncPlaylistSongs(playlistId, folderPath);
	return { path: folderPath, name, tracks };
}

export async function loadAllFolders(): Promise<Folder[]> {
	const rows = await db.select().from(playlists);
	rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
	const result: Folder[] = [];
	for (const row of rows) {
		allowedRoots.add(resolve(row.folderPath));
		result.push(await buildFolder(row.id, row.folderPath, row.name));
	}
	return result;
}

async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log(
				"Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
			);
		}
	}
	return "views://mainview/index.html";
}

const server = createStreamServer({ allowedRoots });
const streamPort = server.port!;
console.log(`Audio stream server on http://127.0.0.1:${streamPort}`);

for (const row of await db
	.select({ folderPath: playlists.folderPath })
	.from(playlists)) {
	allowedRoots.add(resolve(row.folderPath));
}

const rpc = BrowserView.defineRPC<MudPlayerRPC>({
	handlers: {
		requests: {
			async pickFolder() {
				const paths = await Utils.openFileDialog({
					canChooseFiles: false,
					canChooseDirectory: true,
					allowsMultipleSelection: false,
					startingFolder: Utils.paths.music || Utils.paths.home,
				});
				const chosen = paths.find((p) => p && p.length > 0);
				if (!chosen) return null;
				const abs = resolve(chosen);

				let existing = await db
					.select()
					.from(playlists)
					.where(eq(playlists.folderPath, abs))
					.limit(1);
				let row = existing[0];
				if (!row) {
					const id = randomUUID();
					const name = basename(abs) || abs;
					await db.insert(playlists).values({ id, name, folderPath: abs });
					const inserted = await db
						.select()
						.from(playlists)
						.where(eq(playlists.id, id))
						.limit(1);
					row = inserted[0]!;
				}

				allowedRoots.add(abs);
				return buildFolder(row.id, row.folderPath, row.name);
			},
			async loadFolders() {
				return loadAllFolders();
			},
			async rescanFolder({ path }) {
				const abs = resolve(path);
				if (!allowedRoots.has(abs)) return null;
				const rows = await db
					.select()
					.from(playlists)
					.where(eq(playlists.folderPath, abs))
					.limit(1);
				const row = rows[0];
				if (!row) return null;
				return buildFolder(row.id, row.folderPath, row.name);
			},
			async removeFolder({ path }) {
				const abs = resolve(path);
				allowedRoots.delete(abs);
				await db.delete(playlists).where(eq(playlists.folderPath, abs));
				return loadAllFolders();
			},
			async getStreamPort() {
				return streamPort;
			},
		},
		messages: {
			log: ({ msg }) => console.log("[webview]", msg),
			playerState: (state) => updateTray(state),
		},
	},
});

let playerState: PlayerState = { hasTrack: false, paused: true, trackName: "" };
let tray: Tray | null = null;

try {
	tray = new Tray({ title: "mud-player", template: true });
} catch (err) {
	console.warn("Tray unavailable:", err);
}

function sendTrayAction(action: TrayAction) {
	try {
		mainWindow.webview.rpc?.send.trayAction({ action });
	} catch (err) {
		console.warn("Failed to dispatch tray action:", err);
	}
}

function updateTray(state: PlayerState) {
	playerState = state;
	if (!tray) return;
	const titleText = state.hasTrack
		? `${state.paused ? "❚❚" : "▶"} ${truncate(state.trackName, 40)}`
		: "mud-player";
	tray.setTitle(titleText);
	tray.setMenu([
		{
			type: "normal",
			label: state.hasTrack ? state.trackName : "(nothing playing)",
			enabled: false,
		},
		{ type: "separator" },
		{
			type: "normal",
			label: "Previous",
			action: "prev",
			enabled: state.hasTrack,
		},
		{
			type: "normal",
			label: "Play",
			action: "toggle-play",
			hidden: !state.paused,
			enabled: state.hasTrack,
		},
		{
			type: "normal",
			label: "Stop",
			action: "toggle-play",
			hidden: state.paused,
			enabled: state.hasTrack,
		},
		{
			type: "normal",
			label: "Next",
			action: "next",
			enabled: state.hasTrack,
		},
		{ type: "separator" },
		{ type: "normal", label: "Quit", action: "quit" },
	]);
}

function truncate(s: string, max: number): string {
	return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

tray?.on("tray-clicked", (event) => {
	const action = (event as { data?: { action?: string } }).data?.action;
	if (!action) return;
	if (action === "quit") {
		Utils.quit();
		return;
	}
	if (action === "prev" || action === "next" || action === "toggle-play" || action === "stop") {
		sendTrayAction(action);
	}
});

updateTray(playerState);

const url = await getMainViewUrl();

const mainWindow = new BrowserWindow<typeof rpc>({
	title: "mud-player",
	url,
	rpc,
	frame: {
		width: 1000,
		height: 700,
		x: 200,
		y: 200,
	},
});

console.log("mud-player started");
