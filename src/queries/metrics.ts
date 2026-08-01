import {
    complexity as complexityLevels,
    importance as importanceLevels,
    type BaseKeys,
    type Infograph,
    type InfographNode,
    type InfographNodeKey,
} from '../types.js'
import { stronglyConnectedComponents } from './scc.js'

export type Stats = {
    min: number
    average: number
    max: number
}

export type FieldCoverage = {
    count: number
    ratio: number
}

export type ComponentStats = {
    count: number
    largestSize: number
}

export type StronglyConnectedStats = {
    count: number
    largestSize: number
    // SCCs that contain a cycle: size > 1, or a single node with a self-loop.
    nonTrivial: number
}

export type Metrics = {
    nodeCount: number
    edgeCount: number
    density: number
    nodesByKind: Record<string, number>
    edgesByVerb: Record<string, number>
    nodesByImportance: Record<string, number>
    nodesByComplexity: Record<string, number>
    edgesByComplexity: Record<string, number>
    incidence: Stats
    inDegree: Stats
    outDegree: Stats
    sourceCount: number
    sinkCount: number
    isolatedNodeCount: number
    selfLoopCount: number
    components: ComponentStats
    stronglyConnected: StronglyConnectedStats
    feedbackArcSetSize: number
    fieldCoverage: Record<string, FieldCoverage>
    undated: string[]
}

const coverageFields = ['summary', 'fact', 'date', 'importance', 'complexity', 'source', 'tag'] as const

export function metrics<Keys extends BaseKeys>(infograph: Infograph<Keys>): Metrics {
    const nodeKeys = [...infograph.nodes.keys()]
    const nodes = [...infograph.nodes.values()]
    const nodeCount = nodeKeys.length

    const inDegree = new Map<InfographNodeKey<Keys>, number>(nodeKeys.map(key => [key, 0]))
    const outDegree = new Map<InfographNodeKey<Keys>, number>(nodeKeys.map(key => [key, 0]))
    const selfLooped = new Set<InfographNodeKey<Keys>>()

    for (const edge of infograph.edges) {
        bump(outDegree, edge.from)
        bump(inDegree, edge.to)
        if (edge.from === edge.to) selfLooped.add(edge.from)
    }

    const inValues = [...inDegree.values()]
    const outValues = [...outDegree.values()]
    const totalValues = nodeKeys.map(key => (inDegree.get(key) ?? 0) + (outDegree.get(key) ?? 0))

    const sccs = stronglyConnectedComponents(infograph)
    const sccSizes = sccs.map(component => component.length)

    return {
        nodeCount,
        edgeCount: infograph.edges.length,
        density: density(nodeCount, infograph.edges.length),
        nodesByKind: tally(nodeKeys.map(nodeKind)),
        edgesByVerb: tally(infograph.edges.map(edge => edge.verb)),
        nodesByImportance: tallyLevels(
            importanceLevels,
            nodes.map(node => node.importance?.is)
        ),
        nodesByComplexity: tallyLevels(
            complexityLevels,
            nodes.map(node => node.complexity.is)
        ),
        edgesByComplexity: tallyLevels(
            complexityLevels,
            infograph.edges.map(edge => edge.info.complexity.is)
        ),
        incidence: stats(totalValues),
        inDegree: stats(inValues),
        outDegree: stats(outValues),
        sourceCount: inValues.filter(degree => degree === 0).length,
        sinkCount: outValues.filter(degree => degree === 0).length,
        isolatedNodeCount: totalValues.filter(degree => degree === 0).length,
        selfLoopCount: selfLooped.size,
        components: components(nodeKeys, infograph.edges),
        stronglyConnected: {
            count: sccs.length,
            largestSize: sccSizes.length === 0 ? 0 : Math.max(...sccSizes),
            // A component contains a cycle when it has more than one node, or a
            // single node with a self-loop.
            nonTrivial: sccs.filter(c => c.length > 1 || selfLooped.has(c[0])).length,
        },
        feedbackArcSetSize: feedbackArcSetSize(nodeKeys, infograph.edges),
        fieldCoverage: fieldCoverage(nodes, nodeCount),
        undated: Array.from(
            infograph.nodes.entries().filter(([, node]) => undefined === node.date),
            ([key]) => key
        ),
    }
}

function nodeKind<Keys extends BaseKeys>(key: InfographNodeKey<Keys>): string {
    return key.split(' ', 1)[0]
}

function bump<K>(counts: Map<K, number>, key: K) {
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1)
}

function tally(values: string[]): Record<string, number> {
    const counts = new Map<string, number>()
    for (const value of values) {
        counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)))
}

// Buckets over a fixed set of levels, so every level appears (including zero
// counts) in a stable order. A trailing `missing` bucket is added only when some
// value is absent, so distributions over mandatory fields stay clean.
function tallyLevels<K extends string>(levels: readonly K[], values: (K | undefined)[]): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const level of levels) counts[level] = 0
    let missing = 0
    for (const value of values) {
        if (value === undefined) missing++
        else counts[value]++
    }
    if (missing > 0) counts.missing = missing
    return counts
}

function density(nodeCount: number, edgeCount: number): number {
    if (nodeCount < 2) return 0
    return round(edgeCount / (nodeCount * (nodeCount - 1)))
}

function fieldCoverage<Keys extends BaseKeys>(
    nodes: InfographNode<Keys>[],
    nodeCount: number
): Record<string, FieldCoverage> {
    return Object.fromEntries(
        coverageFields.map(field => {
            const count = nodes.filter(node => node[field] !== undefined).length
            return [field, { count, ratio: nodeCount === 0 ? 0 : round(count / nodeCount) }]
        })
    )
}

// Weakly connected components: edges are treated as undirected via union-find.
function components<Keys extends BaseKeys>(
    nodeKeys: InfographNodeKey<Keys>[],
    edges: Infograph<Keys>['edges']
): ComponentStats {
    const parent = new Map<InfographNodeKey<Keys>, InfographNodeKey<Keys>>(nodeKeys.map(key => [key, key]))

    const find = (key: InfographNodeKey<Keys>): InfographNodeKey<Keys> => {
        let root = key
        while (parent.get(root) !== root) root = parent.get(root)!
        while (parent.get(key) !== root) {
            const next = parent.get(key)!
            parent.set(key, root)
            key = next
        }
        return root
    }

    for (const edge of edges) {
        if (!parent.has(edge.from) || !parent.has(edge.to)) continue
        parent.set(find(edge.from), find(edge.to))
    }

    const sizes = new Map<InfographNodeKey<Keys>, number>()
    for (const key of nodeKeys) {
        const root = find(key)
        sizes.set(root, (sizes.get(root) ?? 0) + 1)
    }

    return {
        count: sizes.size,
        largestSize: sizes.size === 0 ? 0 : Math.max(...sizes.values()),
    }
}

// Budget of findCycle() calls before the exact search gives up and falls back to
// the heuristic upper bound. Near-DAGs need only a handful; this caps the worst
// case (a dense cyclic core, where the NP-hard problem is genuinely intractable).
const FEEDBACK_ARC_SET_BUDGET = 100_000

// Minimum feedback arc set size: the fewest edges whose removal makes the graph
// acyclic. NP-hard in general, but real infographs are near-DAGs with tiny cyclic
// cores, so exact branch-and-bound that hits one cycle at a time resolves quickly:
// every feedback arc set must remove at least one edge of any given cycle, so we
// branch over that cycle's edges and bound by the best solution so far. The search
// is seeded with a linear-time heuristic (back edges of a DFS ordering are a valid
// feedback arc set) to prune hard, and a work budget guarantees termination — if a
// dense core ever blows the budget, the returned value is that heuristic upper bound
// rather than the proven minimum. Self-loops are 1-edge cycles, always mandatory.
function feedbackArcSetSize<Keys extends BaseKeys>(
    nodeKeys: InfographNodeKey<Keys>[],
    edges: Infograph<Keys>['edges']
): number {
    const nodeSet = new Set(nodeKeys)
    const active: { from: InfographNodeKey<Keys>; to: InfographNodeKey<Keys> }[] = []
    let selfLoops = 0
    for (const edge of edges) {
        if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to)) continue
        if (edge.from === edge.to) selfLoops++
        else active.push({ from: edge.from, to: edge.to })
    }

    const removed = new Array<boolean>(active.length).fill(false)

    const adjacencyOfActive = () => {
        const adjacency = new Map<InfographNodeKey<Keys>, { to: InfographNodeKey<Keys>; edge: number }[]>(
            nodeKeys.map(key => [key, []])
        )
        active.forEach((edge, i) => {
            if (!removed[i]) adjacency.get(edge.from)!.push({ to: edge.to, edge: i })
        })
        return adjacency
    }

    // Upper bound: run one DFS and count back edges. Removing every back edge yields
    // a DAG, so this is a valid (if not minimal) feedback arc set.
    const heuristicBound = (): number => {
        const adjacency = adjacencyOfActive()
        const color = new Map<InfographNodeKey<Keys>, 0 | 1 | 2>()
        let back = 0
        const visit = (node: InfographNodeKey<Keys>) => {
            color.set(node, 1)
            for (const { to } of adjacency.get(node)!) {
                const seen = color.get(to) ?? 0
                if (seen === 0) visit(to)
                else if (seen === 1) back++
            }
            color.set(node, 2)
        }
        for (const key of nodeKeys) if ((color.get(key) ?? 0) === 0) visit(key)
        return back
    }

    // Returns one directed cycle as a list of edge indices, or null if the active
    // graph is acyclic. DFS back-edge detection over the not-yet-removed edges.
    let budget = FEEDBACK_ARC_SET_BUDGET
    const findCycle = (): number[] | null => {
        budget--
        const adjacency = adjacencyOfActive()
        const color = new Map<InfographNodeKey<Keys>, 0 | 1 | 2>()
        const enteredBy = new Map<InfographNodeKey<Keys>, number>()
        let cycle: number[] | null = null

        const visit = (node: InfographNodeKey<Keys>): boolean => {
            color.set(node, 1)
            for (const { to, edge } of adjacency.get(node)!) {
                const seen = color.get(to) ?? 0
                if (seen === 0) {
                    enteredBy.set(to, edge)
                    if (visit(to)) return true
                } else if (seen === 1) {
                    const path = [edge]
                    for (let x = node; x !== to; x = active[enteredBy.get(x)!].from) {
                        path.push(enteredBy.get(x)!)
                    }
                    cycle = path
                    return true
                }
            }
            color.set(node, 2)
            return false
        }

        for (const key of nodeKeys) {
            if ((color.get(key) ?? 0) === 0 && visit(key)) break
        }
        return cycle
    }

    // Exact min removals to break all cycles in the active graph, pruned by `limit`
    // (an upper bound on an acceptable answer). Returns > limit when infeasible within
    // it, or when the work budget is exhausted (the heuristic bound then wins).
    const solve = (limit: number): number => {
        if (budget <= 0) return limit + 1
        const cycle = findCycle()
        if (cycle === null) return 0
        if (limit <= 0) return 1

        let best = limit + 1
        for (const edge of cycle) {
            removed[edge] = true
            const sub = solve(Math.min(limit, best) - 1) + 1
            removed[edge] = false
            if (sub < best) best = sub
        }
        return best
    }

    const bound = heuristicBound()
    const exact = solve(bound)
    return selfLoops + Math.min(bound, exact)
}

function stats(values: number[]): Stats {
    if (values.length === 0) {
        return { min: 0, average: 0, max: 0 }
    }
    const sum = values.reduce((total, value) => total + value, 0)
    return {
        min: Math.min(...values),
        average: round(sum / values.length),
        max: Math.max(...values),
    }
}

function round(value: number): number {
    return Math.round(value * 100) / 100
}
