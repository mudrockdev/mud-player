import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createStreamServer, isPathAllowed } from "../src/bun/stream-server";

const FIXTURE = resolve(import.meta.dir, "files/free_audio.ogg");
const FIXTURE_DIR = resolve(import.meta.dir, "files");

describe("isPathAllowed", () => {
	test("accepts a path that equals an allowed root", () => {
		const roots = new Set([resolve("/tmp/music")]);
		expect(isPathAllowed("/tmp/music", roots)).toBe(true);
	});

	test("accepts a path nested under an allowed root", () => {
		const roots = new Set([resolve("/tmp/music")]);
		expect(isPathAllowed("/tmp/music/album/track.mp3", roots)).toBe(true);
	});

	test("rejects unrelated paths", () => {
		const roots = new Set([resolve("/tmp/music")]);
		expect(isPathAllowed("/tmp/other", roots)).toBe(false);
		expect(isPathAllowed("/etc/passwd", roots)).toBe(false);
	});

	test("rejects path-prefix attacks (similar prefix that isn't actually nested)", () => {
		const roots = new Set([resolve("/tmp/music")]);
		// `/tmp/music-secret` shares the prefix but isn't inside `/tmp/music`.
		expect(isPathAllowed("/tmp/music-secret/track.mp3", roots)).toBe(false);
	});
});

describe("createStreamServer", () => {
	let server: ReturnType<typeof createStreamServer>;
	let base: string;
	let fileSize: number;
	const allowedRoots = new Set<string>([FIXTURE_DIR]);

	beforeAll(async () => {
		server = createStreamServer({ allowedRoots });
		base = `http://127.0.0.1:${server.port}`;
		fileSize = (await stat(FIXTURE)).size;
	});

	afterAll(() => {
		server.stop(true);
	});

	test("responds with CORS headers on OPTIONS preflight", async () => {
		const res = await fetch(`${base}/audio`, { method: "OPTIONS" });
		expect(res.status).toBe(204);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
	});

	test("404s an unknown path", async () => {
		const res = await fetch(`${base}/nope`);
		expect(res.status).toBe(404);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});

	test("400s when path param is missing", async () => {
		const res = await fetch(`${base}/audio`);
		expect(res.status).toBe(400);
	});

	test("403s when path is not under an allowed root", async () => {
		const res = await fetch(
			`${base}/audio?path=${encodeURIComponent("/etc/passwd")}`,
		);
		expect(res.status).toBe(403);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});

	test("404s when the allowed path doesn't exist on disk", async () => {
		const ghost = `${FIXTURE_DIR}/does-not-exist.mp3`;
		const res = await fetch(`${base}/audio?path=${encodeURIComponent(ghost)}`);
		expect(res.status).toBe(404);
	});

	test("returns the full file with correct headers on a plain GET", async () => {
		const res = await fetch(`${base}/audio?path=${encodeURIComponent(FIXTURE)}`);
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("audio/ogg");
		expect(res.headers.get("Content-Length")).toBe(String(fileSize));
		expect(res.headers.get("Accept-Ranges")).toBe("bytes");
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		const body = await res.arrayBuffer();
		expect(body.byteLength).toBe(fileSize);
	});

	test("responds 206 with Content-Range for a Range request", async () => {
		const res = await fetch(`${base}/audio?path=${encodeURIComponent(FIXTURE)}`, {
			headers: { Range: "bytes=0-99" },
		});
		expect(res.status).toBe(206);
		expect(res.headers.get("Content-Length")).toBe("100");
		expect(res.headers.get("Content-Range")).toBe(`bytes 0-99/${fileSize}`);
		const body = await res.arrayBuffer();
		expect(body.byteLength).toBe(100);
	});

	test("handles open-ended suffix range (bytes=N-)", async () => {
		const start = Math.max(0, fileSize - 50);
		const res = await fetch(`${base}/audio?path=${encodeURIComponent(FIXTURE)}`, {
			headers: { Range: `bytes=${start}-` },
		});
		expect(res.status).toBe(206);
		expect(res.headers.get("Content-Length")).toBe(String(fileSize - start));
		expect(res.headers.get("Content-Range")).toBe(
			`bytes ${start}-${fileSize - 1}/${fileSize}`,
		);
	});

	test("returns 416 when the requested range is past the end of the file", async () => {
		const res = await fetch(`${base}/audio?path=${encodeURIComponent(FIXTURE)}`, {
			headers: { Range: `bytes=${fileSize + 10}-${fileSize + 20}` },
		});
		expect(res.status).toBe(416);
		expect(res.headers.get("Content-Range")).toBe(`bytes */${fileSize}`);
	});
});
