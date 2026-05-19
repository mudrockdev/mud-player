import Electrobun, {
	BrowserView,
	BrowserWindow,
	Tray,
	Updater,
	Utils,
} from "electrobun/bun";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { playlists, songs } from "./db/schema";
import { listAudioFiles } from "./audio";
import { createStreamServer } from "./stream-server";
import { loadSettings, setSetting } from "./settings-store";
import { buildTrayMenu, buildTrayTitle, classifyTrayClick } from "./tray-menu";
import type {
	Folder,
	MudPlayerRPC,
	PersistedSettings,
	PlayerState,
	TrayAction,
} from "../shared/types";

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
			async loadSettings(): Promise<PersistedSettings> {
				const s = await loadSettings();
				return { shuffle: s.shuffle, repeat: s.repeat, volume: s.volume };
			},
		},
		messages: {
			log: ({ msg }) => console.log("[webview]", msg),
			playerState: (state) => updateTray(state),
			saveSettings: (patch) => {
				void persistSettingsPatch(patch);
			},
		},
	},
});

async function persistSettingsPatch(patch: Partial<PersistedSettings>) {
	for (const key of Object.keys(patch) as (keyof PersistedSettings)[]) {
		const value = patch[key];
		if (value === undefined) continue;
		try {
			await setSetting(key, value as never);
		} catch (err) {
			console.warn(`Failed to persist setting ${key}:`, err);
		}
	}
}

let playerState: PlayerState = { hasTrack: false, paused: true, trackName: "" };
let tray: Tray | null = null;

function resolveIconPath(): string {
	// In the bundle `import.meta.dir` is .../Resources/app/bun, with assets
	// copied to .../Resources/app/assets. Running the source directly from
	// `bun src/bun/index.ts` puts us at <repo>/src/bun, so the asset lives
	// two levels up. Try both — fall through to the first candidate so the
	// caller still gets a stable string for logs.
	const candidates = [
		join(import.meta.dir, "../assets/icon.png"),
		join(import.meta.dir, "../../assets/icon.png"),
		join(import.meta.dir, "../../../assets/icon.png"),
	];
	for (const c of candidates) {
		if (existsSync(c)) return c;
	}
	return candidates[0];
}

const iconPath = resolveIconPath();

try {
	tray = new Tray({
		title: "mud-player",
		image: iconPath,
		template: false,
		width: 22,
		height: 22,
	});
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
	tray.setTitle(buildTrayTitle(state));
	tray.setMenu(buildTrayMenu(state, windowHidden));
}

let windowHidden = false;

function toggleMainWindow() {
	if (windowHidden) {
		mainWindow.show();
		mainWindow.activate();
		windowHidden = false;
	} else {
		mainWindow.hide();
		windowHidden = true;
	}
	// Refresh the menu so the entry's label flips between Show/Hide.
	updateTray(playerState);
}

tray?.on("tray-clicked", (event) => {
	const action = (event as { data?: { action?: string } }).data?.action;
	const click = classifyTrayClick(action);
	if (click.kind === "icon" || click.kind === "toggle-window") toggleMainWindow();
	else if (click.kind === "quit") Utils.quit();
	else if (click.kind === "player") sendTrayAction(click.action);
});

updateTray(playerState);

const url = await getMainViewUrl();

const persisted = await loadSettings();

const mainWindow = new BrowserWindow<typeof rpc>({
	title: "mud-player",
	url,
	rpc,
	frame: { ...persisted.windowFrame },
});

// Persist window frame on resize / move. Debounce so we don't write on every
// pointer-move during a drag.
let frameSaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleFrameSave(frame: { x: number; y: number; width: number; height: number }) {
	if (frameSaveTimer) clearTimeout(frameSaveTimer);
	frameSaveTimer = setTimeout(() => {
		void setSetting("windowFrame", frame).catch((err) =>
			console.warn("Failed to persist window frame:", err),
		);
	}, 300);
}

function onWindowGeom(event: unknown) {
	const data = (event as { data?: { id?: number; x?: number; y?: number; width?: number; height?: number } }).data;
	if (!data || data.id !== mainWindow.id) return;
	const next = {
		x: data.x ?? persisted.windowFrame.x,
		y: data.y ?? persisted.windowFrame.y,
		width: data.width ?? persisted.windowFrame.width,
		height: data.height ?? persisted.windowFrame.height,
	};
	scheduleFrameSave(next);
}

Electrobun.events.on("resize", onWindowGeom);
Electrobun.events.on("move", onWindowGeom);

console.log("mud-player started");
