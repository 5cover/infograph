import assert from 'node:assert/strict'
import test from 'node:test'
import {
    groupByKinds,
    groupBySites,
    groupTreeToGraph,
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
    ] as [Node, ReturnType<typeof node>][]) ,
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

const leaf = <T>(tree: GroupTree<Keys, T>, ...keys: string[]): T => {
    let value: GroupTree<Keys, T> | T = tree
    for (const key of keys) value = (value as GroupTree<Keys, T>).get(key as Node | '*')!
    return value as T
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
    assert.ok(alphabetical.get('project north')!.values().every(value => value === null))
    assert.ok(funnel.get('project north')!.values().every(value => typeof value === 'number'))
    assert.deepEqual(funnel, sortGroupRecord(infograph, group, 'funnel'))
})

test('multiple kinds produce a nested tree and carry missing sites in a wildcard child', () => {
    const infograph = graph()
    const groups = groupByKinds(infograph, ['project', 'task', 'actor'])
    const north = leaf(groups, 'project north', 'task design', 'actor alex') as GroupRecordValue<Keys>
    const south = leaf(groups, 'project south', 'task delivery', '*') as GroupRecordValue<Keys>

    assert.ok(north.size > 0)
    assert.ok(south.size > 0)
    const allLeaves = [north, south]
    assert.ok(allLeaves.flatMap(value => value.keys().toArray()).every(id => infograph.edges.map(unparseEdgeKey).includes(id)))
})

test('hierarchical graph data preserves the hierarchy and renders raw backend strings at leaves', () => {
    const infograph = graph()
    const tree = groupByKinds(infograph, ['project', 'task', 'actor'])
    const graphs = groupTreeToGraph(infograph, tree, 3, 'graphviz')
    const north = leaf(graphs, 'project north', 'task design', 'actor alex')
    const south = leaf(graphs, 'project south', 'task delivery', '*')
    assert.match(north, /^digraph "G"/)
    assert.match(south, /^digraph "G"/)
    assert.doesNotMatch(north, /```/)
})
