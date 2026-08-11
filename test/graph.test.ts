import assert from 'node:assert/strict'
import test from 'node:test'
import { fromDot } from 'ts-graphviz'
import { GraphDiagram, renderGraph } from '../src/graph.js'

const diagram = () => {
    const graph = new GraphDiagram('LR')
    graph.addNode('source node', 'Source\nnode')
    graph.addNode('boundary node', 'Boundary', { shape: 'stadium' })
    graph.addEdge('source node', 'boundary node', { label: 'explains', style: 'dotted' })
    graph.addGroup('topic', ['source node', 'boundary node'], { label: 'Topic' })
    return graph
}

test('renders the common graph model as valid Graphviz DOT', () => {
    const dot = renderGraph(diagram(), 'graphviz')

    assert.match(dot, /^digraph "G" \{\n/)
    assert.match(dot, /rankdir = "LR"/)
    assert.match(dot, /subgraph "cluster_topic"/)
    assert.match(dot, /style = "dotted"/)
    assert.doesNotThrow(() => fromDot(dot))
})

test('wraps multiple DOT diagrams in separate markdown blocks', () => {
    const output = renderGraph([diagram(), diagram()], 'graphviz')

    assert.match(output, /^```dot\ndigraph "G"/)
    assert.match(output, /\n```\n\n```dot\ndigraph "G"/)
})
