import type { BaseKeys, Infograph } from './types'

export type ToMermaidConfig<Keys extends BaseKeys> = {
    neutralVerb?: Keys['verb']
}

export function toMermaid<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    config: ToMermaidConfig<BaseKeys> = {},
): string {
    const lines = ['flowchart TD']

    for (const [key, node] of infograph.nodes.entries()) {
        lines.push(
            `${nodeId(key)}["${escapeMermaidText(key + (node.date?.from ? '<br>' + node.date?.from.toISOString().split('T', 1)[0] : ''))}"]`,
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
