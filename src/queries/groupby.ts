import { Flowchart } from 'mermaid-ast'
import {
    complexity as complexityLevels,
    technicality as technicalityLevels,
    type BaseKeys,
    type Infograph,
    type InfographEdgeKey,
    type InfographNode,
    type InfographNodeKey,
} from '../types.js'
import { render, sanitizeId } from '../mermaid.js'
import { strcmp } from '../util.js'
import { parseEdgeKey, unparseEdgeKey } from '../infograph.js'

export type EdgeId<Keys extends BaseKeys> = InfographEdgeKey<Keys>
export type GroupRecord<Keys extends BaseKeys> = Record<InfographNodeKey<Keys>, EdgeId<Keys>[]>
export type GroupSort = 'alphabetical' | 'funnel'

type InfographEdge<Keys extends BaseKeys> = Infograph<Keys>['edges'][number]

type Assignment<Keys extends BaseKeys> = {
    distance: number
    sites: Set<InfographNodeKey<Keys>>
}

type QueueItem<Keys extends BaseKeys> = {
    edge: EdgeId<Keys>
    site: InfographNodeKey<Keys>
    distance: number
}

export function groupBySites<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    inputSites: Iterable<InfographNodeKey<Keys>>,
    sorted: GroupSort = 'alphabetical'
): GroupRecord<Keys> {
    const sites = [...new Set(inputSites)].sort(strcmp)
    for (const site of sites) {
        if (!infograph.nodes.has(site)) throw new Error(`Unknown Voronoi site: ${site}`)
    }

    const edgeIds = infograph.edges.map(unparseEdgeKey)
    const sortedEdgeIds = [...edgeIds].sort(strcmp)
    const edgeById = new Map<EdgeId<Keys>, InfographEdge<Keys>>()
    const incidence = new Map<InfographNodeKey<Keys>, EdgeId<Keys>[]>()

    for (let index = 0; index < infograph.edges.length; index++) {
        const edge = infograph.edges[index]
        const id = edgeIds[index]
        if (edgeById.has(id)) throw new Error(`Duplicate edge ID cannot be grouped: ${id}`)
        edgeById.set(id, edge)
        addIncident(incidence, edge.from, id)
        addIncident(incidence, edge.to, id)
    }

    for (const ids of incidence.values()) ids.sort(strcmp)

    const assignments = new Map<EdgeId<Keys>, Assignment<Keys>>()
    const queue: QueueItem<Keys>[] = []

    for (const site of sites) {
        for (const id of incidence.get(site) ?? []) {
            addReach(assignments, queue, id, site, 0)
        }
    }

    for (let head = 0; head < queue.length; head++) {
        const item = queue[head]
        const assignment = assignments.get(item.edge)
        if (assignment === undefined || assignment.distance !== item.distance || !assignment.sites.has(item.site)) {
            continue
        }

        for (const next of adjacentEdges(edgeById, incidence, item.edge)) {
            addReach(assignments, queue, next, item.site, item.distance + 1)
        }
    }

    const unreachable = sortedEdgeIds.filter(id => !assignments.has(id))
    if (unreachable.length > 0) {
        throw new Error(`Cannot group edges unreachable from any Voronoi site: ${unreachable.join(', ')}`)
    }

    const result = Object.fromEntries(sites.map(site => [site, [] as EdgeId<Keys>[]])) as GroupRecord<Keys>
    for (const id of sortedEdgeIds) {
        for (const site of [...assignments.get(id)!.sites].sort(strcmp)) {
            result[site].push(id)
        }
    }

    return sortGroupRecord(infograph, result, sorted)
}

/**
 * Sort each already-assigned group without changing its membership. Alphabetical is
 * the historical output order; funnel is a small, deterministic, local continuity
 * heuristic for report preparation.
 */
export function sortGroupRecord<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    groups: GroupRecord<Keys>,
    sorted: GroupSort = 'alphabetical'
): GroupRecord<Keys> {
    const edgeById = new Map(infograph.edges.map(edge => [unparseEdgeKey(edge), edge] as const))

    return Object.fromEntries(
        Object.entries(groups).map(([site, ids]) => {
            const edgeIds = ids as EdgeId<Keys>[]
            const ordered = sorted === 'funnel' ? funnelOrder(infograph, edgeById, edgeIds) : [...edgeIds].sort(strcmp)
            return [site, ordered]
        })
    ) as GroupRecord<Keys>
}

/** Numeric exposition score for a node: complexity plus technicality. */
export function nodeExpositionCost<Keys extends BaseKeys>(node: InfographNode<Keys>): number {
    return ordinalScore(complexityLevels, node.complexity.is) + ordinalScore(technicalityLevels, node.technicality?.is)
}

/** Numeric exposition score for an edge, intentionally ignoring the edge's own complexity. */
export function edgeExpositionCost<Keys extends BaseKeys>(
    edge: InfographEdge<Keys>,
    infograph: Infograph<Keys>
): number {
    const from = infograph.nodes.get(edge.from)
    const to = infograph.nodes.get(edge.to)
    if (from === undefined || to === undefined) throw new Error(`Unknown edge endpoint: ${edge.from} → ${edge.to}`)
    return Math.max(nodeExpositionCost(from), nodeExpositionCost(to))
}

function funnelOrder<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    edgeById: Map<EdgeId<Keys>, InfographEdge<Keys>>,
    edgeIds: EdgeId<Keys>[]
): EdgeId<Keys>[] {
    const remaining = new Set(edgeIds)
    const ordered: EdgeId<Keys>[] = []
    const threadNodes = new Set<InfographNodeKey<Keys>>()
    let lastExpositionCost: number | undefined

    while (remaining.size > 0) {
        const candidates = [...remaining]
        if (
            threadNodes.size > 0 &&
            !candidates.some(id => {
                const edge = edgeById.get(id)
                return edge !== undefined && (threadNodes.has(edge.from) || threadNodes.has(edge.to))
            })
        ) {
            threadNodes.clear()
            lastExpositionCost = undefined
        }
        const selected = candidates.sort((a, b) =>
            compareFunnelCandidates(infograph, edgeById, a, b, threadNodes, lastExpositionCost)
        )[0]
        const edge = edgeById.get(selected)
        if (edge === undefined) throw new Error(`Unknown edge ID in group: ${selected}`)

        remaining.delete(selected)
        ordered.push(selected)
        threadNodes.add(edge.from)
        threadNodes.add(edge.to)
        lastExpositionCost = edgeExpositionCost(edge, infograph)
    }

    return ordered
}

function compareFunnelCandidates<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    edgeById: Map<EdgeId<Keys>, InfographEdge<Keys>>,
    aId: EdgeId<Keys>,
    bId: EdgeId<Keys>,
    threadNodes: Set<InfographNodeKey<Keys>>,
    lastExpositionCost: number | undefined
) {
    const a = edgeById.get(aId)
    const b = edgeById.get(bId)
    if (a === undefined || b === undefined) return a === undefined ? 1 : -1

    if (lastExpositionCost === undefined) return compareEdgeOrder(infograph, edgeById, aId, bId)

    const continuity = (edge: InfographEdge<Keys>) =>
        Number(threadNodes.has(edge.from)) + Number(threadNodes.has(edge.to))
    const continuityDifference = continuity(b) - continuity(a)
    if (continuityDifference !== 0) return continuityDifference

    // Prefer moving forward, while allowing a locally continuous decrease when no
    // non-decreasing continuation is available at this continuity level. A larger
    // backward jump is therefore considered later than a smaller one.
    const backwardJump = (edge: InfographEdge<Keys>) =>
        Math.max(0, lastExpositionCost - edgeExpositionCost(edge, infograph))
    const backwardDifference = backwardJump(a) - backwardJump(b)
    if (backwardDifference !== 0) return backwardDifference

    return compareEdgeOrder(infograph, edgeById, aId, bId)
}

function compareEdgeOrder<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    edgeById: Map<EdgeId<Keys>, InfographEdge<Keys>>,
    aId: EdgeId<Keys>,
    bId: EdgeId<Keys>
) {
    const a = edgeById.get(aId)!
    const b = edgeById.get(bId)!
    return (
        edgeExpositionCost(a, infograph) - edgeExpositionCost(b, infograph) ||
        ordinalScore(complexityLevels, a.info.complexity.is) - ordinalScore(complexityLevels, b.info.complexity.is) ||
        strcmp(aId, bId)
    )
}

function ordinalScore<T>(levels: readonly T[], value: T | undefined): number {
    if (value === undefined) return 0
    const score = levels.indexOf(value)
    if (score < 0) throw new Error(`Unknown ordinal value: ${String(value)}`)
    return score
}

export function groupRecordToMermaid<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    groups: GroupRecord<Keys>
): string {
    const edgeById = new Map(infograph.edges.map(edge => [unparseEdgeKey(edge), edge] as const))

    return render(
        (Object.entries(groups) as [InfographNodeKey<Keys>, EdgeId<Keys>[]][])
            .sort(([a], [b]) => strcmp(a, b))
            .map(([center, ids]) => {
                const flowchart = Flowchart.create()
                const nodeKeys = new Set<InfographNodeKey<Keys>>([center])

                for (const id of ids) {
                    const edge = edgeById.get(id)
                    if (edge === undefined) continue
                    nodeKeys.add(edge.from)
                    nodeKeys.add(edge.to)
                }

                for (const key of [...nodeKeys].sort(strcmp)) {
                    let text = infograph.nodes.get(key)?.title ?? key
                    // necessary workaround due to a bug in mermaid-ast
                    text = text.replaceAll(/[()[\]{}]/g, ' ')
                    flowchart.addNode(sanitizeId(key), text)
                }

                for (const id of ids) {
                    const edge = edgeById.get(id)
                    if (edge === undefined) continue
                    flowchart.addLink(sanitizeId(edge.from), sanitizeId(edge.to), { text: parseEdgeKey(id).verb })
                }

                return flowchart
            })
    )
}

function addIncident<Keys extends BaseKeys>(
    incidence: Map<InfographNodeKey<Keys>, EdgeId<Keys>[]>,
    node: InfographNodeKey<Keys>,
    edge: EdgeId<Keys>
) {
    const edges = incidence.get(node)
    if (edges) edges.push(edge)
    else incidence.set(node, [edge])
}

function addReach<Keys extends BaseKeys>(
    assignments: Map<EdgeId<Keys>, Assignment<Keys>>,
    queue: QueueItem<Keys>[],
    edge: EdgeId<Keys>,
    site: InfographNodeKey<Keys>,
    distance: number
) {
    const current = assignments.get(edge)
    if (current === undefined || distance < current.distance) {
        assignments.set(edge, { distance, sites: new Set([site]) })
        queue.push({ edge, site, distance })
        return
    }
    if (distance === current.distance && !current.sites.has(site)) {
        current.sites.add(site)
        queue.push({ edge, site, distance })
    }
}

function adjacentEdges<Keys extends BaseKeys>(
    edgeById: Map<EdgeId<Keys>, InfographEdge<Keys>>,
    incidence: Map<InfographNodeKey<Keys>, EdgeId<Keys>[]>,
    edge: EdgeId<Keys>
): EdgeId<Keys>[] {
    const original = edgeById.get(edge)
    if (original === undefined) return []

    return [...new Set([...(incidence.get(original.from) ?? []), ...(incidence.get(original.to) ?? [])])]
        .filter(candidate => candidate !== edge)
        .sort(strcmp)
}
