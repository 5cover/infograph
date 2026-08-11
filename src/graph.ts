import { attribute as _, Digraph, toDot } from 'ts-graphviz'
import { Flowchart } from 'mermaid-ast'

export type GraphFormat = 'mermaid' | 'graphviz'
export type GraphDirection = 'TD' | 'LR'
export type GraphNodeShape = 'circle' | 'stadium'

export type GraphNode = {
    id: string
    label: string
    shape?: GraphNodeShape
}

export type GraphEdge = {
    from: string
    to: string
    label?: string
    style?: 'dotted'
}

export type GraphGroup = {
    id: string
    nodes: string[]
    label?: string
}

// A small, presentation-oriented graph construction API. Callers express nodes,
// edges and optional visual groups once; renderers translate that model to their
// respective graph languages.
export class GraphDiagram {
    readonly nodes = new Map<string, GraphNode>()
    readonly edges: GraphEdge[] = []
    readonly groups: GraphGroup[] = []

    constructor(readonly direction: GraphDirection = 'TD') {}

    addNode(id: string, label: string, options: Pick<GraphNode, 'shape'> = {}): void {
        this.nodes.set(id, { id, label, ...options })
    }

    addEdge(from: string, to: string, options: Omit<GraphEdge, 'from' | 'to'> = {}): void {
        this.edges.push({ from, to, ...options })
    }

    addGroup(id: string, nodes: Iterable<string>, options: Pick<GraphGroup, 'label'> = {}): void {
        this.groups.push({ id, nodes: [...nodes], ...options })
    }
}

export function renderGraph(diagram: GraphDiagram, format: GraphFormat): string
export function renderGraph(diagrams: GraphDiagram[], format: GraphFormat): string
export function renderGraph(diagrams: GraphDiagram | GraphDiagram[], format: GraphFormat): string {
    if (!Array.isArray(diagrams)) return renderOne(diagrams, format)
    if (diagrams.length === 0) return ''
    if (diagrams.length === 1) return renderOne(diagrams[0], format)

    return diagrams.map(diagram => `\`\`\`${fenceLanguage(format)}\n${renderOne(diagram, format)}\n\`\`\``).join('\n\n')
}

function renderOne(diagram: GraphDiagram, format: GraphFormat): string {
    return format === 'mermaid' ? renderMermaid(diagram) : renderGraphviz(diagram)
}

function renderMermaid(diagram: GraphDiagram): string {
    const flowchart = Flowchart.create(diagram.direction)
    for (const node of diagram.nodes.values()) {
        flowchart.addNode(sanitizeMermaidId(node.id), node.label.replaceAll('\n', '<br>'), node.shape ? { shape: node.shape } : undefined)
    }
    for (const edge of diagram.edges) {
        flowchart.addLink(sanitizeMermaidId(edge.from), sanitizeMermaidId(edge.to), {
            ...(edge.label === undefined ? {} : { text: edge.label }),
            ...(edge.style === undefined ? {} : { stroke: edge.style }),
        })
    }
    for (const group of diagram.groups) {
        flowchart.createSubgraph(
            group.id,
            group.nodes.map(sanitizeMermaidId),
            group.label
        )
    }
    return flowchart.render({ compactLinks: true, indent: 0 })
}

function renderGraphviz(diagram: GraphDiagram): string {
    const graph = new Digraph('G')
    graph.set(_.rankdir, diagram.direction === 'TD' ? 'TB' : 'LR')

    const groupForNode = new Map<string, GraphGroup>()
    for (const group of diagram.groups) {
        for (const node of group.nodes) groupForNode.set(node, group)
    }

    const graphvizGroups = new Map<string, ReturnType<typeof graph.createSubgraph>>()
    for (const group of diagram.groups) {
        graphvizGroups.set(group.id, graph.createSubgraph(`cluster_${group.id}`, group.label ? { [_.label]: group.label } : {}))
    }
    for (const node of diagram.nodes.values()) {
        const attributes = {
            [_.label]: node.label,
            ...(node.shape === undefined ? {} : { [_.shape]: node.shape }),
        }
        const group = groupForNode.get(node.id)
        if (group) graphvizGroups.get(group.id)!.createNode(node.id, attributes)
        else graph.createNode(node.id, attributes)
    }
    for (const edge of diagram.edges) {
        graph.createEdge([edge.from, edge.to], {
            ...(edge.label === undefined ? {} : { [_.label]: edge.label }),
            ...(edge.style === undefined ? {} : { [_.style]: edge.style }),
        })
    }
    return toDot(graph)
}

function fenceLanguage(format: GraphFormat): string {
    return format === 'mermaid' ? 'mermaid' : 'dot'
}

function sanitizeMermaidId(key: string): string {
    return key.replaceAll(/\W+/g, '-')
}
