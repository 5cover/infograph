import assert from 'node:assert/strict'
import test from 'node:test'
import * as api from '../src/index.js'
import { formatInfographByEdges, parseInfograph } from '../src/input.js'
import { subgraph, type Infograph } from '../src/model.js'
import { GraphDiagram, renderGraph } from '../src/graph.js'
import {
    compareChronologicalBudgets,
    cyclicComponents,
    edgeSpace,
    edgesWithVerb,
    groupByKinds,
    keywordVocabulary,
    metrics,
    selectGroup,
} from '../src/query.js'

const reason = { is: 'simple' as const, why: ['test'] }

const graph = (): Infograph => ({
    domain: {
        kind: { project: null, task: null },
        verb: { links: null },
        source: { test: null },
    },
    nodes: new Map([
        ['project alpha', { title: 'Alpha', complexity: reason }],
        ['task build', { title: 'Build', complexity: reason }],
        ['task verify', { title: 'Verify', complexity: reason }],
    ]),
    edges: [
        ['project alpha', 'task build'],
        ['task build', 'task verify'],
        ['task verify', 'task build'],
    ].map(([from, to]) => ({ from: from as `project ${string}` | `task ${string}`, to: to as `project ${string}` | `task ${string}`, verb: 'links', info: { complexity: reason } })),
})

test('public facades support parsed graph analysis and a selected group diagram', () => {
    assert.equal(api.groupByKinds, groupByKinds)
    assert.equal(api.parseInfograph, parseInfograph)
    assert.equal(api.renderGraph, renderGraph)
    const infograph = graph()
    const reparsed = parseInfograph(formatInfographByEdges(infograph))
    assert.deepEqual(reparsed.nodes.keys().toArray(), infograph.nodes.keys().toArray())
    assert.deepEqual(
        reparsed.edges.map(({ from, verb, to }) => ({ from, verb, to })),
        infograph.edges.map(({ from, verb, to }) => ({ from, verb, to }))
    )
    assert.equal(subgraph(infograph, ['task build']).edges.length, 0)

    assert.equal(metrics(infograph).nodeCount, 3)
    assert.equal(edgesWithVerb(infograph, 'links').length, 3)
    assert.equal(edgeSpace(infograph.domain).length, 4)
    assert.deepEqual(keywordVocabulary(infograph.domain).kind, ['project', 'task'])
    assert.deepEqual(cyclicComponents(infograph), [['task build', 'task verify']])
    assert.equal(compareChronologicalBudgets(infograph, { budgets: [3, 9] }).length, 2)

    const tree = groupByKinds(infograph, ['project', 'task'])
    const selected = selectGroup(tree, ['project alpha', 'task build'])
    assert.ok(selected)
    assert.equal(selected.edges?.size, 3)
    assert.deepEqual(selected.centers, ['project alpha', 'task build'])

    const diagram = new GraphDiagram()
    diagram.addNode('one', 'One')
    assert.match(renderGraph(diagram, 'mermaid'), /^flowchart TD/)
})
