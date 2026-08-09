// Turn an infograph node key (which may contain spaces and other characters) into
// a Mermaid-safe node identifier. Shared by every Mermaid producer so ids stay

import type { Flowchart, RenderOptions } from 'mermaid-ast'
import type { Flexarray } from './input/types.js'

// consistent across diagrams.
export function sanitizeId(key: string): string {
    // Collapse each run of non-word chars to a single dash: a lone '-' is a safe id
    // char, but '--'/'---' are Mermaid link operators and would be parsed as edges.
    return key.replaceAll(/\W+/g, '-')
}

export function render(flowchart: Flexarray<Flowchart>, options?: RenderOptions): string {
    if (Array.isArray(flowchart)) {
        switch (flowchart.length) {
            case 0:
                return ''
            case 1:
                return renderOne(flowchart[0], options)
            default:
                return flowchart.map(diagram => `\`\`\`mermaid\n${renderOne(diagram, options)}\n\`\`\``).join('\n\n')
        }
    }

    return renderOne(flowchart, options)
}

function renderOne(flowchart: Flowchart, options?: RenderOptions): string {
    return flowchart.render({
        compactLinks: true,
        indent: 0,
        ...options,
    })
}
