// Turn an infograph node key (which may contain spaces and other characters) into
// a Mermaid-safe node identifier. Shared by every Mermaid producer so ids stay

import type { Flowchart, RenderOptions } from 'mermaid-ast'

// consistent across diagrams.
export function sanitizeId(key: string): string {
    return key.replaceAll(/\W/g, '-')
}

export function render(flowchart: Flowchart, options?: RenderOptions) {
    return flowchart.render({
        compactLinks: true,
        indent: 0,
        ...options,
    })
}
