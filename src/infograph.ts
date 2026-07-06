import type { BaseKeys, Infograph, InfographNodeKey } from './types.js'

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
    const lines = ['flowchart TD']

    for (const [key, node] of infograph.nodes.entries()) {
        lines.push(
            `${nodeId(key)}["${escapeMermaidText(key + (node.date?.from ? '<br>' + node.date?.from.toISOString().split('T', 1)[0] : ''))}"]`
        )
    }

    for (const edge of infograph.edges) {
        const label = edge.verb === config.neutralVerb ? '' : `--"${escapeMermaidText(edge.verb)}"`
        lines.push(`${nodeId(edge.from)}${label}-->${nodeId(edge.to)}`)
    }

    return lines.join('\n')
}

function nodeId(key: string) {
    return key.replace(/[^\w]/g, '_')
}

function escapeMermaidText(text: string) {
    return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
