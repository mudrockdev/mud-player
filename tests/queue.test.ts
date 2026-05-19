import { describe, expect, test } from "bun:test";
import {
  buildShuffleOrder,
  cycleRepeat,
  nextTrack,
  prevTrack,
  pushHistory,
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

const base = (over: Partial<QueueState>): QueueState => ({
  length: 4,
  index: 0,
  shuffle: false,
  shuffleOrder: [],
  shufflePos: -1,
  repeat: "off",
  history: [],
  ...over,
});

describe("buildShuffleOrder", () => {
  test("returns an empty array when length is 0", () => {
    expect(buildShuffleOrder(0, -1)).toEqual([]);
  });

  test("produces a valid permutation of [0, length)", () => {
    const order = buildShuffleOrder(10, 0, seededRng(42));
    expect(order).toHaveLength(10);
    expect([...order].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
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

describe("pushHistory", () => {
  test("appends the current index", () => {
    expect(pushHistory([1, 2], 3)).toEqual([1, 2, 3]);
  });

  test("dedupes consecutive entries", () => {
    expect(pushHistory([1, 2], 2)).toEqual([1, 2]);
  });

  test("ignores invalid indices", () => {
    expect(pushHistory([1, 2], -1)).toEqual([1, 2]);
  });

  test("returns a fresh array (doesn't mutate)", () => {
    const original = [1];
    const next = pushHistory(original, 2);
    expect(original).toEqual([1]);
    expect(next).toEqual([1, 2]);
  });
});

describe("nextTrack — non-shuffle", () => {
  test("plays the next index and records history", () => {
    const result = nextTrack(base({ index: 1 }), true);
    expect(result).toEqual({ kind: "play", index: 2, history: [1] });
  });

  test("stops at the end when repeat is off", () => {
    expect(nextTrack(base({ index: 3 }), false)).toEqual({ kind: "stop" });
  });

  test("wraps to the start when repeat is all", () => {
    expect(nextTrack(base({ index: 3, repeat: "all" }), false)).toEqual({
      kind: "play",
      index: 0,
      history: [3],
    });
  });

  test("is a noop when the queue is empty", () => {
    expect(nextTrack(base({ length: 0 }), true)).toEqual({ kind: "noop" });
  });
});

describe("nextTrack — shuffle", () => {
  test("advances along an existing shuffle order and records history", () => {
    const result = nextTrack(
      base({
        index: 2,
        shuffle: true,
        shuffleOrder: [2, 0, 3, 1],
        shufflePos: 0,
      }),
      true,
    );
    expect(result).toEqual({
      kind: "play",
      index: 0,
      history: [2],
      shuffleOrder: [2, 0, 3, 1],
      shufflePos: 1,
    });
  });

  test("re-shuffles when repeat=all and we hit the end", () => {
    const result = nextTrack(
      base({
        index: 1,
        shuffle: true,
        shuffleOrder: [2, 0, 3, 1],
        shufflePos: 3,
        repeat: "all",
      }),
      true,
      seededRng(123),
    );
    expect(result.kind).toBe("play");
    if (result.kind === "play") {
      expect(result.shuffleOrder).toHaveLength(4);
      expect(result.shufflePos).toBe(0);
      expect(result.index).toBe(result.shuffleOrder![0]);
      expect(result.history).toEqual([1]);
    }
  });

  test("stops when shuffle ends without repeat", () => {
    expect(
      nextTrack(
        base({
          length: 3,
          index: 0,
          shuffle: true,
          shuffleOrder: [2, 0, 1],
          shufflePos: 2,
        }),
        false,
      ),
    ).toEqual({ kind: "stop" });
  });

  test("builds an order on the fly if missing", () => {
    const result = nextTrack(
      base({ length: 5, shuffle: true }),
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
  test("restarts the current track when currentTime > 3s", () => {
    expect(prevTrack(base({ index: 2 }), 5)).toEqual({ kind: "restart" });
  });

  test("pops history first regardless of shuffle/linear mode", () => {
    expect(prevTrack(base({ index: 5, history: [1, 4] }), 0)).toEqual({
      kind: "play",
      index: 4,
      history: [1],
    });
  });

  test("pops history even after shuffle was enabled mid-listen", () => {
    // User listened to 0, then manually picked 3, then enabled shuffle, then
    // shuffle picked 7. Back should walk back through 7 → 3 → 0.
    const after7 = prevTrack(
      base({
        length: 10,
        index: 7,
        shuffle: true,
        shuffleOrder: [7, 2, 5, 0, 1, 3, 4, 6, 8, 9],
        shufflePos: 0,
        history: [0, 3],
      }),
      0,
    );
    expect(after7).toMatchObject({ kind: "play", index: 3, history: [0] });

    const after3 = prevTrack(
      base({ length: 10, index: 3, shuffle: true, history: [0] }),
      0,
    );
    expect(after3).toEqual({ kind: "play", index: 0, history: [] });
  });

  test("aligns shufflePos when the popped track is part of the shuffle order", () => {
    const result = prevTrack(
      base({
        index: 0,
        shuffle: true,
        shuffleOrder: [2, 0, 3, 1],
        shufflePos: 1,
        history: [2],
      }),
      0,
    );
    expect(result).toMatchObject({
      kind: "play",
      index: 2,
      history: [],
      shufflePos: 0,
    });
  });

  test("linear with empty history steps back by index", () => {
    expect(prevTrack(base({ index: 2 }), 0)).toEqual({
      kind: "play",
      index: 1,
      history: [],
    });
  });

  test("linear with empty history at start: noop unless repeat=all", () => {
    expect(prevTrack(base({ index: 0 }), 0)).toEqual({ kind: "noop" });
    expect(prevTrack(base({ index: 0, repeat: "all" }), 0)).toEqual({
      kind: "play",
      index: 3,
      history: [],
    });
  });

  test("shuffle with empty history is a noop", () => {
    expect(prevTrack(base({ shuffle: true, index: 2 }), 0)).toEqual({
      kind: "noop",
    });
  });
});

describe("cycleRepeat", () => {
  test("cycles off → all → one → off", () => {
    expect(cycleRepeat("off")).toBe("all");
    expect(cycleRepeat("all")).toBe("one");
    expect(cycleRepeat("one")).toBe("off");
  });
});
