import { describe, expect, it } from "vitest";

import { executeGraph } from "./runtime";

describe("executeGraph", () => {
  it("runs nodes in order and records timings through the provided state updater", async () => {
    const result = await executeGraph(
      {
        value: 1,
        nodeTimings: {} as Record<string, number>,
      },
      [
        {
          id: "first",
          run: (state) => ({ ...state, value: state.value + 1 }),
        },
        {
          id: "second",
          run: (state) => ({ ...state, value: state.value * 2 }),
        },
      ],
      {
        applyNodeTiming: (state, nodeId, durationMs) => ({
          ...state,
          nodeTimings: {
            ...state.nodeTimings,
            [nodeId]: durationMs,
          },
        }),
      },
    );

    expect(result.state.value).toBe(4);
    expect(result.completedNodeIds).toEqual(["first", "second"]);
    expect(result.state.nodeTimings.first).toBeGreaterThanOrEqual(1);
    expect(result.state.nodeTimings.second).toBeGreaterThanOrEqual(1);
  });

  it("skips nodes when shouldRun returns false", async () => {
    const result = await executeGraph(
      { value: 1 },
      [
        {
          id: "skip_me",
          shouldRun: () => false,
          run: (state) => ({ ...state, value: state.value + 100 }),
        },
        {
          id: "keep_me",
          run: (state) => ({ ...state, value: state.value + 1 }),
        },
      ],
    );

    expect(result.state.value).toBe(2);
    expect(result.completedNodeIds).toEqual(["keep_me"]);
  });
});
