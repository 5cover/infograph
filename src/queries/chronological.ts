import type { BaseKeys, Complexity, Infograph, InfographNode, InfographNodeKey } from '../types'

export type InfographEdge<Keys extends BaseKeys> = Infograph<Keys>['edges'][number]

export type ChronologicalComplexity = Partial<Record<Complexity, number>> & {
    missing?: number
}

export type ChronologicalInput = {
    budget: number
    complexity?: ChronologicalComplexity
}

export type TraversedEdge<Keys extends BaseKeys> = {
    edge: InfographEdge<Keys>
    reversed?: boolean
}

export type ChronologicalThread<Keys extends BaseKeys> = {
    root: InfographNodeKey<Keys>
    edges: TraversedEdge<Keys>[]
}

export const defaultChronologicalComplexity: Required<ChronologicalComplexity> = {
    simple: 1,
    natural: 2,
    contextual: 4,
    intertwined: 8,
    missing: 1,
}

export function chronological<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    input: ChronologicalInput,
): ChronologicalThread<Keys> {
    const complexity = { ...defaultChronologicalComplexity, ...input.complexity }
    const root = chooseRoot(infograph)
    const visitedGlobal = new Set<InfographNodeKey<Keys>>()
    const currentBranch = new Set<InfographNodeKey<Keys>>()
    const output: TraversedEdge<Keys>[] = []
    const edgeOrder = new Map(infograph.edges.map((edge, index) => [edge, index] as const))

    dfs(root, nodeComplexity(infograph.nodes.get(root), complexity))

    return {
        root,
        edges: output,
    }

    function dfs(node: InfographNodeKey<Keys>, branchCost: number) {
        visitedGlobal.add(node)
        currentBranch.add(node)

        const candidates = incidentEdges(infograph, node)
            .filter(edge => !currentBranch.has(otherNode(edge, node)))
            .sort((a, b) => compareCandidates(infograph, node, edgeOrder, a, b))

        for (const edge of candidates) {
            const next = otherNode(edge, node)
            const nextCost = branchCost + cost(infograph.nodes.get(next), edge, complexity)

            if (nextCost > input.budget) continue

            const alreadyVisited = visitedGlobal.has(next)

            output.push({
                edge,
                reversed: node === edge.to ? true : undefined,
            })

            if (!alreadyVisited) {
                dfs(next, nextCost)
            }
        }

        currentBranch.delete(node)
    }
}

export function chooseRoot<Keys extends BaseKeys>(infograph: Infograph<Keys>): InfographNodeKey<Keys> {
    const candidates = [...infograph.nodes.keys()]

    if (candidates.length === 0) {
        throw new Error('Cannot choose chronological root from an empty infograph')
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
    node: InfographNodeKey<Keys>,
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
    b: InfographEdge<Keys>,
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
    node: InfographNode<Keys> | undefined,
    edge: InfographEdge<Keys>,
    complexity: Required<ChronologicalComplexity>,
) {
    return nodeComplexity(node, complexity) + complexityValue(edge.info.complexity?.is, complexity)
}

function nodeComplexity<Keys extends BaseKeys>(
    node: InfographNode<Keys> | undefined,
    complexity: Required<ChronologicalComplexity>,
) {
    return complexityValue(node?.complexity?.is, complexity)
}

function complexityValue(value: Complexity | undefined, complexity: Required<ChronologicalComplexity>) {
    return value ? complexity[value] : complexity.missing
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
