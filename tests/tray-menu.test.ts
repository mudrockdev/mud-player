import { describe, expect, test } from "bun:test";
import {
	buildTrayMenu,
	buildTrayTitle,
	classifyTrayClick,
	truncate,
} from "../src/bun/tray-menu";
import type { PlayerState } from "../src/shared/types";

const idle: PlayerState = { hasTrack: false, paused: true, trackName: "" };
const playing: PlayerState = {
	hasTrack: true,
	paused: false,
	trackName: "Awesome Song",
};
const paused: PlayerState = {
	hasTrack: true,
	paused: true,
	trackName: "Awesome Song",
};

describe("truncate", () => {
	test("returns the input when shorter than max", () => {
		expect(truncate("abc", 10)).toBe("abc");
	});

	test("appends an ellipsis when truncating", () => {
		expect(truncate("abcdefghij", 6)).toBe("abcde…");
	});

	test("respects the exact-length boundary without truncating", () => {
		expect(truncate("12345", 5)).toBe("12345");
	});
});

describe("buildTrayTitle", () => {
	test("falls back to the app name when nothing is playing", () => {
		expect(buildTrayTitle(idle)).toBe("mud-player");
	});

	test("uses ▶ glyph + name when playing", () => {
		expect(buildTrayTitle(playing)).toBe("▶ Awesome Song");
	});

	test("uses ❚❚ glyph + name when paused", () => {
		expect(buildTrayTitle(paused)).toBe("❚❚ Awesome Song");
	});

	test("truncates long track names so the menubar doesn't overflow", () => {
		const long = "x".repeat(80);
		const title = buildTrayTitle({ hasTrack: true, paused: false, trackName: long });
		expect(title.startsWith("▶ ")).toBe(true);
		// 40-char cap on the name segment.
		expect(title.length).toBeLessThanOrEqual(2 + 40);
		expect(title.endsWith("…")).toBe(true);
	});
});

describe("buildTrayMenu — idle state", () => {
	const menu = buildTrayMenu(idle);

	test("first row shows '(nothing playing)' and is disabled", () => {
		const head = menu[0];
		if (head.type === "separator" || head.type === "divider") throw new Error("unexpected");
		expect(head.label).toBe("(nothing playing)");
		expect(head.enabled).toBe(false);
	});

	test("transport entries are disabled when there's no track", () => {
		const actions = ["prev", "toggle-play", "next"] as const;
		for (const a of actions) {
			const item = menu.find((m) => m.type === "normal" && m.action === a);
			expect(item).toBeDefined();
			if (item && item.type === "normal") expect(item.enabled).toBe(false);
		}
	});

	test("includes a Quit entry", () => {
		const quit = menu.find((m) => m.type === "normal" && m.action === "quit");
		expect(quit).toBeDefined();
	});
});

describe("buildTrayMenu — playing state", () => {
	const menu = buildTrayMenu(playing);

	test("song name is the first label", () => {
		const head = menu[0];
		if (head.type === "separator" || head.type === "divider") throw new Error("unexpected");
		expect(head.label).toBe("Awesome Song");
		expect(head.enabled).toBe(false);
	});

	test("Stop is visible and Play is hidden while playing", () => {
		const play = menu.find(
			(m) => m.type === "normal" && m.label === "Play",
		);
		const stop = menu.find(
			(m) => m.type === "normal" && m.label === "Stop",
		);
		if (!play || play.type !== "normal" || !stop || stop.type !== "normal") {
			throw new Error("Play/Stop entries missing");
		}
		expect(play.hidden).toBe(true);
		expect(stop.hidden).toBe(false);
		expect(play.action).toBe("toggle-play");
		expect(stop.action).toBe("toggle-play");
	});

	test("prev/next are enabled when a track is loaded", () => {
		const prev = menu.find((m) => m.type === "normal" && m.action === "prev");
		const next = menu.find((m) => m.type === "normal" && m.action === "next");
		if (!prev || prev.type !== "normal" || !next || next.type !== "normal") {
			throw new Error("prev/next missing");
		}
		expect(prev.enabled).toBe(true);
		expect(next.enabled).toBe(true);
	});

	test("separators delimit the song row and the quit row", () => {
		expect(menu[1].type).toBe("separator");
		expect(menu[menu.length - 2].type).toBe("separator");
	});
});

describe("buildTrayMenu — paused state", () => {
	const menu = buildTrayMenu(paused);

	test("Play is visible and Stop is hidden while paused", () => {
		const play = menu.find(
			(m) => m.type === "normal" && m.label === "Play",
		);
		const stop = menu.find(
			(m) => m.type === "normal" && m.label === "Stop",
		);
		if (!play || play.type !== "normal" || !stop || stop.type !== "normal") {
			throw new Error("Play/Stop entries missing");
		}
		expect(play.hidden).toBe(false);
		expect(stop.hidden).toBe(true);
	});
});

describe("classifyTrayClick", () => {
	test("treats missing/empty action as ignore (e.g. icon-only click)", () => {
		expect(classifyTrayClick(undefined)).toEqual({ kind: "ignore" });
		expect(classifyTrayClick("")).toEqual({ kind: "ignore" });
	});

	test("routes quit", () => {
		expect(classifyTrayClick("quit")).toEqual({ kind: "quit" });
	});

	test("routes all four player actions", () => {
		for (const a of ["prev", "next", "toggle-play", "stop"] as const) {
			expect(classifyTrayClick(a)).toEqual({ kind: "player", action: a });
		}
	});

	test("ignores unknown actions", () => {
		expect(classifyTrayClick("not-a-real-action")).toEqual({ kind: "ignore" });
	});
});
