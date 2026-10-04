// Crisis team assembly (roadmap S-10, FR-014).
//
// The rule: maximise the number of complete teams, then prefer better-ranked people (the lowest
// sum of `position`), then add at most one partial team from the people left over. Building teams
// one at a time is wrong: an early team can take the only person who could fill a later team's
// role. So the solver works on all k teams at once, as a min-cost max-flow:
//   source → role (capacity k × slots) → candidate (capacity 1, cost = position) → sink (capacity 1)
// and takes the largest k ≤ requested whose max flow fills every slot of k teams.
//
// Pure and dependency-free, so `node --test` runs it with no build step: keep imports to
// `import type` and avoid `@/` aliases.

export interface TeamRoleSpec {
  slug: string;
  slots: number;
}

export interface TeamCandidateInput {
  position: number;
  roles: readonly string[];
}

export interface AssembledTeam<C> {
  complete: boolean;
  /** One entry per slot, in template role order; `candidate` is null for an unfilled slot. */
  slots: { role: string; candidate: C | null }[];
}

interface Edge {
  to: number;
  rev: number;
  cap: number;
  cost: number;
}

function addEdge(graph: Edge[][], from: number, to: number, cap: number, cost: number): Edge {
  const forward: Edge = { to, rev: graph[to].length, cap, cost };
  graph[from].push(forward);
  graph[to].push({ to: from, rev: graph[from].length - 1, cap: 0, cost: -cost });
  return forward;
}

// Successive shortest paths with Bellman-Ford (residual edges carry negative costs). Nodes and
// edges are scanned in a fixed order and a predecessor changes only on a strict improvement, so
// ties always resolve the same way. Returns the max flow, at min cost.
function minCostMaxFlow(graph: Edge[][], source: number, sink: number): number {
  const n = graph.length;
  let flow = 0;

  for (;;) {
    const dist = new Array<number>(n).fill(Infinity);
    const prevNode = new Array<number>(n).fill(-1);
    const prevEdge = new Array<number>(n).fill(-1);
    dist[source] = 0;

    for (let round = 0; round < n - 1; round++) {
      let changed = false;
      for (let u = 0; u < n; u++) {
        if (dist[u] === Infinity) continue;
        for (let i = 0; i < graph[u].length; i++) {
          const e = graph[u][i];
          if (e.cap > 0 && dist[u] + e.cost < dist[e.to]) {
            dist[e.to] = dist[u] + e.cost;
            prevNode[e.to] = u;
            prevEdge[e.to] = i;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    if (dist[sink] === Infinity) return flow;

    let push = Infinity;
    for (let v = sink; v !== source; v = prevNode[v]) {
      push = Math.min(push, graph[prevNode[v]][prevEdge[v]].cap);
    }
    for (let v = sink; v !== source; v = prevNode[v]) {
      const e = graph[prevNode[v]][prevEdge[v]];
      e.cap -= push;
      graph[v][e.rev].cap += push;
    }
    flow += push;
  }
}

// Assigns people from `pool` (sorted by position) to roles, with `capacity(role)` places per
// role: max fill, then min sum of positions. Returns the people per role, in position order.
function assign<C extends TeamCandidateInput>(
  roles: readonly TeamRoleSpec[],
  pool: readonly C[],
  capacity: (role: TeamRoleSpec) => number,
): { flow: number; byRole: C[][] } {
  const source = 0;
  const sink = roles.length + pool.length + 1;
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => []);
  const links: { role: number; candidate: number; edge: Edge }[] = [];

  roles.forEach((role, r) => {
    addEdge(graph, source, 1 + r, capacity(role), 0);
    pool.forEach((candidate, c) => {
      if (candidate.roles.includes(role.slug)) {
        links.push({ role: r, candidate: c, edge: addEdge(graph, 1 + r, 1 + roles.length + c, 1, candidate.position) });
      }
    });
  });
  pool.forEach((_, c) => addEdge(graph, 1 + roles.length + c, sink, 1, 0));

  const flow = minCostMaxFlow(graph, source, sink);
  const byRole: C[][] = roles.map(() => []);
  // `links` is in role order, then pool order, so each role's list comes out in position order.
  for (const link of links) {
    if (link.edge.cap === 0) byRole[link.role].push(pool[link.candidate]);
  }
  return { flow, byRole };
}

export function assembleTeams<C extends TeamCandidateInput>(
  roles: readonly TeamRoleSpec[],
  candidates: readonly C[],
  requested: number,
): { teams: AssembledTeam<C>[]; completeCount: number } {
  const slotsPerTeam = roles.reduce((sum, role) => sum + role.slots, 0);
  if (requested < 1 || slotsPerTeam === 0) return { teams: [], completeCount: 0 };

  const pool = [...candidates].sort((a, b) => a.position - b.position);
  const teams: AssembledTeam<C>[] = [];
  const used = new Set<C>();

  // The largest k whose k teams can all be filled at once, and its min-cost assignment.
  let complete = requested;
  for (; complete > 0; complete--) {
    const k = complete;
    const result = assign(roles, pool, (role) => k * role.slots);
    if (result.flow !== k * slotsPerTeam) continue;

    // k identical teams make any split valid; dealing by rank gives team 1 the best of each role.
    for (let i = 0; i < k; i++) {
      teams.push({
        complete: true,
        slots: roles.flatMap((role, r) =>
          result.byRole[r]
            .slice(i * role.slots, (i + 1) * role.slots)
            .map((candidate) => ({ role: role.slug, candidate })),
        ),
      });
    }
    result.byRole.flat().forEach((candidate) => used.add(candidate));
    break;
  }

  if (complete < requested) {
    const leftovers = pool.filter((candidate) => !used.has(candidate));
    const partial = assign(roles, leftovers, (role) => role.slots);
    if (partial.flow > 0) {
      teams.push({
        complete: false,
        slots: roles.flatMap((role, r) =>
          Array.from({ length: role.slots }, (_, j) => ({
            role: role.slug,
            candidate: j < partial.byRole[r].length ? partial.byRole[r][j] : null,
          })),
        ),
      });
    }
  }

  return { teams, completeCount: complete };
}
