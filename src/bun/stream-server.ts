import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { contentTypeFor } from "./audio";

export type StreamServerOptions = {
	allowedRoots: Set<string>;
	port?: number;
	hostname?: string;
};

const CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
	"Access-Control-Allow-Headers": "Range",
	"Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

export function isPathAllowed(p: string, allowedRoots: Set<string>): boolean {
	const abs = resolve(p);
	for (const root of allowedRoots) {
		if (abs === root || abs.startsWith(root + sep)) return true;
	}
	return false;
}

export function createStreamServer(opts: StreamServerOptions) {
	return Bun.serve({
		port: opts.port ?? 0,
		hostname: opts.hostname ?? "127.0.0.1",
		async fetch(req) {
			if (req.method === "OPTIONS") {
				return new Response(null, { status: 204, headers: CORS_HEADERS });
			}

			const url = new URL(req.url);
			if (url.pathname !== "/audio") {
				return new Response("Not found", { status: 404, headers: CORS_HEADERS });
			}

			const filePath = url.searchParams.get("path");
			if (!filePath) {
				return new Response("Missing path", { status: 400, headers: CORS_HEADERS });
			}
			if (!isPathAllowed(filePath, opts.allowedRoots)) {
				return new Response("Forbidden", { status: 403, headers: CORS_HEADERS });
			}

			let st;
			try {
				st = await stat(filePath);
			} catch {
				return new Response("Not found", { status: 404, headers: CORS_HEADERS });
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
							headers: { ...CORS_HEADERS, "Content-Range": `bytes */${total}` },
						});
					}
					const slice = file.slice(start, end + 1);
					return new Response(slice, {
						status: 206,
						headers: {
							...CORS_HEADERS,
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
					...CORS_HEADERS,
					"Content-Type": type,
					"Content-Length": String(total),
					"Accept-Ranges": "bytes",
					"Cache-Control": "no-store",
				},
			});
		},
	});
}
