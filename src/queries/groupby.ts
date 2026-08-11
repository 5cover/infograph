import {
    complexity as complexityLevels,
    technicality as technicalityLevels,
    type BaseKeys,
    type Infograph,
    type InfographEdgeKey,
    type InfographNode,
    type InfographNodeKey,
} from '../types.js'
import { GraphDiagram, type GraphFormat, renderGraph } from '../graph.js'
import { strcmp } from '../util.js'
import { parseEdgeKey, parseNodeKey, unparseEdgeKey } from '../infograph.js'

export type GroupRecord<Keys extends BaseKeys = BaseKeys, T = null> = Map<InfographNodeKey<Keys>, GroupRecordValue<Keys, T>>
export type GroupRecordValue<Keys extends BaseKeys, T = null> = Map<InfographEdgeKey<Keys>, T>

export const groupSort = ['alphabetical', 'funnel'] as const
export type GroupSort = (typeof groupSort)[number]

type InfographEdge<Keys extends BaseKeys> = Infograph<Keys>['edges'][number]

type Assignment<Keys extends BaseKeys> = {
    distance: number
    sites: Set<InfographNodeKey<Keys>>
}

type QueueItem<Keys extends BaseKeys> = {
    edge: InfographEdgeKey<Keys>
    site: InfographNodeKey<Keys>
    distance: number
}

type GroupbyOptions<Keys extends BaseKeys> = {
    inputSites: Iterable<InfographNodeKey<Keys>>
    allowUnreachable?: boolean
    sorted?: GroupSort
}

export function groupBySites<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    opts: GroupbyOptions<Keys> & { sorted?: 'alphabetical' }
): GroupRecord<Keys, null>
export function groupBySites<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    opts: GroupbyOptions<Keys> & { sorted: 'funnel' }
): GroupRecord<Keys, number>
export function groupBySites<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    opts: GroupbyOptions<Keys>
): GroupRecord<Keys, null> | GroupRecord<Keys, number>
export function groupBySites<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    opts: GroupbyOptions<Keys>
): GroupRecord<Keys, null> | GroupRecord<Keys, number> {
    const sites = [...new Set(opts.inputSites)].sort(strcmp)
    for (const site of sites) {
        if (!infograph.nodes.has(site)) throw new Error(`Unknown Voronoi site: ${site}`)
    }

    const edgeIds = infograph.edges.map(unparseEdgeKey)
    const sortedEdgeIds = [...edgeIds].sort(strcmp)
    const edgeById = new Map<InfographEdgeKey<Keys>, InfographEdge<Keys>>()
    const incidence = new Map<InfographNodeKey<Keys>, InfographEdgeKey<Keys>[]>()

    for (let index = 0; index < infograph.edges.length; index++) {
        const edge = infograph.edges[index]
        const id = edgeIds[index]
        if (edgeById.has(id)) throw new Error(`Duplicate edge ID cannot be grouped: ${id}`)
        edgeById.set(id, edge)
        addIncident(incidence, edge.from, id)
        addIncident(incidence, edge.to, id)
    }

    for (const ids of incidence.values()) ids.sort(strcmp)

    const assignments = new Map<InfographEdgeKey<Keys>, Assignment<Keys>>()
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

    if (!opts.allowUnreachable) {
        const unreachable = sortedEdgeIds.filter(id => !assignments.has(id))
        if (unreachable.length > 0) {
            throw new Error(`Cannot group edges unreachable from any Voronoi site (${sites}): ${unreachable.join(', ')}`)
        }
    }

    const result: GroupRecord<Keys> = new Map(sites.map(site => [site, new Map()]))
    for (const id of sortedEdgeIds) {
        const assignment = assignments.get(id)
        if (!assignment) continue
        for (const site of [...assignment.sites].sort(strcmp)) {
            result.get(site)!.set(id, null)
        }
    }

    return sortGroupRecord(infograph, result, opts.sorted ?? 'alphabetical')
}

/**
 * Sort each already-assigned group without changing its membership. Alphabetical is
 * the historical output order; funnel is a small, deterministic, local continuity
 * heuristic for report preparation.
 */
export function sortGroupRecord<Keys extends BaseKeys, T>(
    infograph: Infograph<Keys>,
    groups: GroupRecord<Keys, T>,
    sorted?: 'alphabetical'
): GroupRecord<Keys, null>
export function sortGroupRecord<Keys extends BaseKeys, T>(
    infograph: Infograph<Keys>,
    groups: GroupRecord<Keys, T>,
    sorted: 'funnel'
): GroupRecord<Keys, number>
export function sortGroupRecord<Keys extends BaseKeys, T>(
    infograph: Infograph<Keys>,
    groups: GroupRecord<Keys, T>,
    sorted: GroupSort
): GroupRecord<Keys, null> | GroupRecord<Keys, number>
export function sortGroupRecord<Keys extends BaseKeys, T>(
    infograph: Infograph<Keys>,
    groups: GroupRecord<Keys, T>,
    sorted: GroupSort = 'alphabetical'
): GroupRecord<Keys, null> | GroupRecord<Keys, number> {
    const edgeById = new Map(infograph.edges.map(edge => [unparseEdgeKey(edge), edge] as const))

    return new Map(
        groups.entries().map(([site, edgeMap]) => {
            const edgeIds = edgeMap.keys()
            const ordered = sorted === 'funnel' ? funnelOrder(infograph, edgeById, edgeIds) : [...edgeIds].sort(strcmp)
            const values = new Map(
                ordered.map(id => [
                    id,
                    sorted === 'funnel' ? edgeExpositionCost(edgeById.get(id)!, infograph) : null,
                ])
            )
            return [site, values] as const
        })
    ) as GroupRecord<Keys, null> | GroupRecord<Keys, number>
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
    edgeById: Map<InfographEdgeKey<Keys>, InfographEdge<Keys>>,
    edgeIds: Iterable<InfographEdgeKey<Keys>>
): InfographEdgeKey<Keys>[] {
    const remaining = new Set(edgeIds)
    const ordered: InfographEdgeKey<Keys>[] = []
    const threadNodes = new Set<InfographNodeKey<Keys>>()
    let lastExpositionCost: number | null

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
            lastExpositionCost = null
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
    edgeById: Map<InfographEdgeKey<Keys>, InfographEdge<Keys>>,
    aId: InfographEdgeKey<Keys>,
    bId: InfographEdgeKey<Keys>,
    threadNodes: Set<InfographNodeKey<Keys>>,
    lastExpositionCost: number | null
) {
    const a = edgeById.get(aId)
    const b = edgeById.get(bId)
    if (a === undefined || b === undefined) return a === undefined ? 1 : -1

    if (lastExpositionCost === null) return compareEdgeOrder(infograph, edgeById, aId, bId)

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
    edgeById: Map<InfographEdgeKey<Keys>, InfographEdge<Keys>>,
    aId: InfographEdgeKey<Keys>,
    bId: InfographEdgeKey<Keys>
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

export function groupRecordToGraph<Keys extends BaseKeys, T>(
    infograph: Infograph<Keys>,
    groups: Map<string, GroupRecordValue<Keys, T>>,
    format: GraphFormat
): string {
    const edgeById = new Map(infograph.edges.map(edge => [unparseEdgeKey(edge), edge] as const))

    const diagrams = groups
        .entries()
        .toArray()
        .sort(([a], [b]) => strcmp(a, b))
        .map(([centers, ids]) => {
            const diagram = new GraphDiagram('LR')
            const centerSet = new Set<InfographNodeKey<Keys>>(centers.split('>') as InfographNodeKey[])
            const nodeKeys = new Set<InfographNodeKey<Keys>>(centerSet)

            for (const id of Object.keys(ids) as InfographEdgeKey<Keys>[]) {
                const edge = edgeById.get(id)
                if (edge === undefined) continue
                nodeKeys.add(edge.from)
                nodeKeys.add(edge.to)
            }

            for (const key of [...nodeKeys].sort(strcmp)) {
                let text = infograph.nodes.get(key)?.title ?? key
                // Necessary workaround due to a bug in mermaid-ast. This remains
                // presentation text, rather than backend-specific graph construction.
                text = text.replaceAll(/[()[\]{}]/g, ' ')
                diagram.addNode(
                    key,
                    `${parseNodeKey(key).kind}: ${text}`,
                    centerSet.has(key) ? { shape: 'circle', classes: ['site'] } : {}
                )
            }

            for (const id of Object.keys(ids) as InfographEdgeKey<Keys>[]) {
                const edge = edgeById.get(id)
                if (edge === undefined) continue
                diagram.addEdge(edge.from, edge.to, { label: parseEdgeKey(id).verb })
            }

            return diagram
        })

    return renderGraph(diagrams, format)
}

export function groupRecordToMermaid<Keys extends BaseKeys, T>(
    infograph: Infograph<Keys>,
    groups: GroupRecord<Keys, T>
): string {
    return groupRecordToGraph(infograph, groups, 'mermaid')
}
function addIncident<Keys extends BaseKeys>(
    incidence: Map<InfographNodeKey<Keys>, InfographEdgeKey<Keys>[]>,
    node: InfographNodeKey<Keys>,
    edge: InfographEdgeKey<Keys>
) {
    const edges = incidence.get(node)
    if (edges) edges.push(edge)
    else incidence.set(node, [edge])
}

function addReach<Keys extends BaseKeys>(
    assignments: Map<InfographEdgeKey<Keys>, Assignment<Keys>>,
    queue: QueueItem<Keys>[],
    edge: InfographEdgeKey<Keys>,
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
    edgeById: Map<InfographEdgeKey<Keys>, InfographEdge<Keys>>,
    incidence: Map<InfographNodeKey<Keys>, InfographEdgeKey<Keys>[]>,
    edge: InfographEdgeKey<Keys>
): InfographEdgeKey<Keys>[] {
    const original = edgeById.get(edge)
    if (original === undefined) return []

    return [...new Set([...(incidence.get(original.from) ?? []), ...(incidence.get(original.to) ?? [])])]
        .filter(candidate => candidate !== edge)
        .sort(strcmp)
}
