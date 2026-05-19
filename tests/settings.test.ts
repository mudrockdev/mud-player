import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, parseSettings } from "../src/bun/settings-store";

describe("parseSettings", () => {
	test("returns defaults when no rows are stored", () => {
		expect(parseSettings([])).toEqual(DEFAULT_SETTINGS);
	});

	test("hydrates known keys with their stored values", () => {
		const result = parseSettings([
			{ key: "shuffle", value: JSON.stringify(true) },
			{ key: "repeat", value: JSON.stringify("one") },
			{ key: "volume", value: JSON.stringify(0.42) },
			{
				key: "windowFrame",
				value: JSON.stringify({ x: 10, y: 20, width: 800, height: 600 }),
			},
		]);
		expect(result).toEqual({
			shuffle: true,
			repeat: "one",
			volume: 0.42,
			windowFrame: { x: 10, y: 20, width: 800, height: 600 },
		});
	});

	test("ignores corrupt JSON and falls back to defaults for that key", () => {
		const result = parseSettings([
			{ key: "shuffle", value: "not-json" },
			{ key: "repeat", value: JSON.stringify("all") },
		]);
		expect(result.shuffle).toBe(DEFAULT_SETTINGS.shuffle);
		expect(result.repeat).toBe("all");
	});

	test("rejects values with the wrong shape", () => {
		const result = parseSettings([
			{ key: "shuffle", value: JSON.stringify("yes") }, // not a boolean
			{ key: "repeat", value: JSON.stringify("nope") }, // not a valid mode
			{ key: "volume", value: JSON.stringify("loud") }, // not a number
			{ key: "windowFrame", value: JSON.stringify({ x: 1, y: 2 }) }, // missing dims
		]);
		expect(result).toEqual(DEFAULT_SETTINGS);
	});

	test("ignores unknown keys silently", () => {
		const result = parseSettings([
			{ key: "shuffle", value: JSON.stringify(true) },
			{ key: "future-feature", value: JSON.stringify(123) },
		]);
		expect(result.shuffle).toBe(true);
	});

	test("does not mutate DEFAULT_SETTINGS between calls", () => {
		const a = parseSettings([
			{
				key: "windowFrame",
				value: JSON.stringify({ x: 5, y: 5, width: 5, height: 5 }),
			},
		]);
		a.windowFrame.x = 999;
		expect(DEFAULT_SETTINGS.windowFrame.x).toBe(200);
		const b = parseSettings([]);
		expect(b.windowFrame.x).toBe(200);
	});
});
