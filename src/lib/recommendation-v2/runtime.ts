export interface GraphNode<TState, TNodeId extends string> {
  id: TNodeId;
  run: (state: TState) => Promise<TState> | TState;
  shouldRun?: (state: TState) => boolean;
}

export interface GraphExecutionResult<TState, TNodeId extends string> {
  state: TState;
  completedNodeIds: TNodeId[];
}

export class GraphExecutionError<TState, TNodeId extends string> extends Error {
  state: TState;
  failedNodeId: TNodeId;
  completedNodeIds: TNodeId[];
  cause?: unknown;

  constructor(input: {
    message: string;
    state: TState;
    failedNodeId: TNodeId;
    completedNodeIds: TNodeId[];
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "GraphExecutionError";
    this.state = input.state;
    this.failedNodeId = input.failedNodeId;
    this.completedNodeIds = input.completedNodeIds;
    if ("cause" in Error.prototype) {
      this.cause = input.cause;
    }
  }
}

interface ExecuteGraphOptions<TState, TNodeId extends string> {
  applyNodeTiming?: (state: TState, nodeId: TNodeId, durationMs: number) => TState;
  onNodeComplete?: (event: {
    nodeId: TNodeId;
    durationMs: number;
    state: TState;
    completedNodeIds: TNodeId[];
  }) => Promise<void> | void;
}

export async function executeGraph<TState, TNodeId extends string>(
  initialState: TState,
  nodes: Array<GraphNode<TState, TNodeId>>,
  options: ExecuteGraphOptions<TState, TNodeId> = {},
): Promise<GraphExecutionResult<TState, TNodeId>> {
  let state = initialState;
  const completedNodeIds: TNodeId[] = [];

  for (const node of nodes) {
    if (node.shouldRun && !node.shouldRun(state)) {
      continue;
    }

    const startedAt = Date.now();
    let nextState: TState;

    try {
      nextState = await node.run(state);
    } catch (error) {
      const message =
        typeof error === "object" && error && "message" in error
          ? String((error as { message?: string }).message ?? `Graph node ${node.id} failed`)
          : `Graph node ${node.id} failed`;

      throw new GraphExecutionError({
        message,
        state,
        failedNodeId: node.id,
        completedNodeIds: [...completedNodeIds],
        cause: error,
      });
    }

    state = nextState;
    const durationMs = Math.max(1, Date.now() - startedAt);

    if (options.applyNodeTiming) {
      state = options.applyNodeTiming(state, node.id, durationMs);
    }

    completedNodeIds.push(node.id);

    if (options.onNodeComplete) {
      await options.onNodeComplete({
        nodeId: node.id,
        durationMs,
        state,
        completedNodeIds: [...completedNodeIds],
      });
    }
  }

  return {
    state,
    completedNodeIds,
  };
}
