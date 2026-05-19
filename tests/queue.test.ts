import { describe, expect, test } from "bun:test";
import {
	buildShuffleOrder,
	cycleRepeat,
	nextTrack,
	prevTrack,
	type QueueState,
} from "../src/mainview/lib/queue";

/** Deterministic seedable RNG so we can assert exact permutations. */
function seededRng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 0x100000000;
	};
}

describe("buildShuffleOrder", () => {
	test("returns an empty array when length is 0", () => {
		expect(buildShuffleOrder(0, -1)).toEqual([]);
	});

	test("produces a valid permutation of [0, length)", () => {
		const order = buildShuffleOrder(10, 0, seededRng(42));
		expect(order).toHaveLength(10);
		expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
	});

	test("places `startWith` at position 0 when in range", () => {
		const order = buildShuffleOrder(8, 5, seededRng(1));
		expect(order[0]).toBe(5);
		expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	});

	test("ignores `startWith` when out of range", () => {
		const order = buildShuffleOrder(4, 99, seededRng(7));
		expect(order).toHaveLength(4);
		expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
	});
});

describe("nextTrack — non-shuffle", () => {
	const base = (over: Partial<QueueState>): QueueState => ({
		length: 4,
		index: 0,
		shuffle: false,
		shuffleOrder: [],
		shufflePos: -1,
		repeat: "off",
		...over,
	});

	test("plays the next index in the queue", () => {
		expect(nextTrack(base({ index: 1 }), true)).toEqual({ kind: "play", index: 2 });
	});

	test("stops at the end when repeat is off", () => {
		expect(nextTrack(base({ index: 3 }), false)).toEqual({ kind: "stop" });
	});

	test("wraps to the start when repeat is all", () => {
		expect(nextTrack(base({ index: 3, repeat: "all" }), false)).toEqual({
			kind: "play",
			index: 0,
		});
	});

	test("is a noop when the queue is empty", () => {
		expect(nextTrack(base({ length: 0 }), true)).toEqual({ kind: "noop" });
	});
});

describe("nextTrack — shuffle", () => {
	test("advances along an existing shuffle order", () => {
		const result = nextTrack(
			{
				length: 4,
				index: 2,
				shuffle: true,
				shuffleOrder: [2, 0, 3, 1],
				shufflePos: 0,
				repeat: "off",
			},
			true,
		);
		expect(result).toEqual({
			kind: "play",
			index: 0,
			shuffleOrder: [2, 0, 3, 1],
			shufflePos: 1,
		});
	});

	test("re-shuffles when repeat=all and we hit the end", () => {
		const result = nextTrack(
			{
				length: 4,
				index: 1,
				shuffle: true,
				shuffleOrder: [2, 0, 3, 1],
				shufflePos: 3,
				repeat: "all",
			},
			true,
			seededRng(123),
		);
		expect(result.kind).toBe("play");
		if (result.kind === "play") {
			expect(result.shuffleOrder).toHaveLength(4);
			expect(result.shufflePos).toBe(0);
			expect(result.index).toBe(result.shuffleOrder![0]);
		}
	});

	test("stops when shuffle ends without repeat", () => {
		const result = nextTrack(
			{
				length: 3,
				index: 0,
				shuffle: true,
				shuffleOrder: [2, 0, 1],
				shufflePos: 2,
				repeat: "off",
			},
			false,
		);
		expect(result).toEqual({ kind: "stop" });
	});

	test("builds an order on the fly if missing", () => {
		const result = nextTrack(
			{
				length: 5,
				index: 0,
				shuffle: true,
				shuffleOrder: [],
				shufflePos: -1,
				repeat: "off",
			},
			true,
			seededRng(7),
		);
		expect(result.kind).toBe("play");
		if (result.kind === "play") {
			expect(result.shuffleOrder).toHaveLength(5);
			expect(result.shufflePos).toBe(1);
		}
	});
});

describe("prevTrack", () => {
	const base = (over: Partial<QueueState>): QueueState => ({
		length: 4,
		index: 0,
		shuffle: false,
		shuffleOrder: [],
		shufflePos: -1,
		repeat: "off",
		...over,
	});

	test("restarts the current track when currentTime > 3s", () => {
		expect(prevTrack(base({ index: 2 }), 5)).toEqual({ kind: "restart" });
	});

	test("steps back when not shuffling", () => {
		expect(prevTrack(base({ index: 2 }), 0)).toEqual({ kind: "play", index: 1 });
	});

	test("noop at the start with repeat off", () => {
		expect(prevTrack(base({ index: 0 }), 0)).toEqual({ kind: "noop" });
	});

	test("wraps to the end when repeat is all", () => {
		expect(prevTrack(base({ index: 0, repeat: "all" }), 0)).toEqual({
			kind: "play",
			index: 3,
		});
	});

	test("steps back through the shuffle order", () => {
		expect(
			prevTrack(
				{
					length: 4,
					index: 0,
					shuffle: true,
					shuffleOrder: [2, 0, 3, 1],
					shufflePos: 2,
					repeat: "off",
				},
				0,
			),
		).toEqual({ kind: "play", index: 0, shufflePos: 1 });
	});

	test("noop at the start of the shuffle order", () => {
		expect(
			prevTrack(
				{
					length: 4,
					index: 2,
					shuffle: true,
					shuffleOrder: [2, 0, 3, 1],
					shufflePos: 0,
					repeat: "off",
				},
				0,
			),
		).toEqual({ kind: "noop" });
	});
});

describe("cycleRepeat", () => {
	test("cycles off → all → one → off", () => {
		expect(cycleRepeat("off")).toBe("all");
		expect(cycleRepeat("all")).toBe("one");
		expect(cycleRepeat("one")).toBe("off");
	});
});
