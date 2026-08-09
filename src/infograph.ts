import { Flowchart } from 'mermaid-ast'
import type { BaseKeys, Infograph, InfographNodeKey } from './types.js'
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
    config: ToMermaidConfig<BaseKeys> = {}
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
    config: ToMermaidConfig<BaseKeys> = {}
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
    config: ToMermaidConfig<BaseKeys>
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

export type NodeKey = { kind: string; id: string; isNamespaced: boolean }

export function parseNodeKey(keystring: string): NodeKey {
    const [kind, id] = keystring.split(' ', 2)
    return _parseNodeKey(kind, id)
}

export function parseEdgeKey(keystring: string) {
    const [fromkind, fromid, verb, tokind, toid] = keystring.split(' ', 5)
    return { from: _parseNodeKey(fromkind, fromid), verb, to: _parseNodeKey(tokind, toid) }
}

export function _parseNodeKey(kind: string, id: string): NodeKey {
    const isNamespaced = kind[0] === '.'
    return { kind: isNamespaced ? kind.slice(1) : kind, id, isNamespaced }
}

export function unparseNodeKey(key: NodeKey) {
    return `${key.kind} ${key.id}` as const
}
