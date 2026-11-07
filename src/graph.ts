import { attribute as _, Digraph, toDot } from 'ts-graphviz'
import { Flowchart } from '@5cover/mermaid-ast'

export type GraphFormat = 'mermaid' | 'graphviz' | 'cytoscape'
export type GraphDirection = 'TD' | 'LR'
export type GraphNodeShape = 'circle' | 'stadium'

export type GraphNode = {
    id: string
    label: string
    shape?: GraphNodeShape
    classes?: string[]
}

export type GraphEdge = {
    id: string
    from: string
    to: string
    label?: string
    style?: 'dotted'
    classes?: string[]
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

    addNode(id: string, label: string, options: Omit<GraphNode, 'id' | 'label'> = {}): void {
        this.nodes.set(id, { id, label, ...options })
    }

    addEdge(from: string, to: string, options: Omit<GraphEdge, 'id' | 'from' | 'to'> & { id?: string } = {}): void {
        this.edges.push({ id: options.id ?? `e${this.edges.length + 1}`, from, to, ...options })
    }

    addGroup(id: string, nodes: Iterable<string>, options: Pick<GraphGroup, 'label'> = {}): void {
        this.groups.push({ id, nodes: [...nodes], ...options })
    }
}

export function renderGraph(diagram: GraphDiagram, format: GraphFormat): string {
    switch (format) {
        case 'mermaid':
            return renderMermaid(diagram)
        case 'graphviz':
            return renderGraphviz(diagram)
        case 'cytoscape':
            return renderCytoscape(diagram)
    }
}

function renderMermaid(diagram: GraphDiagram): string {
    const flowchart = Flowchart.create(diagram.direction)
    for (const node of diagram.nodes.values()) {
        flowchart.addNode(
            sanitizeMermaidId(node.id),
            node.label.trim().replaceAll('\n', '<br>'),
            node.shape ? { shape: node.shape } : undefined
        )
    }
    for (const edge of diagram.edges) {
        flowchart.addLink(sanitizeMermaidId(edge.from), sanitizeMermaidId(edge.to), {
            ...(edge.label === undefined ? {} : { text: edge.label }),
            ...(edge.style === undefined ? {} : { stroke: edge.style }),
        })
    }
    for (const group of diagram.groups) {
        flowchart.createSubgraph(group.id, group.nodes.map(sanitizeMermaidId), group.label)
    }
    return flowchart.render({ compactLinks: true, indent: 0 })
}

function renderGraphviz(diagram: GraphDiagram): string {
    const graph = new Digraph('G')
    graph.set(_.rankdir, diagram.direction === 'TD' ? 'TB' : 'LR')

    const groupForNode = groupParents(diagram)
    const graphvizGroups = new Map<string, ReturnType<typeof graph.createSubgraph>>()
    for (const group of diagram.groups) {
        graphvizGroups.set(
            group.id,
            graph.createSubgraph(`cluster_${group.id}`, group.label ? { [_.label]: group.label } : {})
        )
    }
    for (const node of diagram.nodes.values()) {
        const attributes = {
            [_.label]: node.label,
            ...(node.shape === undefined ? {} : { [_.shape]: node.shape }),
        }
        const group = groupForNode.get(node.id)
        if (group) graphvizGroups.get(group)!.createNode(node.id, attributes)
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

type CytoscapeElement = {
    group: 'nodes' | 'edges'
    data: Record<string, string>
    classes?: string[]
}

function renderCytoscape(diagram: GraphDiagram): string {
    const parents = groupParents(diagram)
    const groupElements: CytoscapeElement[] = diagram.groups.map(group => ({
        group: 'nodes',
        data: { id: group.id, label: group.label ?? group.id },
    }))
    const nodeElements: CytoscapeElement[] = [...diagram.nodes.values()].map(node => ({
        group: 'nodes',
        data: {
            id: node.id,
            label: node.label,
            ...(parents.has(node.id) ? { parent: parents.get(node.id)! } : {}),
            ...(node.shape === undefined ? {} : { shape: node.shape }),
        },
        ...(node.classes?.length ? { classes: node.classes } : {}),
    }))
    const edgeElements: CytoscapeElement[] = diagram.edges.map(edge => ({
        group: 'edges',
        data: {
            id: edge.id,
            source: edge.from,
            target: edge.to,
            ...(edge.label === undefined ? {} : { label: edge.label }),
            ...(edge.style === undefined ? {} : { style: edge.style }),
        },
        ...classes(edge.classes, edge.style),
    }))

    return JSON.stringify([...groupElements, ...nodeElements, ...edgeElements], null, 2)
}

function groupParents(diagram: GraphDiagram): Map<string, string> {
    const parents = new Map<string, string>()
    for (const group of diagram.groups) {
        for (const node of group.nodes) parents.set(node, group.id)
    }
    return parents
}

function classes(base: string[] | undefined, style: string | undefined): Pick<CytoscapeElement, 'classes'> {
    const values = [...(base ?? []), ...(style === undefined ? [] : [style])]
    return values.length ? { classes: values } : {}
}

function sanitizeMermaidId(key: string): string {
    return key.replaceAll(/\W+/g, '-')
}
