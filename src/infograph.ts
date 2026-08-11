import type {
    BaseKeys,
    EdgeInfo,
    Infograph,
    InfographEdgeKey,
    InfographEdgeIdentity,
    InfographNodeKey,
    InfographNodeIdentity,
    InfographEdge,
} from './types.js'
import { GraphDiagram, type GraphFormat, renderGraph } from './graph.js'

export type ToGraphConfig<Keys extends BaseKeys> = {
    neutralVerb?: Keys['verb']
}

export type ToMermaidConfig<Keys extends BaseKeys> = ToGraphConfig<Keys>

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

export function toGraph<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    format: GraphFormat,
    config: ToGraphConfig<Keys> = {}
): string {
    const diagram = new GraphDiagram()
    addInfograph(diagram, infograph, config)
    return renderGraph(diagram, format)
}

export function toMermaid<Keys extends BaseKeys>(infograph: Infograph<Keys>, config: ToGraphConfig<Keys> = {}): string {
    return toGraph(infograph, 'mermaid', config)
}

// Render several node groups as one graph, each group wrapped in its own visual
// subgraph showing only the edges induced within that group.
export function toGroupedGraph<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    groups: { title: string; nodes: InfographNodeKey<Keys>[] }[],
    format: GraphFormat,
    config: ToGraphConfig<Keys> = {}
): string {
    const diagram = new GraphDiagram()
    groups.forEach((group, index) => {
        addInfograph(diagram, subgraph(infograph, group.nodes), config)
        diagram.addGroup(`scc_${index + 1}`, group.nodes, { label: group.title })
    })
    return renderGraph(diagram, format)
}

export function toMermaidGrouped<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    groups: { title: string; nodes: InfographNodeKey<Keys>[] }[],
    config: ToGraphConfig<Keys> = {}
): string {
    return toGroupedGraph(infograph, groups, 'mermaid', config)
}

function addInfograph<Keys extends BaseKeys>(
    diagram: GraphDiagram,
    infograph: Infograph<Keys>,
    config: ToGraphConfig<Keys>
) {
    for (const [key, node] of infograph.nodes.entries()) {
        const date = node.date?.from ? '\n' + node.date.from.toISOString().split('T', 1)[0] : ''
        diagram.addNode(key, key + date)
    }

    for (const edge of infograph.edges) {
        diagram.addEdge(edge.from, edge.to, edge.verb === config.neutralVerb ? {} : { label: edge.verb })
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

export function subgraphFilterEdges<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    edgeBelongs: (e: InfographEdge<Keys>) => boolean
): Infograph {
    const edges = infograph.edges.filter(e => edgeBelongs(e))
    const nodeIds = new Set(infograph.edges.values().flatMap(e => [e.from, e.to]))
    return { ...infograph, edges, nodes: new Map(infograph.nodes.entries().filter(([k]) => nodeIds.has(k))) }
}
