import { BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import { readdir, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import type { Folder, MudPlayerRPC, Track } from "../shared/types";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

const AUDIO_EXTS = new Set([
	".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".oga", ".opus", ".webm",
]);

const STATE_DIR = Utils.paths.userData;
const STATE_FILE = join(STATE_DIR, "folders.json");

async function ensureStateDir() {
	if (!existsSync(STATE_DIR)) {
		await mkdir(STATE_DIR, { recursive: true });
	}
}

async function loadFolderPaths(): Promise<string[]> {
	try {
		const raw = await readFile(STATE_FILE, "utf8");
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) return parsed.filter((p) => typeof p === "string");
	} catch {}
	return [];
}

async function saveFolderPaths(paths: string[]) {
	await ensureStateDir();
	await writeFile(STATE_FILE, JSON.stringify(paths, null, 2), "utf8");
}

async function scanFolder(folderPath: string): Promise<Folder | null> {
	let entries;
	try {
		entries = await readdir(folderPath, { withFileTypes: true });
	} catch {
		return null;
	}
	const tracks: Track[] = [];
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const dot = entry.name.lastIndexOf(".");
		if (dot === -1) continue;
		const ext = entry.name.slice(dot).toLowerCase();
		if (!AUDIO_EXTS.has(ext)) continue;
		tracks.push({
			path: join(folderPath, entry.name),
			name: entry.name.slice(0, dot),
			folder: folderPath,
		});
	}
	tracks.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
	return {
		path: folderPath,
		name: basename(folderPath) || folderPath,
		tracks,
	};
}

const allowedRoots = new Set<string>();

function isPathAllowed(p: string): boolean {
	const abs = resolve(p);
	for (const root of allowedRoots) {
		if (abs === root || abs.startsWith(root + sep)) return true;
	}
	return false;
}

function contentTypeFor(path: string): string {
	const dot = path.lastIndexOf(".");
	const ext = dot === -1 ? "" : path.slice(dot).toLowerCase();
	switch (ext) {
		case ".mp3": return "audio/mpeg";
		case ".m4a":
		case ".aac": return "audio/aac";
		case ".flac": return "audio/flac";
		case ".wav": return "audio/wav";
		case ".ogg":
		case ".oga":
		case ".opus": return "audio/ogg";
		case ".webm": return "audio/webm";
		default: return "application/octet-stream";
	}
}

function startStreamServer(): number {
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		async fetch(req) {
			const url = new URL(req.url);
			if (url.pathname !== "/audio") return new Response("Not found", { status: 404 });
			const filePath = url.searchParams.get("path");
			if (!filePath) return new Response("Missing path", { status: 400 });
			if (!isPathAllowed(filePath)) return new Response("Forbidden", { status: 403 });

			let st;
			try { st = await stat(filePath); } catch {
				return new Response("Not found", { status: 404 });
			}
			const total = st.size;
			const file = Bun.file(filePath);
			const range = req.headers.get("range");
			const type = contentTypeFor(filePath);

			if (range) {
				const m = /^bytes=(\d*)-(\d*)$/.exec(range);
				if (m) {
					const start = m[1] ? parseInt(m[1], 10) : 0;
					const end = m[2] ? parseInt(m[2], 10) : total - 1;
					if (start >= total || end >= total || start > end) {
						return new Response(null, {
							status: 416,
							headers: { "Content-Range": `bytes */${total}` },
						});
					}
					const slice = file.slice(start, end + 1);
					return new Response(slice, {
						status: 206,
						headers: {
							"Content-Type": type,
							"Content-Length": String(end - start + 1),
							"Content-Range": `bytes ${start}-${end}/${total}`,
							"Accept-Ranges": "bytes",
							"Cache-Control": "no-store",
						},
					});
				}
			}
			return new Response(file, {
				headers: {
					"Content-Type": type,
					"Content-Length": String(total),
					"Accept-Ranges": "bytes",
					"Cache-Control": "no-store",
				},
			});
		},
	});
	return server.port!;
}

async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log("Vite dev server not running. Run 'bun run dev:hmr' for HMR support.");
		}
	}
	return "views://mainview/index.html";
}

const streamPort = startStreamServer();
console.log(`Audio stream server on http://127.0.0.1:${streamPort}`);

for (const p of await loadFolderPaths()) allowedRoots.add(resolve(p));

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
				const folder = await scanFolder(abs);
				if (!folder) return null;
				allowedRoots.add(abs);
				const known = await loadFolderPaths();
				if (!known.map((p) => resolve(p)).includes(abs)) {
					known.push(abs);
					await saveFolderPaths(known);
				}
				return folder;
			},
			async loadFolders() {
				const paths = await loadFolderPaths();
				const folders: Folder[] = [];
				for (const p of paths) {
					const abs = resolve(p);
					allowedRoots.add(abs);
					const f = await scanFolder(abs);
					if (f) folders.push(f);
				}
				return folders;
			},
			async rescanFolder({ path }) {
				const abs = resolve(path);
				if (!allowedRoots.has(abs)) return null;
				return await scanFolder(abs);
			},
			async removeFolder({ path }) {
				const abs = resolve(path);
				allowedRoots.delete(abs);
				const known = (await loadFolderPaths()).filter((p) => resolve(p) !== abs);
				await saveFolderPaths(known);
				const folders: Folder[] = [];
				for (const p of known) {
					const f = await scanFolder(resolve(p));
					if (f) folders.push(f);
				}
				return folders;
			},
			async getStreamPort() {
				return streamPort;
			},
		},
		messages: {
			log: ({ msg }) => console.log("[webview]", msg),
		},
	},
});

const url = await getMainViewUrl();

new BrowserWindow<typeof rpc>({
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
