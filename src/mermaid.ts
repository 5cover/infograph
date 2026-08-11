// Turn an infograph node key (which may contain spaces and other characters) into
// a Mermaid-safe node identifier. Shared by every Mermaid producer so ids stay

import type { Flowchart, RenderOptions } from 'mermaid-ast'

// consistent across diagrams.
export function sanitizeId(key: string): string {
    // Collapse each run of non-word chars to a single dash: a lone '-' is a safe id
    // char, but '--'/'---' are Mermaid link operators and would be parsed as edges.
    return key.replaceAll(/\W+/g, '-')
}

export function render(flowchart: Flowchart, options?: RenderOptions): string {
    return flowchart.render({
        compactLinks: true,
        indent: 0,
        ...options,
    })
}
