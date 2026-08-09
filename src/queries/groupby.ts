import { Flowchart } from 'mermaid-ast'
import type { BaseKeys, Infograph, InfographEdgeId, InfographNodeKey } from '../types.js'
import { render, sanitizeId } from '../mermaid.js'
import { strcmp } from '../util.js'
import { parseEdgeKey } from '../infograph.js'

export type EdgeId<Keys extends BaseKeys> = InfographEdgeId<Keys>
export type GroupRecord<Keys extends BaseKeys> = Record<InfographNodeKey<Keys>, EdgeId<Keys>[]>

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
    inputSites: Iterable<InfographNodeKey<Keys>>
): GroupRecord<Keys> {
    const sites = [...new Set(inputSites)].sort(strcmp)
    for (const site of sites) {
        if (!infograph.nodes.has(site)) throw new Error(`Unknown Voronoi site: ${site}`)
    }

    const edgeIds = infograph.edges.map(edgeId)
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

    return result
}

export function edgeId<Keys extends BaseKeys>(edge: InfographEdge<Keys>): EdgeId<Keys> {
    return `${edge.from} ${edge.verb} ${edge.to}` as EdgeId<Keys>
}

export function groupRecordToMermaid<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    groups: GroupRecord<Keys>
): string {
    const edgeById = new Map(infograph.edges.map(edge => [edgeId(edge), edge] as const))

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

                for (const id of [...ids].sort(strcmp)) {
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
