import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createStreamServer } from "../src/bun/stream-server";

const FIXTURE = resolve(import.meta.dir, "files/free_audio.ogg");
const FIXTURE_DIR = resolve(import.meta.dir, "files");

// Bun.WebView needs WKWebView (macOS) or a Chromium-family browser (Linux/Windows).
// If we can't open a view, skip the suite instead of failing on every CI box.
async function probeWebViewSupported(): Promise<boolean> {
	if (typeof (Bun as any).WebView !== "function") return false;
	try {
		const probe = new (Bun as any).WebView({ width: 100, height: 100 });
		await probe.navigate("about:blank");
		probe.close?.();
		return true;
	} catch {
		return false;
	}
}

const HAS_WEBVIEW = await probeWebViewSupported();
const itIfWebView = HAS_WEBVIEW ? test : test.skip;

describe("Bun.WebView audio playback against the stream server", () => {
	let stream: ReturnType<typeof createStreamServer>;
	let page: ReturnType<typeof Bun.serve>;
	let view: any;

	const PAGE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>audio-test</title></head>
<body>
<script>
window.__setup = (audioUrl) => {
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = audioUrl;
  window.__audio = audio;
  audio.load();
};
window.__waitCanPlay = (timeoutMs) => new Promise((resolve) => {
  const a = window.__audio;
  if (a.readyState >= 3) return resolve(true);
  const onReady = () => resolve(true);
  a.addEventListener("canplay", onReady, { once: true });
  setTimeout(() => resolve(a.readyState >= 3), timeoutMs);
});
window.__play = () => window.__audio.play().then(() => "ok").catch((e) => "err:" + e.message);
window.__currentTime = () => window.__audio.currentTime;
window.__duration = () => window.__audio.duration;
window.__paused = () => window.__audio.paused;
window.__volume = () => window.__audio.volume;
window.__setVolume = (v) => { window.__audio.volume = v; return window.__audio.volume; };
window.__pause = () => { window.__audio.pause(); return window.__audio.paused; };
window.__waitTime = (target, timeoutMs) => new Promise((resolve) => {
  const a = window.__audio;
  const start = Date.now();
  const tick = () => {
    if (a.currentTime >= target) return resolve(a.currentTime);
    if (Date.now() - start > timeoutMs) return resolve(a.currentTime);
    setTimeout(tick, 50);
  };
  tick();
});
</script>
</body></html>`;

	beforeAll(async () => {
		if (!HAS_WEBVIEW) return;
		stream = createStreamServer({ allowedRoots: new Set([FIXTURE_DIR]) });
		page = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch: () =>
				new Response(PAGE_HTML, { headers: { "Content-Type": "text/html" } }),
		});
		view = new (Bun as any).WebView({ width: 400, height: 200 });
		await view.navigate(`http://127.0.0.1:${page.port}/`);

		const audioUrl = `http://127.0.0.1:${stream.port}/audio?path=${encodeURIComponent(FIXTURE)}`;
		await view.evaluate(`window.__setup(${JSON.stringify(audioUrl)})`);
	});

	afterAll(() => {
		view?.close?.();
		page?.stop?.(true);
		stream?.stop?.(true);
	});

	itIfWebView("loads the audio file via the stream server (canplay fires)", async () => {
		const ready = await view.evaluate("window.__waitCanPlay(8000)");
		expect(ready).toBe(true);
	});

	itIfWebView("reports a positive duration after metadata loads", async () => {
		const duration = await view.evaluate("window.__duration()");
		expect(typeof duration).toBe("number");
		expect(duration).toBeGreaterThan(0);
	});

	itIfWebView("audio.play() resolves and currentTime advances", async () => {
		const playResult = await view.evaluate("window.__play()");
		expect(playResult).toBe("ok");

		const t = await view.evaluate("window.__waitTime(0.2, 3000)");
		expect(t).toBeGreaterThan(0);

		const paused = await view.evaluate("window.__paused()");
		expect(paused).toBe(false);
	});

	itIfWebView("setVolume reaches the audio element verbatim", async () => {
		const v = await view.evaluate("window.__setVolume(0.3)");
		expect(v).toBeCloseTo(0.3, 5);
		const read = await view.evaluate("window.__volume()");
		expect(read).toBeCloseTo(0.3, 5);
	});

	itIfWebView("pause() stops playback and currentTime stops advancing", async () => {
		const paused = await view.evaluate("window.__pause()");
		expect(paused).toBe(true);
		const t1 = await view.evaluate("window.__currentTime()");
		await Bun.sleep(300);
		const t2 = await view.evaluate("window.__currentTime()");
		expect(Math.abs(t2 - t1)).toBeLessThan(0.05);
	});
});
