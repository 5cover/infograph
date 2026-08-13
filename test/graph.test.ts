import assert from 'node:assert/strict'
import test from 'node:test'
import { fromDot } from 'ts-graphviz'
import { GraphDiagram, renderGraph } from '../src/graph.js'

const diagram = () => {
    const graph = new GraphDiagram('LR')
    graph.addNode('source node', 'Source\nnode', { classes: ['site'] })
    graph.addNode('boundary node', 'Boundary', { shape: 'stadium' })
    graph.addEdge('source node', 'boundary node', { label: 'explains', style: 'dotted' })
    graph.addGroup('topic', ['source node', 'boundary node'], { label: 'Topic' })
    return graph
}

test('renders the common graph model as valid Graphviz DOT', () => {
    const dot = renderGraph(diagram(), 'graphviz')

    assert.match(dot, /^digraph "G" \{\n/)
    assert.match(dot, /subgraph "cluster_topic"/)
    assert.match(dot, /style = "dotted"/)
    assert.doesNotThrow(() => fromDot(dot))
})

test('renders Cytoscape elements with compound parents and classes', () => {
    const elements = JSON.parse(renderGraph(diagram(), 'cytoscape'))

    assert.deepEqual(elements[0], { group: 'nodes', data: { id: 'topic', label: 'Topic' } })
    assert.deepEqual(elements[1], {
        group: 'nodes',
        data: { id: 'source node', label: 'Source\nnode', parent: 'topic' },
        classes: ['site'],
    })
    assert.deepEqual(elements[2], {
        group: 'nodes',
        data: { id: 'boundary node', label: 'Boundary', parent: 'topic', shape: 'stadium' },
    })
    assert.deepEqual(elements[3], {
        group: 'edges',
        data: {
            id: 'e1',
            source: 'source node',
            target: 'boundary node',
            label: 'explains',
            style: 'dotted',
        },
        classes: ['dotted'],
    })
})

test('renders a raw diagram without Markdown framing', () => {
    assert.doesNotMatch(renderGraph(diagram(), 'graphviz'), /```/)
    assert.doesNotMatch(renderGraph(diagram(), 'cytoscape'), /```/)
})
