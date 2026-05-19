import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Track } from "../shared/types";

export const AUDIO_EXTS = new Set([
	".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".oga", ".opus", ".webm",
]);

export function isAudioFile(name: string): boolean {
	const dot = name.lastIndexOf(".");
	if (dot === -1) return false;
	return AUDIO_EXTS.has(name.slice(dot).toLowerCase());
}

export function trackNameOf(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot === -1 ? name : name.slice(0, dot);
}

export function contentTypeFor(path: string): string {
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

export async function listAudioFiles(folderPath: string): Promise<Track[]> {
	let entries;
	try {
		entries = await readdir(folderPath, { withFileTypes: true });
	} catch {
		return [];
	}
	const tracks: Track[] = [];
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		if (!isAudioFile(entry.name)) continue;
		tracks.push({
			path: join(folderPath, entry.name),
			name: trackNameOf(entry.name),
			folder: folderPath,
		});
	}
	tracks.sort((a, b) =>
		a.name.localeCompare(b.name, undefined, { numeric: true }),
	);
	return tracks;
}

export function folderName(folderPath: string): string {
	return basename(folderPath) || folderPath;
}
