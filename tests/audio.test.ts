import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	AUDIO_EXTS,
	contentTypeFor,
	folderName,
	isAudioFile,
	listAudioFiles,
	trackNameOf,
} from "../src/bun/audio";

describe("AUDIO_EXTS", () => {
	test("includes the formats the app advertises", () => {
		for (const ext of [
			".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".oga", ".opus", ".webm",
		]) {
			expect(AUDIO_EXTS.has(ext)).toBe(true);
		}
	});
});

describe("isAudioFile", () => {
	test("accepts known audio extensions case-insensitively", () => {
		expect(isAudioFile("song.mp3")).toBe(true);
		expect(isAudioFile("song.MP3")).toBe(true);
		expect(isAudioFile("song.Flac")).toBe(true);
	});

	test("rejects unknown / extensionless files", () => {
		expect(isAudioFile("readme.txt")).toBe(false);
		expect(isAudioFile("cover.jpg")).toBe(false);
		expect(isAudioFile("dotfile")).toBe(false);
		expect(isAudioFile("")).toBe(false);
	});
});

describe("trackNameOf", () => {
	test("strips the final extension", () => {
		expect(trackNameOf("hello world.mp3")).toBe("hello world");
		expect(trackNameOf("track.01.flac")).toBe("track.01");
	});

	test("returns the original name when there is no extension", () => {
		expect(trackNameOf("no-extension")).toBe("no-extension");
	});
});

describe("contentTypeFor", () => {
	test("maps each supported extension to the expected MIME type", () => {
		expect(contentTypeFor("a.mp3")).toBe("audio/mpeg");
		expect(contentTypeFor("a.m4a")).toBe("audio/aac");
		expect(contentTypeFor("a.aac")).toBe("audio/aac");
		expect(contentTypeFor("a.flac")).toBe("audio/flac");
		expect(contentTypeFor("a.wav")).toBe("audio/wav");
		expect(contentTypeFor("a.ogg")).toBe("audio/ogg");
		expect(contentTypeFor("a.oga")).toBe("audio/ogg");
		expect(contentTypeFor("a.opus")).toBe("audio/ogg");
		expect(contentTypeFor("a.webm")).toBe("audio/webm");
	});

	test("falls back to octet-stream for unknown extensions", () => {
		expect(contentTypeFor("a.txt")).toBe("application/octet-stream");
		expect(contentTypeFor("noext")).toBe("application/octet-stream");
	});

	test("ignores case", () => {
		expect(contentTypeFor("track.MP3")).toBe("audio/mpeg");
	});
});

describe("folderName", () => {
	test("returns the basename of the folder", () => {
		expect(folderName("/home/user/Music/Albums")).toBe("Albums");
	});

	test("returns the path unchanged when basename is empty", () => {
		expect(folderName("/")).toBe("/");
	});
});

describe("listAudioFiles", () => {
	async function scratchDir(): Promise<string> {
		return mkdtemp(join(tmpdir(), "mud-audio-"));
	}

	test("returns empty for a non-existent folder", async () => {
		const tracks = await listAudioFiles("/definitely/not/a/real/path/zzz");
		expect(tracks).toEqual([]);
	});

	test("lists only audio files and ignores subfolders & non-audio", async () => {
		const dir = await scratchDir();
		await writeFile(join(dir, "a.mp3"), "");
		await writeFile(join(dir, "b.flac"), "");
		await writeFile(join(dir, "notes.txt"), "");
		await mkdir(join(dir, "nested"));
		await writeFile(join(dir, "nested", "c.mp3"), "");

		const tracks = await listAudioFiles(dir);
		expect(tracks.map((t) => t.name).sort()).toEqual(["a", "b"]);
		expect(tracks.every((t) => t.folder === dir)).toBe(true);
		expect(tracks[0].path.startsWith(dir)).toBe(true);
	});

	test("sorts tracks naturally by name", async () => {
		const dir = await scratchDir();
		await writeFile(join(dir, "10 - intro.mp3"), "");
		await writeFile(join(dir, "2 - song.mp3"), "");
		await writeFile(join(dir, "1 - opener.mp3"), "");

		const tracks = await listAudioFiles(dir);
		expect(tracks.map((t) => t.name)).toEqual([
			"1 - opener",
			"2 - song",
			"10 - intro",
		]);
	});
});
