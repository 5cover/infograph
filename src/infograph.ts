import { Flowchart } from 'mermaid-ast'
import type {
    BaseKeys,
    EdgeInfo,
    Infograph,
    InfographEdgeKey,
    InfographEdgeIdentity,
    InfographNodeKey,
    InfographNodeIdentity,
} from './types.js'
import { render, sanitizeId } from './mermaid.js'

export type ToMermaidConfig<Keys extends BaseKeys> = {
    neutralVerb?: Keys['verb']
}

// The subgraph induced by a set of node keys: those nodes plus every edge whose
// endpoints are both kept. Domain and info are carried over unchanged.
export function subgraph<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    nodeKeys: Iterable<InfographNodeKey<Keys>>
): Infograph<Keys> {
    const keep = new Set(nodeKeys)
    return {
        ...infograph,
        nodes: new Map([...infograph.nodes].filter(([key]) => keep.has(key))),
        edges: infograph.edges.filter(edge => keep.has(edge.from) && keep.has(edge.to)),
    }
}

export function toMermaid<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    config: ToMermaidConfig<Keys> = {}
): string {
    const flowchart = Flowchart.create()
    addInfograph(flowchart, infograph, config)
    return render(flowchart)
}

// Render several node groups as one flowchart, each group wrapped in its own Mermaid
// subgraph showing only the edges induced within that group. Groups are expected to be
// disjoint (e.g. strongly connected components), so no node is added twice.
export function toMermaidGrouped<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    groups: { title: string; nodes: InfographNodeKey<Keys>[] }[],
    config: ToMermaidConfig<Keys> = {}
): string {
    const flowchart = Flowchart.create()
    groups.forEach((group, index) => {
        addInfograph(flowchart, subgraph(infograph, group.nodes), config)
        flowchart.createSubgraph(`scc_${index + 1}`, group.nodes.map(sanitizeId), group.title)
    })
    return render(flowchart)
}

function addInfograph<Keys extends BaseKeys>(
    flowchart: Flowchart,
    infograph: Infograph<Keys>,
    config: ToMermaidConfig<Keys>
) {
    for (const [key, node] of infograph.nodes.entries()) {
        const date = node.date?.from ? '<br>' + node.date.from.toISOString().split('T', 1)[0] : ''
        flowchart.addNode(sanitizeId(key), key + date)
    }

    for (const edge of infograph.edges) {
        flowchart.addLink(
            sanitizeId(edge.from),
            sanitizeId(edge.to),
            edge.verb === config.neutralVerb ? {} : { text: edge.verb }
        )
    }
}

export function parseNodeKey(keystring: string): InfographNodeIdentity {
    const [kind, id] = keystring.split(' ', 2)
    return { kind, id }
}

type InfographParsedEdgeKey<Keys extends BaseKeys> = {
    from: InfographNodeIdentity<Keys>
    verb: Keys['verb']
    to: InfographNodeIdentity<Keys>
}

export function parseEdgeKey<Keys extends BaseKeys>(keystring: InfographEdgeKey<Keys>): InfographParsedEdgeKey<Keys> {
    const [fromkind, fromid, verb, tokind, toid] = keystring.split(' ', 5)
    return { from: { kind: fromkind, id: fromid }, verb, to: { kind: tokind, id: toid } }
}

export function unparseNodeKey<Keys extends BaseKeys>(key: InfographNodeIdentity<Keys>): InfographNodeKey<Keys> {
    return `${key.kind} ${key.id}` as const
}

export function unparseEdgeKey<Keys extends BaseKeys>(
    edge: InfographParsedEdgeKey<Keys> | InfographEdgeIdentity<Keys>
): InfographEdgeKey<Keys> {
    return `${typeof edge.from === 'string' ? edge.from : unparseNodeKey(edge.from)} ${edge.verb} ${typeof edge.to === 'string' ? edge.to : unparseNodeKey(edge.to)}` as const
}
