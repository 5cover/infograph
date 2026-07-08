import { Flowchart } from 'mermaid-ast'
import type { BaseKeys, Complexity, Infograph, InfographDate, InfographNode, InfographNodeKey } from '../types.js'
import { render, sanitizeId } from '../mermaid.js'

export type InfographEdge<Keys extends BaseKeys> = Infograph<Keys>['edges'][number]

export type ChronologicalComplexity = Partial<Record<Complexity, number>>

export type ChronologicalInput = {
    budget: number
    complexity?: ChronologicalComplexity
    // Root selection considers only nodes whose start date is on or after this cutoff
    // (falling back to all nodes if none qualify).
    cutoff?: Date
}

// A selected node with the graph quantities used/produced by the traversal. `parent`
// is the DFS-tree parent — the tree is pure traversal structure (the solid layer) and
// carries no verb; relationships live on the semantic edges below.
export type ThreadStep<Keys extends BaseKeys> = {
    node: InfographNodeKey<Keys>
    date?: InfographDate
    nodeCost: number // complexity weight of this node
    edgeCost?: number // complexity weight of the tree edge from the parent (absent for the root)
    depth: number // depth in the DFS tree (root = 0)
    parent?: InfographNodeKey<Keys> // DFS-tree parent (absent for the root)
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
    // DFS discovery structure is preserved in each step's parent/depth, not the order.
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

// Render a thread as a Mermaid flowchart with two link layers:
//   • solid links  = the DFS tree (parent → child) — pure traversal structure, no verb,
//     so the discovery hierarchy and backtracking are legible as tree shape;
//   • dotted links = every relationship, in semantic direction with its verb (a tree
//     edge appears both solid, for structure, and dotted, for its relationship);
//   • node numbers = chronological presentation order (§3), with date and cumulative
//     path-cost on the label (§5); boundary handles are external nodes reached by
//     dotted edges labelled verb + reason + marginal cost.
export function threadToMermaid<Keys extends BaseKeys>(thread: ChronologicalThread<Keys>): string {
    const flowchart = Flowchart.create('TD')
    const day = (date?: InfographDate) => date?.from?.toISOString().split('T', 1)[0]
    const detail = (parts: (string | undefined)[]) => {
        const line = parts.filter(Boolean).join(' · ')
        return line ? `<br>${line}` : ''
    }
    const weight = (nodeCost: number, edgeCost?: number) =>
        `n${nodeCost}${edgeCost === undefined ? '' : ` e${edgeCost}`}`

    // Selected nodes, numbered in chronological order.
    thread.steps.forEach((step, index) => {
        flowchart.addNode(
            sanitizeId(step.node),
            `${index + 1} ${step.node}${detail([day(step.date), weight(step.nodeCost, step.edgeCost)])}`
        )
    })

    // solid: DFS tree edges (parent → child), unlabelled — traversal structure only.
    for (const step of thread.steps) {
        if (step.parent) flowchart.addLink(sanitizeId(step.parent), sanitizeId(step.node), {})
    }

    // dotted: every relationship among selected nodes, in semantic direction.
    for (const edge of thread.edges) {
        flowchart.addLink(sanitizeId(edge.from), sanitizeId(edge.to), { text: edge.verb, stroke: 'dotted' })
    }

    // boundary: external handle nodes (round) reached by dotted edges.
    const handles = new Map(thread.boundary.map(handle => [handle.external, handle.date]))
    for (const [external, date] of handles) {
        flowchart.addNode(sanitizeId(external), `${external}${detail([day(date)])}`, { shape: 'stadium' })
    }
    for (const handle of thread.boundary) {
        flowchart.addLink(sanitizeId(handle.from), sanitizeId(handle.to), {
            text: `${handle.verb} · ${weight(handle.nodeCost, handle.edgeCost)} ${handle.reason}`,
            stroke: 'dotted',
        })
    }

    return render(flowchart)
}

// Format a cost as "<after>=<before>+<edge>+<node>" — a terse, locally-readable decomposition
// of the running path total (after = before + incoming edge + node). Single source for the
// notation documented in the notes' `format.cost`.
function formatCost(before: number, edge: number, node: number): string {
    return `${before + edge + node}=${before}+${edge}+${node}`
}

// Render a thread as a presentation-notes document (for json/yaml) — a deeply nested,
// read-only structure meant for reading, not parsing back. One section per numbered step,
// nested by the DFS tree, each with its node info and `->` for outgoing/`<-` for incoming (every semantic
// edge, grouped by verb) plus boundary handles. Follows the traversal-first 1-explanation rule:
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

    // Cumulative path-cost, memoized over the DFS-tree parent chain (steps are date-sorted, not
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
    const edgeKey = (from: string, verb: string, to: string) => `${from} ${verb} ${to}`

    const children = (node: InfographNodeKey<Keys>) =>
        thread.steps.filter(step => step.parent === node).sort((a, b) => numberOf.get(a.node)! - numberOf.get(b.node)!)

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
                compareDates(a.handle.date?.from, b.handle.date?.from) ||
                (a.handle.external < b.handle.external ? -1
                : a.handle.external > b.handle.external ? 1
                : 0)
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
        for (const child of children(node)) obj[label(child.node)] = emitStep(child.node)
        return obj
    }

    return {
        info: { root: thread.root, budget: thread.budget },
        format: {
            cost: '(cost after)=(cost before)+(cost of incoming edge)+(cost of node)',
            '->': 'outgoing edges',
            '<-': 'incoming edges',
        },
        [label(thread.root)]: emitStep(thread.root),
    }
}

// Summary statistics of a thread, for comparing projections of the same infograph across
// budgets. Derived entirely from the thread.
export type ThreadStats = {
    nodes: number // traversed node count
    edges: number // internal relationships among traversed nodes
    boundaryNodes: number // distinct external handle nodes
    boundaryEdges: number // frontier edges
    maxDepth: number // deepest DFS depth reached (root = 0)
    reasons: { budget: number; cutoff: number } // frontier edges split by why they're outside
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

export function chronological<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    input: ChronologicalInput
): ChronologicalThread<Keys> {
    const complexity = { ...defaultChronologicalComplexity, ...input.complexity }
    const root = chooseRoot(infograph, input.cutoff)
    // Prune only nodes whose range ends before the cutoff. A node that straddles the
    // cutoff (starts before, ends on/after) overlaps the period and is kept, as are
    // undated (timeless) nodes.
    const withinCutoff = (node: InfographNodeKey<Keys>) => {
        if (!input.cutoff) return true
        const date = infograph.nodes.get(node)?.date
        return date === undefined || date.to.valueOf() >= input.cutoff.valueOf()
    }
    const currentBranch = new Set<InfographNodeKey<Keys>>()
    const edgeOrder = new Map(infograph.edges.map((edge, index) => [edge, index] as const))

    // Per selected node: this node's weight, the weight of its tree edge (absent for the
    // root), DFS depth, and DFS-tree parent. Map insertion order is the DFS discovery
    // (pre-)order. The running path-total used for the budget is threaded through dfs(),
    // not stored.
    type Meta = { nodeCost: number; edgeCost?: number; depth: number; parent?: InfographNodeKey<Keys> }
    const meta = new Map<InfographNodeKey<Keys>, Meta>()

    const rootCost = nodeComplexity(infograph.nodes.get(root)!, complexity)
    meta.set(root, { nodeCost: rootCost, depth: 0 })
    dfs(root, rootCost)

    const selected = meta
    const discovery = new Map([...meta.keys()].map((node, index) => [node, index] as const))

    // §3: present the selected nodes in chronological order; the DFS structure lives in
    // each step's parent/depth, not the ordering. Undated nodes sort last.
    const steps: ThreadStep<Keys>[] = [...meta.entries()]
        .map(([node, m]) => ({ node, date: infograph.nodes.get(node)?.date, ...m }))
        .sort(
            (a, b) =>
                compareDates(a.date?.from, b.date?.from) ||
                compareNumbers(discovery.get(a.node)!, discovery.get(b.node)!)
        )

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

    function dfs(node: InfographNodeKey<Keys>, pathCost: number) {
        currentBranch.add(node)
        const depth = meta.get(node)!.depth

        const candidates = incidentEdges(infograph, node)
            .filter(edge => !currentBranch.has(otherNode(edge, node)))
            .filter(edge => withinCutoff(otherNode(edge, node)))
            .sort((a, b) => compareCandidates(infograph, node, edgeOrder, a, b))

        for (const edge of candidates) {
            const next = otherNode(edge, node)
            const nodeCost = nodeComplexity(infograph.nodes.get(next)!, complexity)
            const edgeCost = edgeComplexity(edge, complexity)

            if (pathCost + nodeCost + edgeCost > input.budget) continue
            if (meta.has(next)) continue

            meta.set(next, { nodeCost, edgeCost, depth: depth + 1, parent: node })
            dfs(next, pathCost + nodeCost + edgeCost)
        }

        currentBranch.delete(node)
    }
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
            compareDates(aNode?.date?.from, bNode?.date?.from) ||
            compareDates(aNode?.date?.to, bNode?.date?.to) ||
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
        compareDates(aOther?.date?.from, bOther?.date?.from) ||
        compareDates(aOther?.date?.to, bOther?.date?.to) ||
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

function compareDates(a: Date | undefined, b: Date | undefined) {
    return compareNumbers(dateValue(a), dateValue(b))
}

function dateValue(date: Date | undefined) {
    return date?.valueOf() ?? Number.POSITIVE_INFINITY
}

function compareNumbers(a: number, b: number) {
    return (
        a === b ? 0
        : a < b ? -1
        : 1
    )
}
