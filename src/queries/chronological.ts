import { Flowchart } from 'mermaid-ast'
import type { BaseKeys, Complexity, Infograph, InfographNode, InfographNodeKey } from '../types.js'
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

export type ChronologicalThread<Keys extends BaseKeys> = {
    root: InfographNodeKey<Keys>
    // Edges in traversal (presentation) order. The traversal direction is not stored:
    // one endpoint of each edge is always already visited when it is reached, so the
    // reading order is recoverable from the sequence alone.
    edges: InfographEdge<Keys>[]
}

export const defaultChronologicalComplexity: Required<ChronologicalComplexity> = {
    simple: 1,
    natural: 2,
    contextual: 4,
    intertwined: 8,
}

// Render a traversal thread as a Mermaid flowchart with two overlaid link layers.
// The thread is a presentation order: a linear narrative read node by node. Solid
// links are that reading path (each node to the next one discovered — an already-seen
// node is never revisited), and dotted links are the traversed semantic edges carrying
// the verb, which reveal how each newly-introduced node actually attaches to one seen
// earlier. Node labels are prefixed with their 1-based position in the narrative.
export function threadToMermaid<Keys extends BaseKeys>(thread: ChronologicalThread<Keys>): string {
    const order = new Map<InfographNodeKey<Keys>, number>([[thread.root, 0]])
    const appear = (key: InfographNodeKey<Keys>) => {
        if (!order.has(key)) order.set(key, order.size)
    }
    // Nodes are discovered as edges are traversed; one endpoint of each edge is always
    // already seen, so this yields the visitation (presentation) order.
    for (const edge of thread.edges) {
        appear(edge.from)
        appear(edge.to)
    }

    const sequence = [...order.keys()]
    const flowchart = Flowchart.create('TD')
    sequence.forEach((key, index) => flowchart.addNode(sanitizeId(key), `${index + 1} ${key}`))

    // solid: the reading path through nodes in discovery order.
    for (let i = 0; i + 1 < sequence.length; i++) {
        flowchart.addLink(sanitizeId(sequence[i]), sanitizeId(sequence[i + 1]), {})
    }
    // dotted: the semantic edges, with their verbs.
    for (const edge of thread.edges) {
        flowchart.addLink(sanitizeId(edge.from), sanitizeId(edge.to), { text: edge.verb, stroke: 'dotted' })
    }
    return render(flowchart)
}

export function chronological<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    input: ChronologicalInput
): ChronologicalThread<Keys> {
    const complexity = { ...defaultChronologicalComplexity, ...input.complexity }
    const root = chooseRoot(infograph, input.cutoff)
    // Prune nodes dated before the cutoff from the whole traversal. Undated nodes are
    // timeless context (tools, actors) and are kept.
    const withinCutoff = (node: InfographNodeKey<Keys>) => {
        if (!input.cutoff) return true
        const from = infograph.nodes.get(node)?.date?.from
        return from === undefined || from.valueOf() >= input.cutoff.valueOf()
    }
    const visitedGlobal = new Set<InfographNodeKey<Keys>>()
    const currentBranch = new Set<InfographNodeKey<Keys>>()
    const output: InfographEdge<Keys>[] = []
    const edgeOrder = new Map(infograph.edges.map((edge, index) => [edge, index] as const))

    dfs(root, nodeComplexity(infograph.nodes.get(root)!, complexity))

    return {
        root,
        edges: output,
    }

    function dfs(node: InfographNodeKey<Keys>, branchCost: number) {
        visitedGlobal.add(node)
        currentBranch.add(node)

        const candidates = incidentEdges(infograph, node)
            .filter(edge => !currentBranch.has(otherNode(edge, node)))
            .filter(edge => withinCutoff(otherNode(edge, node)))
            .sort((a, b) => compareCandidates(infograph, node, edgeOrder, a, b))

        for (const edge of candidates) {
            const next = otherNode(edge, node)
            const nextCost = branchCost + cost(infograph.nodes.get(next)!, edge, complexity)

            if (nextCost > input.budget) continue

            const alreadyVisited = visitedGlobal.has(next)

            output.push(edge)

            if (!alreadyVisited) {
                dfs(next, nextCost)
            }
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
