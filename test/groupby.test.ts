import assert from 'node:assert/strict'
import test from 'node:test'
import {
    groupByKinds,
    groupBySites,
    groupTreeToGraph,
    partitionBySites,
    sortGroupRecord,
    type GroupRecord,
    type GroupRecordValue,
    type GroupTree,
} from '../src/queries/groupby.js'
import { unparseEdgeKey } from '../src/infograph.js'
import type { Complexity, Infograph, InfographNodeKey } from '../src/types.js'

type Keys = {
    node: string
    kind: 'project' | 'task' | 'actor' | 'tool'
    verb: 'links'
    source: 'test'
}
type Node = InfographNodeKey<Keys>

const node = (title: string, complexity: Complexity = 'simple') => ({
    title,
    complexity: { is: complexity, why: ['test'] },
})

const graph = (): Infograph<Keys> => ({
    domain: {
        kind: { project: null, task: null, actor: null, tool: null },
        verb: { links: null },
        source: { test: null },
    },
    nodes: new Map([
        ['project north', node('North')],
        ['project south', node('South', 'natural')],
        ['task design', node('Design')],
        ['task delivery', node('Delivery', 'contextual')],
        ['actor alex', node('Alex')],
        ['tool isolated', node('Isolated tool')],
    ] as [Node, ReturnType<typeof node>][]),
    edges: [
        ['project north', 'task design'],
        ['task design', 'actor alex'],
        ['project south', 'task delivery'],
        ['task delivery', 'tool isolated'],
    ].map(([from, to]) => ({
        from: from as Node,
        to: to as Node,
        verb: 'links' as const,
        info: { complexity: { is: 'simple' as const, why: ['test'] } },
    })),
})

const groupAt = <T>(tree: GroupTree<Keys, T>, ...keys: string[]): GroupTree<Keys, T> => {
    let group = tree
    for (const key of keys) {
        group = group.nodes?.get(key as Node)!
    }
    return group
}

test('single-site grouping is deterministic, complete, and alphabetically ordered by default', () => {
    const infograph = graph()
    const first = groupBySites(infograph, { inputSites: ['project north', 'project south'] })
    const second = groupBySites(infograph, { inputSites: ['project south', 'project north'] })
    assert.deepEqual(first, second)

    const seen = new Set(first.values().flatMap(group => group.keys().toArray()))
    assert.deepEqual(seen.values().toArray().toSorted(), infograph.edges.map(unparseEdgeKey).toSorted())
    for (const group of first.values()) assert.deepEqual(group.keys().toArray(), group.keys().toArray().toSorted())
})

test('funnel sorting assigns costs while alphabetical sorting retains null leaf values', () => {
    const infograph = graph()
    const group: GroupRecord<Keys> = new Map([
        ['project north' as Node, new Map(infograph.edges.map(edge => [unparseEdgeKey<Keys>(edge), null] as const))],
    ])
    const alphabetical = sortGroupRecord(infograph, group)
    const funnel = sortGroupRecord(infograph, group, 'funnel')
    assert.ok(
        alphabetical
            .get('project north')!
            .values()
            .every(value => value === null)
    )
    assert.ok(
        funnel
            .get('project north')!
            .values()
            .every(value => typeof value === 'number')
    )
    assert.deepEqual(funnel, sortGroupRecord(infograph, group, 'funnel'))
})

test('nearest-site partition assigns every reachable edge once and minimizes the largest edge group', () => {
    const infograph = graph()
    infograph.nodes.set('task bridge', node('Bridge'))
    infograph.nodes.set('tool detached', node('Detached'))
    infograph.edges.push(
        {
            from: 'task design',
            to: 'task delivery',
            verb: 'links',
            info: { complexity: { is: 'simple', why: ['test'] } },
        },
        {
            from: 'tool detached',
            to: 'task bridge',
            verb: 'links',
            info: { complexity: { is: 'simple', why: ['test'] } },
        }
    )

    const sites: Node[] = ['project south', 'project north']
    const partition = partitionBySites(infograph, { inputSites: sites })
    const repeated = partitionBySites(infograph, { inputSites: sites.toReversed() })
    const assigned = partition.groups.values().flatMap(edges => edges.keys().toArray()).toArray()

    assert.deepEqual(partition, repeated)
    assert.equal(new Set(assigned).size, assigned.length)
    assert.equal(assigned.length, infograph.edges.length - partition.unreachable.length)
    assert.equal(partition.maximumEdges, 3)
    for (const [edge, site] of partition.assignment) assert.ok(partition.candidates.get(edge)?.includes(site))
    assert.ok(partition.unreachable.some(edge => edge.includes('tool detached')))
})

test('multiple kinds produce a nested tree', () => {
    const infograph = graph()
    const groups = groupByKinds(infograph, ['project', 'task', 'actor'])
    const north = groupAt(groups, 'project north', 'task design', 'actor alex').edges
    const south = groupAt(groups, 'project south', 'task delivery').edges

    assert.ok(north)
    assert.ok(south)
    const allLeaves = [north!, south!]
    assert.ok(
        allLeaves.flatMap(value => value.keys().toArray()).every(id => infograph.edges.map(unparseEdgeKey).includes(id))
    )
})

test('unassigned residual edges stay at their current scope without discarding sibling centers', () => {
    const infograph = graph()
    infograph.nodes.set('task independent', node('Independent'))
    infograph.nodes.set('tool orphan', node('Orphan'))
    infograph.edges.push({
        from: 'task independent',
        to: 'tool orphan',
        verb: 'links',
        info: { complexity: { is: 'simple', why: ['test'] } },
    })

    const groups = groupByKinds(infograph, ['project', 'task'])
    assert.deepEqual(groups.nodes?.keys().toArray(), ['project north', 'project south'])
    assert.equal(groups.edges?.size, 1)
    assert.equal(groupAt(groups, 'project north', 'task design').edges?.size, 2)
})

test('hierarchical graph data preserves the hierarchy and renders raw backend strings at leaves', () => {
    const infograph = graph()
    const tree = groupByKinds(infograph, ['project', 'task', 'actor'])
    const graphs = groupTreeToGraph(infograph, tree, 'graphviz')
    const north = groupAt(graphs, 'project north', 'task design', 'actor alex').edges
    const south = groupAt(graphs, 'project south', 'task delivery').edges
    assert.equal(graphs.edges, undefined)
    assert.equal(groupAt(graphs, 'project north').edges, undefined)
    assert.equal(typeof north, 'string')
    assert.equal(typeof south, 'string')
    assert.match(north!, /^digraph "G"/)
    assert.match(south!, /^digraph "G"/)
    assert.doesNotMatch(north!, /```/)
})
