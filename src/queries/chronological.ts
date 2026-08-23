import type {
    BaseKeys,
    Complexity,
    Infograph,
    InfographDate,
    InfographEdge,
    InfographNode,
    InfographNodeKey,
} from '../types.js'
import { GraphDiagram, type GraphFormat, renderGraph } from '../graph.js'

export type ChronologicalComplexity = Partial<Record<Complexity, number>>

export type ChronologicalInput = {
    budget: number
    complexity?: ChronologicalComplexity
    // Root selection considers only nodes whose start date is on or after this cutoff
    // (falling back to all nodes if none qualify).
    cutoff?: Date
}

// A selected node with the graph quantities used/produced by the traversal. `parent`
// is the minimum-cost-path-tree parent — the tree is pure traversal structure (the
// solid layer) and carries no verb; relationships live on the semantic edges below.
export type ThreadStep<Keys extends BaseKeys> = {
    node: InfographNodeKey<Keys>
    date?: InfographDate
    nodeCost: number // complexity weight of this node
    edgeCost?: number // complexity weight of the tree edge from the parent (absent for the root)
    depth: number // depth in the minimum-cost path tree (root = 0)
    parent?: InfographNodeKey<Keys> // minimum-cost-path-tree parent (absent for the root)
}

// A relationship among selected nodes, in its true semantic direction.
export type ThreadEdge<Keys extends BaseKeys> = {
    from: InfographNodeKey<Keys>
    to: InfographNodeKey<Keys>
    verb: Keys['verb']
}

// A frontier edge: exactly one endpoint is in the thread. The excluded endpoint is a
// Q/A handle — a place the presentation can branch into on demand.
export type BoundaryHandle<Keys extends BaseKeys> = {
    from: InfographNodeKey<Keys>
    to: InfographNodeKey<Keys>
    verb: Keys['verb']
    external: InfographNodeKey<Keys> // the endpoint outside the thread
    date?: InfographDate // date of the external node
    reason: 'budget' | 'cutoff' // why it is outside: unaffordable, or dated before the cutoff
    nodeCost: number // complexity weight of the external node
    edgeCost: number // complexity weight of the boundary edge
}

export type ChronologicalThread<Keys extends BaseKeys> = {
    root: InfographNodeKey<Keys>
    budget: number
    // Selected nodes in chronological presentation order (by date; undated last). The
    // Minimum-cost path structure is preserved in each step's parent/depth, not the order.
    steps: ThreadStep<Keys>[]
    // Every relationship among selected nodes, in semantic direction (the dotted layer).
    edges: ThreadEdge<Keys>[]
    // Frontier edges to excluded nodes — the Q/A handles.
    boundary: BoundaryHandle<Keys>[]
}

export const defaultChronologicalComplexity: Required<ChronologicalComplexity> = {
    simple: 1,
    natural: 2,
    contextual: 3,
    intertwined: 4,
}

// Render a thread as a graph with two link layers:
//   • solid links  = the minimum-cost path tree (parent → child), pure traversal structure;
//   • dotted links = every semantic relationship, in its true direction;
//   • boundary handles are external nodes reached by dotted edges.
export function threadToGraph<Keys extends BaseKeys>(thread: ChronologicalThread<Keys>, format: GraphFormat): string {
    const diagram = new GraphDiagram('TD')
    const day = (date?: InfographDate) => date?.from?.toISOString().split('T', 1)[0]
    const detail = (parts: (string | undefined)[]) => {
        const line = parts.filter(Boolean).join(' · ')
        return line ? `\n${line}` : ''
    }
    const weight = (nodeCost: number, edgeCost?: number) =>
        `n${nodeCost}${edgeCost === undefined ? '' : ` e${edgeCost}`}`

    thread.steps.forEach((step, index) => {
        diagram.addNode(
            step.node,
            `${index + 1} ${step.node}${detail([day(step.date), weight(step.nodeCost, step.edgeCost)])}`
        )
    })

    for (const step of thread.steps) {
        if (step.parent) diagram.addEdge(step.parent, step.node)
    }
    for (const edge of thread.edges) {
        diagram.addEdge(edge.from, edge.to, { label: edge.verb, style: 'dotted' })
    }

    const handles = new Map(thread.boundary.map(handle => [handle.external, handle.date]))
    for (const [external, date] of handles) {
        diagram.addNode(external, `${external}${detail([day(date)])}`, { shape: 'stadium' })
    }
    for (const handle of thread.boundary) {
        diagram.addEdge(handle.from, handle.to, {
            label: `${handle.verb} · ${weight(handle.nodeCost, handle.edgeCost)} ${handle.reason}`,
            style: 'dotted',
        })
    }

    return renderGraph(diagram, format)
}

export function threadToMermaid<Keys extends BaseKeys>(thread: ChronologicalThread<Keys>): string {
    return threadToGraph(thread, 'mermaid')
}

// Format a cost as "<after>=<before>+<edge>+<node>" — a terse, locally-readable decomposition
// of the running path total (after = before + incoming edge + node). Single source for the
// notation documented in the notes' `format.cost`.
function formatCost(before: number, edge: number, node: number): string {
    return `${before + edge + node}=${before}+${edge}+${node}`
}

// Render a thread as a presentation-notes document (for json/yaml) — a flat,
// read-only structure meant for reading, not parsing back. One root-level section per
// numbered step, in chronological presentation order, each with its node info and `->`
// for outgoing/`<-` for incoming (every semantic edge, grouped by verb) plus boundary
// handles. Follows the presentation-order-first 1-explanation rule:
// a traversal node's info appears only at its own step; a boundary node's info and each edge's
// info appear once, at first appearance in document order. Needs the infograph for the node and
// edge payloads the thread does not carry.
export function threadToNotes<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    thread: ChronologicalThread<Keys>,
    config?: {
        copyNodeEdgesInfos?: boolean
    }
): Record<string, unknown> {
    const numberOf = new Map(thread.steps.map((step, index) => [step.node, index + 1] as const))
    const stepByNode = new Map(thread.steps.map(step => [step.node, step] as const))
    const label = (node: InfographNodeKey<Keys>) => `${numberOf.get(node)} ${node}`

    // Cumulative path-cost, memoized over the minimum-cost-path-tree parent chain (steps are date-sorted, not
    // parent-before-child, so recurse). Root: just its node weight; else parent's total + edge + node.
    const cumulativeCache = new Map<InfographNodeKey<Keys>, number>()
    const cumulative = (node: InfographNodeKey<Keys>): number => {
        const cached = cumulativeCache.get(node)
        if (cached !== undefined) return cached
        const step = stepByNode.get(node)!
        const value =
            step.parent === undefined ? step.nodeCost : cumulative(step.parent) + (step.edgeCost ?? 0) + step.nodeCost
        cumulativeCache.set(node, value)
        return value
    }

    const verbOrder = new Map(Object.keys(infograph.domain.verb).map((verb, index) => [verb, index] as const))
    const edgeInfoOf = (from: InfographNodeKey<Keys>, verb: Keys['verb'], to: InfographNodeKey<Keys>) =>
        infograph.edges.find(edge => edge.from === from && edge.verb === verb && edge.to === to)?.info

    // First-appearance bookkeeping, consumed strictly in document order (see emitStep's key order).
    const seenEdges = new Set<string>()
    const explainedBoundary = new Set<InfographNodeKey<Keys>>()
    const edgeKey = (from: string, verb: string, to: string) => `${from}\u0000${verb}\u0000${to}`

    type Item =
        | {
              kind: 'internal'
              from: InfographNodeKey<Keys>
              to: InfographNodeKey<Keys>
              verb: Keys['verb']
              other: InfographNodeKey<Keys>
          }
        | { kind: 'boundary'; handle: BoundaryHandle<Keys> }

    // Within a verb group: traversal entries first (by step number), then boundary (by date, key).
    const compareItems = (a: Item, b: Item): number => {
        const rank = (item: Item) => (item.kind === 'internal' ? 0 : 1)
        if (rank(a) !== rank(b)) return rank(a) - rank(b)
        if (a.kind === 'internal' && b.kind === 'internal') return numberOf.get(a.other)! - numberOf.get(b.other)!
        if (a.kind === 'boundary' && b.kind === 'boundary') {
            return (
                compareDates(a.handle.date, b.handle.date) ||
                (a.handle.external < b.handle.external ? -1 : a.handle.external > b.handle.external ? 1 : 0)
            )
        }
        return 0
    }

    // Outgoing (dir='out') or incoming (dir='in') edges of a node: every internal edge + boundary
    // handle in that direction, grouped by verb, verb groups in domain-declaration order.
    const edgeSection = (node: InfographNodeKey<Keys>, dir: 'out' | 'in') => {
        const items: Item[] = []
        for (const edge of thread.edges) {
            if (dir === 'out' ? edge.from === node : edge.to === node) {
                items.push({
                    kind: 'internal',
                    from: edge.from,
                    to: edge.to,
                    verb: edge.verb,
                    other: dir === 'out' ? edge.to : edge.from,
                })
            }
        }
        for (const handle of thread.boundary) {
            if (dir === 'out' ? handle.from === node : handle.to === node) items.push({ kind: 'boundary', handle })
        }
        if (items.length === 0) return undefined

        const byVerb = new Map<Keys['verb'], Item[]>()
        for (const item of items) {
            const verb = item.kind === 'internal' ? item.verb : item.handle.verb
            const group = byVerb.get(verb)
            if (group) group.push(item)
            else byVerb.set(verb, [item])
        }

        const section: Record<string, unknown> = {}
        for (const verb of [...byVerb.keys()].sort((a, b) => (verbOrder.get(a) ?? 0) - (verbOrder.get(b) ?? 0))) {
            const entries: Record<string, unknown> = {}
            for (const item of byVerb.get(verb)!.sort(compareItems)) {
                if (item.kind === 'internal') {
                    const body: Record<string, unknown> = {}
                    const key = edgeKey(item.from, item.verb, item.to)
                    if (config?.copyNodeEdgesInfos && !seenEdges.has(key)) {
                        seenEdges.add(key)
                        const info = edgeInfoOf(item.from, item.verb, item.to)
                        if (info) body.with = info
                    }
                    // Traversal node: never explained here — referenced by number, body empty if the edge was seen.
                    entries[label(item.other)] = Object.keys(body).length ? body : null
                } else {
                    const handle = item.handle
                    const body: Record<string, unknown> = {
                        boundary: {
                            for: handle.reason,
                            cost: formatCost(cumulative(node), handle.edgeCost, handle.nodeCost),
                        },
                    }
                    const key = edgeKey(handle.from, handle.verb, handle.to)
                    if (config?.copyNodeEdgesInfos && !seenEdges.has(key)) {
                        seenEdges.add(key)
                        const info = edgeInfoOf(handle.from, handle.verb, handle.to)
                        if (info) body.with = info
                    }
                    if (config?.copyNodeEdgesInfos && !explainedBoundary.has(handle.external)) {
                        explainedBoundary.add(handle.external)
                        const payload = infograph.nodes.get(handle.external)
                        if (payload) body.info = payload
                    }
                    entries[handle.external] = body
                }
            }
            section[verb] = entries
        }
        return section
    }

    const emitStep = (node: InfographNodeKey<Keys>): Record<string, unknown> => {
        const step = stepByNode.get(node)!
        const obj: Record<string, unknown> = {
            with: { cost: formatCost(step.parent ? cumulative(step.parent) : 0, step.edgeCost ?? 0, step.nodeCost) },
        }
        const payload = infograph.nodes.get(node)
        if (config?.copyNodeEdgesInfos && payload) obj.info = payload
        const outgoing = edgeSection(node, 'out')
        if (outgoing) obj['->'] = outgoing
        const incoming = edgeSection(node, 'in')
        if (incoming) obj['<-'] = incoming
        return obj
    }

    const notes: Record<string, unknown> = {
        info: { root: thread.root, budget: thread.budget },
        format: {
            cost: '(cost after)=(cost before)+(cost of incoming edge)+(cost of node)',
            '->': 'outgoing edges',
            '<-': 'incoming edges',
        },
    }
    for (const step of thread.steps) notes[label(step.node)] = emitStep(step.node)
    return notes
}

// Summary statistics of a thread, for comparing projections of the same infograph across
// budgets. Derived entirely from the thread.
export type ThreadStats = {
    nodes: number // traversed node count
    edges: number // internal relationships among traversed nodes
    boundaryNodes: number // distinct external handle nodes
    boundaryEdges: number // frontier edges
    maxDepth: number // deepest minimum-cost path-tree depth reached (root = 0)
    reasons: { budget: number; cutoff: number } // frontier edges split by why they're outside
}

export type ChronologicalComparisonInput = Omit<ChronologicalInput, 'budget'> & {
    budgets: Iterable<number>
}

export type ChronologicalComparison = ThreadStats & {
    budget: number
    coverage: number
}

export function threadStats<Keys extends BaseKeys>(thread: ChronologicalThread<Keys>): ThreadStats {
    const reasons = { budget: 0, cutoff: 0 }
    for (const handle of thread.boundary) reasons[handle.reason]++
    return {
        nodes: thread.steps.length,
        edges: thread.edges.length,
        boundaryNodes: new Set(thread.boundary.map(handle => handle.external)).size,
        boundaryEdges: thread.boundary.length,
        maxDepth: thread.steps.reduce((max, step) => Math.max(max, step.depth), 0),
        reasons,
    }
}

/** Compare the same chronological projection across explicitly chosen budgets. */
export function compareChronologicalBudgets<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    input: ChronologicalComparisonInput
): ChronologicalComparison[] {
    return Iterator.from(input.budgets)
        .map(budget => {
            const stats = threadStats(chronological(infograph, { ...input, budget }))
            return { budget, ...stats, coverage: round(stats.nodes / infograph.nodes.size) }
        })
        .toArray()
}

export function chronological<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    input: ChronologicalInput
): ChronologicalThread<Keys> {
    const complexity = { ...defaultChronologicalComplexity, ...input.complexity }
    for (const [level, cost] of Object.entries(complexity)) {
        if (!Number.isFinite(cost) || cost < 0) {
            throw new Error(`Chronological complexity cost '${level}' must be a finite non-negative number`)
        }
    }
    const root = chooseRoot(infograph, input.cutoff)
    // Prune only nodes whose range ends before the cutoff. A node that straddles the
    // cutoff (starts before, ends on/after) overlaps the period and is kept, as are
    // undated (timeless) nodes.
    const withinCutoff = (node: InfographNodeKey<Keys>) => {
        if (!input.cutoff) return true
        const date = infograph.nodes.get(node)?.date
        return date === undefined || date.to.valueOf() >= input.cutoff.valueOf()
    }
    const edgeOrder = new Map(infograph.edges.map((edge, index) => [edge, index] as const))

    // Per selected node: this node's weight, the weight of its minimum-cost tree edge
    // (absent for the root), tree depth, and tree parent. Map insertion order records
    // first reach and provides a stable final ordering tie-breaker.
    type Meta = { nodeCost: number; edgeCost?: number; depth: number; parent?: InfographNodeKey<Keys> }
    const meta = new Map<InfographNodeKey<Keys>, Meta>()
    const pathCost = new Map<InfographNodeKey<Keys>, number>()
    const reachedOrder = new Map<InfographNodeKey<Keys>, number>()
    const settled = new Set<InfographNodeKey<Keys>>()
    let nextReachedOrder = 0

    const rootCost = nodeComplexity(infograph.nodes.get(root)!, complexity)
    meta.set(root, { nodeCost: rootCost, depth: 0 })
    pathCost.set(root, rootCost)
    reachedOrder.set(root, nextReachedOrder++)

    // Dijkstra-style relaxation: a node is selected when at least one path reaches it
    // within budget, and a later cheaper path replaces its tentative parent/cost. All
    // configured costs are non-negative, so settling the cheapest tentative node makes
    // its path final and traversal order cannot block a cheaper route discovered later.
    while (true) {
        const node = [...pathCost.keys()]
            .filter(candidate => !settled.has(candidate))
            .sort(
                (a, b) =>
                    compareNumbers(pathCost.get(a)!, pathCost.get(b)!) ||
                    compareDates(infograph.nodes.get(a)?.date, infograph.nodes.get(b)?.date) ||
                    compareNumbers(reachedOrder.get(a)!, reachedOrder.get(b)!)
            )[0]

        if (node === undefined) break
        settled.add(node)

        const candidates = incidentEdges(infograph, node)
            .filter(edge => withinCutoff(otherNode(edge, node)))
            .sort((a, b) => compareCandidates(infograph, node, edgeOrder, a, b))

        for (const edge of candidates) {
            const next = otherNode(edge, node)
            if (settled.has(next)) continue

            const nodeCost = nodeComplexity(infograph.nodes.get(next)!, complexity)
            const edgeCost = edgeComplexity(edge, complexity)
            const candidateCost = pathCost.get(node)! + edgeCost + nodeCost

            if (candidateCost > input.budget) continue

            const knownCost = pathCost.get(next)
            if (knownCost !== undefined && knownCost <= candidateCost) continue

            if (knownCost === undefined) reachedOrder.set(next, nextReachedOrder++)
            pathCost.set(next, candidateCost)
            meta.set(next, { nodeCost, edgeCost, depth: meta.get(node)!.depth + 1, parent: node })
        }
    }

    const selected = meta
    const discovery = new Map([...meta.keys()].map((node, index) => [node, index] as const))

    // §3: present the selected nodes in chronological order; the minimum-cost path structure lives in
    // each step's parent/depth, not the ordering. Undated nodes sort last.
    const steps: ThreadStep<Keys>[] = [...meta.entries()]
        .map(([node, m]) => ({ node, date: infograph.nodes.get(node)?.date, ...m }))
        .sort((a, b) => compareDates(a.date, b.date) || compareNumbers(discovery.get(a.node)!, discovery.get(b.node)!))

    // Every relationship among selected nodes (the dotted layer).
    const edges: ThreadEdge<Keys>[] = infograph.edges
        .filter(edge => selected.has(edge.from) && selected.has(edge.to))
        .map(edge => ({ from: edge.from, to: edge.to, verb: edge.verb }))

    // §4: the edge boundary of the selected set — the Q/A handles.
    const boundary: BoundaryHandle<Keys>[] = infograph.edges
        .filter(edge => selected.has(edge.from) !== selected.has(edge.to))
        .map(edge => {
            const external = selected.has(edge.from) ? edge.to : edge.from
            const node = infograph.nodes.get(external)!
            const prunedByCutoff =
                input.cutoff !== undefined && node.date !== undefined && node.date.to.valueOf() < input.cutoff.valueOf()
            return {
                from: edge.from,
                to: edge.to,
                verb: edge.verb,
                external,
                date: node.date,
                reason: prunedByCutoff ? ('cutoff' as const) : ('budget' as const),
                nodeCost: nodeComplexity(node, complexity),
                edgeCost: edgeComplexity(edge, complexity),
            }
        })

    return { root, budget: input.budget, steps, edges, boundary }
}

export function chooseRoot<Keys extends BaseKeys>(infograph: Infograph<Keys>, cutoff?: Date): InfographNodeKey<Keys> {
    let candidates = [...infograph.nodes.keys()]

    if (candidates.length === 0) {
        throw new Error('Cannot choose chronological root from an empty infograph')
    }

    if (cutoff) {
        const eligible = candidates.filter(node => {
            const from = infograph.nodes.get(node)?.date?.from
            return from !== undefined && from.valueOf() >= cutoff.valueOf()
        })
        if (eligible.length > 0) candidates = eligible
    }

    const inputOrder = new Map(candidates.map((node, index) => [node, index] as const))

    candidates.sort((a, b) => {
        const aNode = infograph.nodes.get(a)
        const bNode = infograph.nodes.get(b)

        return (
            compareDates(aNode?.date, bNode?.date) ||
            compareDates(aNode?.date, bNode?.date) ||
            compareNumbers(outgoingCount(infograph, b), outgoingCount(infograph, a)) ||
            compareNumbers(inputOrder.get(a) ?? 0, inputOrder.get(b) ?? 0)
        )
    })

    return candidates[0]
}

function incidentEdges<Keys extends BaseKeys>(infograph: Infograph<Keys>, node: InfographNodeKey<Keys>) {
    return infograph.edges.filter(edge => edge.from === node || edge.to === node)
}

function otherNode<Keys extends BaseKeys>(
    edge: InfographEdge<Keys>,
    node: InfographNodeKey<Keys>
): InfographNodeKey<Keys> {
    if (edge.from === node) return edge.to
    if (edge.to === node) return edge.from

    throw new Error(`Edge is not incident to node: ${node}`)
}

function compareCandidates<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    currentNode: InfographNodeKey<Keys>,
    edgeOrder: Map<InfographEdge<Keys>, number>,
    a: InfographEdge<Keys>,
    b: InfographEdge<Keys>
) {
    const aOther = infograph.nodes.get(otherNode(a, currentNode))
    const bOther = infograph.nodes.get(otherNode(b, currentNode))

    return (
        compareDates(aOther?.date, bOther?.date) ||
        compareNumbers(directionPriority(a, currentNode), directionPriority(b, currentNode)) ||
        compareNumbers(edgeOrder.get(a) ?? 0, edgeOrder.get(b) ?? 0)
    )
}

function directionPriority<Keys extends BaseKeys>(edge: InfographEdge<Keys>, currentNode: InfographNodeKey<Keys>) {
    return edge.from === currentNode ? 0 : 1
}

function outgoingCount<Keys extends BaseKeys>(infograph: Infograph<Keys>, node: InfographNodeKey<Keys>) {
    return infograph.edges.filter(edge => edge.from === node).length
}

function nodeComplexity<Keys extends BaseKeys>(
    node: InfographNode<Keys>,
    complexity: Required<ChronologicalComplexity>
) {
    return complexity[node.complexity.is]
}

function edgeComplexity<Keys extends BaseKeys>(
    edge: InfographEdge<Keys>,
    complexity: Required<ChronologicalComplexity>
) {
    return complexity[edge.info.complexity.is]
}

function compareDates(a: InfographDate | undefined, b: InfographDate | undefined) {
    return compareNumbers(dateValue(a?.from), dateValue(b?.from)) || compareNumbers(dateValue(a?.to), dateValue(b?.to))
}

function dateValue(date: Date | undefined) {
    return date?.valueOf() ?? Number.POSITIVE_INFINITY
}

function compareNumbers(a: number, b: number) {
    return a === b ? 0 : a < b ? -1 : 1
}

function round(value: number) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0
}
