import type { Folder } from "../../shared/types";

/**
 * Merge a freshly-fetched folder into an existing list. Always returns a NEW
 * array so Svelte's reactivity reliably propagates — the previous
 * implementation did `list[i] = folder` for the in-place update, which is
 * reactive on its own but harder to reason about than a flat reassign.
 *
 * - If a folder with the same path is already in the list, it's replaced
 *   (preserving its position).
 * - Otherwise the new folder is appended.
 */
export function mergeFolder(list: Folder[], incoming: Folder): Folder[] {
	const idx = list.findIndex((f) => f.path === incoming.path);
	if (idx === -1) return [...list, incoming];
	return list.map((f, i) => (i === idx ? incoming : f));
}

/** Replace the entry matching `path` with `updated`, or return the list unchanged. */
export function replaceFolder(list: Folder[], updated: Folder): Folder[] {
	const idx = list.findIndex((f) => f.path === updated.path);
	if (idx === -1) return list;
	return list.map((f, i) => (i === idx ? updated : f));
}

/**
 * Pick the next folder path to focus after the active one was removed.
 * Falls back to the first remaining folder, or `null` if the list is empty.
 */
export function fallbackActivePath(
	list: Folder[],
	removed: string,
): string | null {
	if (list.length === 0) return null;
	const stillPresent = list.some((f) => f.path === removed);
	if (stillPresent) return removed;
	return list[0]?.path ?? null;
}
