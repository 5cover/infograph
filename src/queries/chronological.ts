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
    cost: number // cumulative path-cost (node + edge complexity) from the root
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
    cost: number // marginal cost to include the external node
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

    // Selected nodes, numbered in chronological order.
    thread.steps.forEach((step, index) => {
        flowchart.addNode(sanitizeId(step.node), `${index + 1} ${step.node}${detail([day(step.date), `c${step.cost}`])}`)
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
            text: `${handle.verb} · +${handle.cost} ${handle.reason}`,
            stroke: 'dotted',
        })
    }

    return render(flowchart)
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

    // Per selected node: cumulative path-cost, DFS depth, and DFS-tree parent. Map
    // insertion order is the DFS discovery (pre-)order.
    type Meta = { cost: number; depth: number; parent?: InfographNodeKey<Keys> }
    const meta = new Map<InfographNodeKey<Keys>, Meta>()

    meta.set(root, { cost: nodeComplexity(infograph.nodes.get(root)!, complexity), depth: 0 })
    dfs(root)

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
                input.cutoff !== undefined &&
                node.date !== undefined &&
                node.date.to.valueOf() < input.cutoff.valueOf()
            return {
                from: edge.from,
                to: edge.to,
                verb: edge.verb,
                external,
                date: node.date,
                reason: prunedByCutoff ? ('cutoff' as const) : ('budget' as const),
                cost: cost(node, edge, complexity),
            }
        })

    return { root, budget: input.budget, steps, edges, boundary }

    function dfs(node: InfographNodeKey<Keys>) {
        currentBranch.add(node)
        const branchCost = meta.get(node)!.cost

        const candidates = incidentEdges(infograph, node)
            .filter(edge => !currentBranch.has(otherNode(edge, node)))
            .filter(edge => withinCutoff(otherNode(edge, node)))
            .sort((a, b) => compareCandidates(infograph, node, edgeOrder, a, b))

        for (const edge of candidates) {
            const next = otherNode(edge, node)
            const nextCost = branchCost + cost(infograph.nodes.get(next)!, edge, complexity)

            if (nextCost > input.budget) continue
            if (meta.has(next)) continue

            meta.set(next, { cost: nextCost, depth: meta.get(node)!.depth + 1, parent: node })
            dfs(next)
        }

        currentBranch.delete(node)
    }
}

export function chooseRoot<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    cutoff?: Date
): InfographNodeKey<Keys> {
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

function cost<Keys extends BaseKeys>(
    node: InfographNode<Keys>,
    edge: InfographEdge<Keys>,
    complexity: Required<ChronologicalComplexity>
) {
    return nodeComplexity(node, complexity) + complexity[edge.info.complexity.is]
}

function nodeComplexity<Keys extends BaseKeys>(
    node: InfographNode<Keys>,
    complexity: Required<ChronologicalComplexity>
) {
    return complexity[node.complexity.is]
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
