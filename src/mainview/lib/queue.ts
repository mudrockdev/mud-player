export type RepeatMode = "off" | "one" | "all";

export type QueueState = {
	length: number;
	index: number;
	shuffle: boolean;
	shuffleOrder: number[];
	shufflePos: number;
	repeat: RepeatMode;
	/**
	 * Stack of indices that were playing before the current one, most-recent at
	 * the end. Survives shuffle toggles and manual track picks so the back
	 * button can always walk you through what you actually listened to.
	 */
	history: number[];
};

export type QueueResult =
	| {
			kind: "play";
			index: number;
			history: number[];
			shuffleOrder?: number[];
			shufflePos?: number;
	  }
	| { kind: "stop"; index?: number; history?: number[] }
	| { kind: "restart" }
	| { kind: "noop" };

/**
 * Build a shuffled permutation of `[0, length)`. If `startWith` is in range,
 * the result has it at position 0 so playback starts on that track.
 */
export function buildShuffleOrder(
	length: number,
	startWith: number,
	rng: () => number = Math.random,
): number[] {
	if (length <= 0) return [];
	const order = Array.from({ length }, (_, i) => i);
	for (let i = order.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[order[i], order[j]] = [order[j], order[i]];
	}
	if (startWith >= 0 && startWith < length) {
		const idx = order.indexOf(startWith);
		if (idx > 0) [order[0], order[idx]] = [order[idx], order[0]];
	}
	return order;
}

/** Append `current` to `history`, deduplicating consecutive entries. */
export function pushHistory(history: number[], current: number): number[] {
	if (current < 0) return history;
	if (history.length && history[history.length - 1] === current) return history;
	return [...history, current];
}

/** Decide the next track when the user (or `ended`) advances. */
export function nextTrack(
	state: QueueState,
	userInitiated: boolean,
	rng: () => number = Math.random,
): QueueResult {
	if (state.length === 0) return { kind: "noop" };
	const history = pushHistory(state.history, state.index);

	if (state.shuffle) {
		const order =
			state.shuffleOrder.length === state.length
				? state.shuffleOrder
				: buildShuffleOrder(state.length, Math.max(state.index, 0), rng);
		const pos =
			state.shuffleOrder.length === state.length ? state.shufflePos : 0;

		if (pos + 1 < order.length) {
			return {
				kind: "play",
				index: order[pos + 1],
				history,
				shuffleOrder: order,
				shufflePos: pos + 1,
			};
		}
		if (state.repeat === "all") {
			const fresh = buildShuffleOrder(state.length, -1, rng);
			return {
				kind: "play",
				index: fresh[0],
				history,
				shuffleOrder: fresh,
				shufflePos: 0,
			};
		}
		return {
			kind: "stop",
			index: userInitiated ? order[order.length - 1] : undefined,
		};
	}

	if (state.index + 1 < state.length) {
		return { kind: "play", index: state.index + 1, history };
	}
	if (state.repeat === "all") return { kind: "play", index: 0, history };
	return { kind: "stop" };
}

/**
 * Decide the previous track.
 *
 * - If `currentTime > 3` we restart the current track (typical media-player
 *   behavior so users can quickly seek to the beginning).
 * - Otherwise, pop the play history if we have any. This is the path that
 *   keeps "back" useful after shuffle is enabled or a track is manually
 *   picked from the list.
 * - With no history we fall back to linear `index-1` (or wrap on repeat=all)
 *   so an untouched, never-shuffled queue still behaves linearly.
 */
export function prevTrack(state: QueueState, currentTime: number): QueueResult {
	if (state.length === 0) return { kind: "noop" };
	if (currentTime > 3) return { kind: "restart" };

	if (state.history.length > 0) {
		const target = state.history[state.history.length - 1];
		const history = state.history.slice(0, -1);
		const result: QueueResult = { kind: "play", index: target, history };
		if (state.shuffle && state.shuffleOrder.length === state.length) {
			const newPos = state.shuffleOrder.indexOf(target);
			if (newPos >= 0) result.shufflePos = newPos;
		}
		return result;
	}

	if (state.shuffle) return { kind: "noop" };

	if (state.index > 0) {
		return { kind: "play", index: state.index - 1, history: [] };
	}
	if (state.repeat === "all") {
		return { kind: "play", index: state.length - 1, history: [] };
	}
	return { kind: "noop" };
}

/** Cycle the repeat mode: off → all → one → off. */
export function cycleRepeat(mode: RepeatMode): RepeatMode {
	return mode === "off" ? "all" : mode === "all" ? "one" : "off";
}
