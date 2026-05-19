export type RepeatMode = "off" | "one" | "all";

export type QueueState = {
	length: number;
	index: number;
	shuffle: boolean;
	shuffleOrder: number[];
	shufflePos: number;
	repeat: RepeatMode;
};

export type QueueResult =
	| { kind: "play"; index: number; shuffleOrder?: number[]; shufflePos?: number }
	| { kind: "stop"; index?: number }
	| { kind: "noop" };

/**
 * Build a shuffled permutation of `[0, length)`. If `startWith` is in range,
 * the result has it at position 0 so playback starts on that track.
 *
 * Pure aside from `Math.random` — pass `rng` to make it deterministic.
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

/** Decide the next track when the user (or `ended`) advances. */
export function nextTrack(
	state: QueueState,
	userInitiated: boolean,
	rng: () => number = Math.random,
): QueueResult {
	if (state.length === 0) return { kind: "noop" };

	if (state.shuffle) {
		const order =
			state.shuffleOrder.length === state.length
				? state.shuffleOrder
				: buildShuffleOrder(state.length, Math.max(state.index, 0), rng);
		const pos =
			state.shuffleOrder.length === state.length ? state.shufflePos : 0;

		if (pos + 1 < order.length) {
			return { kind: "play", index: order[pos + 1], shuffleOrder: order, shufflePos: pos + 1 };
		}
		if (state.repeat === "all") {
			const fresh = buildShuffleOrder(state.length, -1, rng);
			return { kind: "play", index: fresh[0], shuffleOrder: fresh, shufflePos: 0 };
		}
		return {
			kind: "stop",
			index: userInitiated ? order[order.length - 1] : undefined,
		};
	}

	if (state.index + 1 < state.length) {
		return { kind: "play", index: state.index + 1 };
	}
	if (state.repeat === "all") return { kind: "play", index: 0 };
	return { kind: "stop" };
}

/** Decide the previous track. `currentTime` lets us implement "restart if >3s". */
export function prevTrack(
	state: QueueState,
	currentTime: number,
): QueueResult | { kind: "restart" } {
	if (state.length === 0) return { kind: "noop" };
	if (currentTime > 3) return { kind: "restart" };

	if (state.shuffle) {
		if (state.shufflePos > 0) {
			return {
				kind: "play",
				index: state.shuffleOrder[state.shufflePos - 1],
				shufflePos: state.shufflePos - 1,
			};
		}
		return { kind: "noop" };
	}

	if (state.index > 0) return { kind: "play", index: state.index - 1 };
	if (state.repeat === "all") return { kind: "play", index: state.length - 1 };
	return { kind: "noop" };
}

/** Cycle the repeat mode: off → all → one → off. */
export function cycleRepeat(mode: RepeatMode): RepeatMode {
	return mode === "off" ? "all" : mode === "all" ? "one" : "off";
}
