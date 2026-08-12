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
import { parseEdgeKey, parseNodeKey, subgraphFilterEdges, unparseEdgeKey } from '../infograph.js'
import { strcmp } from '../util.js'

export type EdgeId<Keys extends BaseKeys> = InfographEdgeKey<Keys>
export type GroupRecordValue<Keys extends BaseKeys, T = null> = Map<InfographEdgeKey<Keys>, T>
export type GroupRecord<Keys extends BaseKeys = BaseKeys, T = null> = Map<
    InfographNodeKey<Keys>,
    GroupRecordValue<Keys, T>
>
export type GroupKey<Keys extends BaseKeys> = InfographNodeKey<Keys> | '*'
export type GroupTree<Keys extends BaseKeys = BaseKeys, T = GroupRecordValue<Keys>> = Map<GroupKey<Keys>, GroupTree<Keys, T> | T>
export type GroupPath<Keys extends BaseKeys> = readonly GroupKey<Keys>[]

export type GroupSelection<Keys extends BaseKeys, T> = {
    value: T
    centers: InfographNodeKey<Keys>[]
}

export type GroupSummary<Keys extends BaseKeys> = {
    edges: number
    nodes: number
    centers: InfographNodeKey<Keys>[]
}

export type GroupTreeSummary<Keys extends BaseKeys> = {
    tree: GroupTree<Keys, GroupSummary<Keys>>
    largest?: GroupSummary<Keys>
}

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

export type GroupbyOptions<Keys extends BaseKeys> = {
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
    const sites = new Set(opts.inputSites).values().toArray().toSorted(strcmp)
    for (const site of sites) {
        if (!infograph.nodes.has(site)) throw new Error(`Unknown Voronoi site: ${site}`)
    }

    const edgeIds = infograph.edges.map(unparseEdgeKey)
    const sortedEdgeIds = edgeIds.toSorted(strcmp)
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
        for (const id of incidence.get(site) ?? []) addReach(assignments, queue, id, site, 0)
    }
    for (let head = 0; head < queue.length; head++) {
        const item = queue[head]
        const assignment = assignments.get(item.edge)
        if (assignment === undefined || assignment.distance !== item.distance || !assignment.sites.has(item.site)) continue
        for (const next of adjacentEdges(edgeById, incidence, item.edge)) {
            addReach(assignments, queue, next, item.site, item.distance + 1)
        }
    }

    if (!opts.allowUnreachable) {
        const unreachable = sortedEdgeIds.filter(id => !assignments.has(id))
        if (unreachable.length) {
            throw new Error(`Cannot group edges unreachable from any Voronoi site (${sites}): ${unreachable.join(', ')}`)
        }
    }

    const result: GroupRecord<Keys> = new Map(sites.map(site => [site, new Map()]))
    for (const id of sortedEdgeIds) {
        const assignment = assignments.get(id)
        if (!assignment) continue
        for (const site of assignment.sites.values().toArray().toSorted(strcmp)) result.get(site)!.set(id, null)
    }
    return sortGroupRecord(infograph, result, opts.sorted ?? 'alphabetical')
}

/**
 * Group the same edge set repeatedly by each requested node kind. Every requested
 * depth is present: `*` carries the residual branch when that kind has no applicable
 * site, or when a site's Voronoi grouping leaves edges unreachable.
 */
export function groupByKinds<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    kinds: readonly Keys['kind'][],
    sorted?: 'alphabetical'
): GroupTree<Keys, GroupRecordValue<Keys, null>>
export function groupByKinds<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    kinds: readonly Keys['kind'][],
    sorted: 'funnel'
): GroupTree<Keys, GroupRecordValue<Keys, number>>
export function groupByKinds<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    kinds: readonly Keys['kind'][],
    sorted?: GroupSort
): GroupTree<Keys, GroupRecordValue<Keys, null>> | GroupTree<Keys, GroupRecordValue<Keys, number>>
export function groupByKinds<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    kinds: readonly Keys['kind'][],
    sorted: GroupSort = 'alphabetical'
): GroupTree<Keys, GroupRecordValue<Keys, null>> | GroupTree<Keys, GroupRecordValue<Keys, number>> {
    if (!kinds.length) throw new Error('At least one grouping kind is required')
    const all = new Map(infograph.edges.map(edge => [unparseEdgeKey(edge), null] as const))
    return groupLevel(infograph, all, kinds, sorted) as unknown as
        | GroupTree<Keys, GroupRecordValue<Keys, null>>
        | GroupTree<Keys, GroupRecordValue<Keys, number>>
}

function groupLevel<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    edges: Map<InfographEdgeKey<Keys>, unknown>,
    kinds: readonly Keys['kind'][],
    sorted: GroupSort
): GroupTree<Keys, GroupRecordValue<Keys, null | number>> | GroupRecordValue<Keys, null | number> {
    if (!kinds.length) return orderEdgeMap(infograph, edges.keys(), sorted)

    const subinfograph = subgraphFilterEdges(infograph, edge => edges.has(unparseEdgeKey(edge)))
    const sites = subinfograph.nodes
        .keys()
        .filter(key => parseNodeKey(key).kind === kinds[0])
        .toArray()
    if (!sites.length) return new Map([['*', groupLevel(infograph, edges, kinds.slice(1), sorted)]])

    const grouped = groupBySites(subinfograph, { inputSites: sites, allowUnreachable: true, sorted })
    const assigned = new Set<InfographEdgeKey<Keys>>()
    const result: GroupTree<Keys, GroupRecordValue<Keys, null | number>> = new Map()
    for (const [site, group] of grouped) {
        if (!group.size) continue
        for (const edge of group.keys()) assigned.add(edge)
        result.set(site, groupLevel(infograph, group, kinds.slice(1), sorted))
    }

    const residual = new Map(edges.entries().filter(([edge]) => !assigned.has(edge)))
    if (residual.size) result.set('*', groupLevel(infograph, residual, kinds.slice(1), sorted))
    return result
}

/** Sort each already-assigned group without changing its membership. */
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
    return new Map(
        groups.entries().map(([site, edges]) => [site, orderEdgeMap(infograph, edges.keys(), sorted)] as const)
    ) as GroupRecord<Keys, null> | GroupRecord<Keys, number>
}

function orderEdgeMap<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    edgeIds: Iterable<InfographEdgeKey<Keys>>,
    sorted: GroupSort
): GroupRecordValue<Keys, null | number> {
    const edgeById = new Map(infograph.edges.map(edge => [unparseEdgeKey(edge), edge] as const))
    const ids = Iterator.from(edgeIds).toArray()
    const ordered = sorted === 'funnel' ? funnelOrder(infograph, edgeById, ids) : ids.toSorted(strcmp)
    return new Map(
        ordered.map(id => [id, sorted === 'funnel' ? edgeExpositionCost(edgeById.get(id)!, infograph) : null] as const)
    )
}

/** Numeric exposition score for a node: complexity plus technicality. */
export function nodeExpositionCost<Keys extends BaseKeys>(node: InfographNode<Keys>): number {
    return ordinalScore(complexityLevels, node.complexity.is) + ordinalScore(technicalityLevels, node.technicality?.is)
}

/** Numeric exposition score for an edge, intentionally ignoring the edge's own complexity. */
export function edgeExpositionCost<Keys extends BaseKeys>(edge: InfographEdge<Keys>, infograph: Infograph<Keys>): number {
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
    let lastExpositionCost: number | null = null

    while (remaining.size) {
        const candidates = remaining.values().toArray()
        if (
            threadNodes.size &&
            !candidates.some(id => {
                const edge = edgeById.get(id)
                return edge !== undefined && (threadNodes.has(edge.from) || threadNodes.has(edge.to))
            })
        ) {
            threadNodes.clear()
            lastExpositionCost = null
        }
        const selected = candidates.toSorted((a, b) =>
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

    const continuity = (edge: InfographEdge<Keys>) => Number(threadNodes.has(edge.from)) + Number(threadNodes.has(edge.to))
    const continuityDifference = continuity(b) - continuity(a)
    if (continuityDifference) return continuityDifference

    const backwardJump = (edge: InfographEdge<Keys>) => Math.max(0, lastExpositionCost - edgeExpositionCost(edge, infograph))
    const backwardDifference = backwardJump(a) - backwardJump(b)
    if (backwardDifference) return backwardDifference
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

export function groupTreeToGraph<Keys extends BaseKeys, T>(
    infograph: Infograph<Keys>,
    tree: GroupTree<Keys, GroupRecordValue<Keys, T>>,
    depth: number,
    format: GraphFormat
): GroupTree<Keys, string> {
    return mapGroupTree(tree, depth, (edges, centers) => renderEdgeGroup(infograph, edges, { centers, format }))
}

/** Return one complete grouping path without retaining its enclosing tree structure. */
export function selectGroup<Keys extends BaseKeys, T>(
    tree: GroupTree<Keys, T>,
    path: GroupPath<Keys>,
    depth: number
): GroupSelection<Keys, T> | undefined {
    if (depth < 1 || path.length !== depth) return undefined
    let branch: GroupTree<Keys, T> = tree
    const centers: InfographNodeKey<Keys>[] = []
    for (const [level, key] of path.entries()) {
        const value = branch.get(key)
        if (value === undefined) return undefined
        if (key !== '*') centers.push(key)
        if (level === path.length - 1) return { value: value as T, centers }
        if (!(value instanceof Map)) return undefined
        branch = value as GroupTree<Keys, T>
    }
    return undefined
}

/** Summarize each leaf of a group tree while preserving its hierarchy. */
export function summarizeGroupTree<Keys extends BaseKeys, T>(
    infograph: Infograph<Keys>,
    tree: GroupTree<Keys, GroupRecordValue<Keys, T>>,
    depth: number
): GroupTreeSummary<Keys> {
    const edgeById = new Map(infograph.edges.map(edge => [unparseEdgeKey(edge), edge] as const))
    let largest: GroupSummary<Keys> | undefined
    const result = mapGroupTree(tree, depth, (edges, centers) => {
        const nodes = new Set<InfographNodeKey<Keys>>()
        for (const id of edges.keys()) {
            const edge = edgeById.get(id)
            if (edge) {
                nodes.add(edge.from)
                nodes.add(edge.to)
            }
        }
        const summary = { edges: edges.size, nodes: nodes.size, centers: [...centers] }
        if (largest === undefined || largest.edges + largest.nodes < summary.edges + summary.nodes) largest = summary
        return summary
    })
    return { tree: result, ...(largest === undefined ? {} : { largest }) }
}

export function mapGroupTree<Keys extends BaseKeys, T, U>(
    tree: GroupTree<Keys, T>,
    depth: number,
    mapLeaf: (value: T, centers: InfographNodeKey<Keys>[]) => U
): GroupTree<Keys, U> {
    if (depth < 1) throw new Error('A group tree must have at least one level')
    const visit = (branch: GroupTree<Keys, T>, level: number, centers: InfographNodeKey<Keys>[]): GroupTree<Keys, U> => {
        const result: GroupTree<Keys, U> = new Map()
        for (const [key, value] of branch) {
            const nextCenters = key === '*' ? centers : [...centers, key]
            result.set(key, level === depth - 1 ? mapLeaf(value as T, nextCenters) : visit(value as GroupTree<Keys, T>, level + 1, nextCenters))
        }
        return result
    }
    return visit(tree, 0, [])
}

export function renderEdgeGroup<Keys extends BaseKeys, T>(
    infograph: Infograph<Keys>,
    edges: GroupRecordValue<Keys, T>,
    config: { centers: Iterable<InfographNodeKey<Keys>>; format: GraphFormat }
): string {
    const edgeById = new Map(infograph.edges.map(edge => [unparseEdgeKey(edge), edge] as const))
    const diagram = new GraphDiagram('LR')
    const centerSet = new Set(config.centers)
    const nodeKeys = new Set<InfographNodeKey<Keys>>(centerSet)
    for (const id of edges.keys()) {
        const edge = edgeById.get(id)
        if (!edge) continue
        nodeKeys.add(edge.from)
        nodeKeys.add(edge.to)
    }
    for (const key of nodeKeys.values().toArray().toSorted(strcmp)) {
        const title = (infograph.nodes.get(key)?.title ?? key).replaceAll(/[()[\]{}]/g, ' ')
        diagram.addNode(
            key,
            `${parseNodeKey(key).kind}: ${title}`,
            centerSet.has(key) ? { shape: 'circle', classes: ['site'] } : {}
        )
    }
    for (const id of edges.keys()) {
        const edge = edgeById.get(id)
        if (edge) diagram.addEdge(edge.from, edge.to, { label: parseEdgeKey(id).verb })
    }
    return renderGraph(diagram, config.format)
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
    if (!original) return []
    return new Set([...(incidence.get(original.from) ?? []), ...(incidence.get(original.to) ?? [])])
        .values()
        .toArray()
        .filter(candidate => candidate !== edge)
        .toSorted(strcmp)
}
