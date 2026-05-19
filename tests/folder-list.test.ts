import { describe, expect, test } from "bun:test";
import {
	fallbackActivePath,
	mergeFolder,
	replaceFolder,
} from "../src/mainview/lib/folder-list";
import type { Folder } from "../src/shared/types";

function folder(path: string, name = path, trackCount = 0): Folder {
	return {
		path,
		name,
		tracks: Array.from({ length: trackCount }, (_, i) => ({
			path: `${path}/${i}.mp3`,
			name: `${i}`,
			folder: path,
		})),
	};
}

describe("mergeFolder", () => {
	test("appends a brand-new folder to the end", () => {
		const before = [folder("/music/jazz"), folder("/music/rock")];
		const after = mergeFolder(before, folder("/music/electronic"));
		expect(after.map((f) => f.path)).toEqual([
			"/music/jazz",
			"/music/rock",
			"/music/electronic",
		]);
	});

	test("regression: import-folder updates the UI without a reload (always returns a fresh array)", () => {
		// The Svelte sidebar binds to `player.folders`. If `mergeFolder`
		// returned the same array reference for the new-folder path, the
		// `$state` reassign would still happen but mutating callers in the
		// past mutated in place — leaving the rendered list stale until
		// restart. Asserting a new reference keeps reactivity honest.
		const before = [folder("/music/jazz")];
		const after = mergeFolder(before, folder("/music/rock"));
		expect(after).not.toBe(before);
		expect(after.length).toBe(2);
		// And the original list is untouched.
		expect(before.length).toBe(1);
	});

	test("replaces an existing folder (matched by path) at its original index", () => {
		const before = [
			folder("/a"),
			folder("/b", "old", 1),
			folder("/c"),
		];
		const refreshed = folder("/b", "new", 5);
		const after = mergeFolder(before, refreshed);
		expect(after.map((f) => f.path)).toEqual(["/a", "/b", "/c"]);
		expect(after[1]).toBe(refreshed);
		expect(after[1].name).toBe("new");
		expect(after[1].tracks).toHaveLength(5);
	});

	test("returns a new reference even when replacing in place", () => {
		const before = [folder("/a")];
		const after = mergeFolder(before, folder("/a", "renamed"));
		expect(after).not.toBe(before);
	});

	test("handles an empty starting list", () => {
		expect(mergeFolder([], folder("/x"))).toEqual([folder("/x")]);
	});
});

describe("replaceFolder", () => {
	test("replaces by path", () => {
		const before = [folder("/a", "old"), folder("/b")];
		const after = replaceFolder(before, folder("/a", "new"));
		expect(after[0].name).toBe("new");
		expect(after).not.toBe(before);
	});

	test("returns the same reference when no match (no needless rerenders)", () => {
		const before = [folder("/a"), folder("/b")];
		expect(replaceFolder(before, folder("/missing"))).toBe(before);
	});
});

describe("fallbackActivePath", () => {
	test("returns null when nothing's left", () => {
		expect(fallbackActivePath([], "/anything")).toBeNull();
	});

	test("keeps the active path if the removed folder isn't actually gone yet", () => {
		const list = [folder("/a"), folder("/b")];
		expect(fallbackActivePath(list, "/a")).toBe("/a");
	});

	test("falls back to the first folder when the active one was removed", () => {
		const list = [folder("/b"), folder("/c")];
		expect(fallbackActivePath(list, "/a")).toBe("/b");
	});
});
