import assert from 'node:assert/strict'
import test from 'node:test'
import { edgeId, groupBySites, groupRecordToMermaid } from '../src/queries/groupby.js'
import type { BaseKeys, Infograph, InfographNodeKey } from '../src/types.js'

type Keys = {
    node: string
    kind: 'project' | 'task' | 'actor'
    verb: 'link'
    source: 'test'
}

type Node = InfographNodeKey<Keys>
type Edge = Infograph<Keys>['edges'][number]

const node = (key: Node): Infograph<Keys>['nodes'] extends Map<Node, infer Value> ? Value : never => ({
    title: key.split(' ', 2)[1].toUpperCase(),
    complexity: { is: 'simple', why: ['test'] },
})

const edge = (from: Node, to: Node): Edge => ({
    from,
    to,
    verb: 'link',
    info: { complexity: { is: 'simple', why: ['test'] } },
})

const graph = (nodeKeys: Node[], edgePairs: [Node, Node][]): Infograph<Keys> => ({
    domain: {
        kind: { project: null, task: null, actor: null },
        verb: { link: null },
        source: { test: null },
    },
    nodes: new Map(nodeKeys.map(key => [key, node(key)])),
    edges: edgePairs.map(([from, to]) => edge(from, to)),
})

const ids = (g: Infograph<Keys>) => g.edges.map(e => edgeId(e) as string).sort()

const assertValidGroups = (
    g: Infograph<Keys>,
    sites: Node[],
    groups: Partial<Record<Node, readonly string[]>>
) => {
    const allEdges = new Set(ids(g))
    assert.deepEqual(Object.keys(groups).sort(), [...sites].sort())

    const union = new Set<string>()
    for (const [site, group] of Object.entries(groups)) {
        const assignedEdges = group ?? []
        assert.ok(sites.includes(site as Node))
        assert.deepEqual(assignedEdges, [...assignedEdges].sort())
        for (const id of assignedEdges) {
            assert.ok(allEdges.has(id), `unknown edge ${id}`)
            union.add(id)
        }
    }
    assert.deepEqual([...union].sort(), [...allEdges].sort())
}

const incident = (g: Infograph<Keys>) => {
    const map = new Map<Node, string[]>()
    for (const e of g.edges) {
        const id = edgeId(e) as string
        map.set(e.from, [...(map.get(e.from) ?? []), id])
        map.set(e.to, [...(map.get(e.to) ?? []), id])
    }
    return map
}

const distances = (g: Infograph<Keys>, site: Node) => {
    const byId = new Map(g.edges.map(e => [edgeId(e) as string, e] as const))
    const incidence = incident(g)
    const result = new Map<string, number>()
    const queue: { id: string; distance: number }[] = []
    for (const id of incidence.get(site) ?? []) {
        result.set(id, 0)
        queue.push({ id, distance: 0 })
    }

    for (let head = 0; head < queue.length; head++) {
        const { id, distance } = queue[head]
        if (result.get(id) !== distance) continue
        const e = byId.get(id)!
        const next = new Set([...(incidence.get(e.from) ?? []), ...(incidence.get(e.to) ?? [])])
        next.delete(id)
        for (const adjacent of next) {
            if ((result.get(adjacent) ?? Number.POSITIVE_INFINITY) <= distance + 1) continue
            result.set(adjacent, distance + 1)
            queue.push({ id: adjacent, distance: distance + 1 })
        }
    }

    return result
}

const assertNearestOnly = (
    g: Infograph<Keys>,
    sites: Node[],
    groups: Partial<Record<Node, readonly string[]>>
) => {
    const bySite = new Map(sites.map(site => [site, distances(g, site)] as const))
    for (const id of ids(g)) {
        const edgeDistances = sites.map(site => bySite.get(site)!.get(id) ?? Number.POSITIVE_INFINITY)
        const minimum = Math.min(...edgeDistances)
        for (const site of sites) {
            const assigned = groups[site]?.includes(id) ?? false
            const distance = bySite.get(site)!.get(id) ?? Number.POSITIVE_INFINITY
            assert.equal(assigned, distance === minimum, `${id} assignment for ${site}`)
        }
    }
}

test('groups a simple chain between two project sites', () => {
    const g = graph(
        ['project a', 'task b', 'task c', 'project d'],
        [
            ['project a', 'task b'],
            ['task b', 'task c'],
            ['task c', 'project d'],
        ]
    )
    const groups = groupBySites(g, ['project a', 'project d'])

    assert.deepEqual(groups, {
        'project a': ['project a link task b', 'task b link task c'],
        'project d': ['task b link task c', 'task c link project d'],
    })
    assertValidGroups(g, ['project a', 'project d'], groups)
    assertNearestOnly(g, ['project a', 'project d'], groups)
})

test('duplicates an odd-length boundary edge into both nearest groups', () => {
    const g = graph(
        ['project a', 'task b', 'task c', 'project d'],
        [
            ['project a', 'task b'],
            ['task b', 'task c'],
            ['task c', 'project d'],
        ]
    )
    const groups = groupBySites(g, ['project a', 'project d'])

    assert.ok(groups['project a'].includes('task b link task c'))
    assert.ok(groups['project d'].includes('task b link task c'))
})

test('propagates equal-distance assignments across a branched shared boundary', () => {
    const g = graph(
        ['project a', 'task b', 'task c', 'project d', 'task x', 'task y'],
        [
            ['project a', 'task b'],
            ['task b', 'task c'],
            ['task c', 'project d'],
            ['task b', 'task x'],
            ['task x', 'task y'],
            ['task y', 'task c'],
        ]
    )
    const groups = groupBySites(g, ['project a', 'project d'])

    assertValidGroups(g, ['project a', 'project d'], groups)
    assertNearestOnly(g, ['project a', 'project d'], groups)
    assert.ok(groups['project a'].includes('task x link task y'))
    assert.ok(groups['project d'].includes('task x link task y'))
})

test('supports more than two sites', () => {
    const g = graph(
        ['project a', 'task b', 'project c', 'task d', 'project e'],
        [
            ['project a', 'task b'],
            ['task b', 'project c'],
            ['project c', 'task d'],
            ['task d', 'project e'],
        ]
    )
    const sites: Node[] = ['project a', 'project c', 'project e']
    const groups = groupBySites(g, sites)

    assert.deepEqual(groups['project c'], ['project c link task d', 'task b link project c'])
    assertValidGroups(g, sites, groups)
    assertNearestOnly(g, sites, groups)
})

test('returns an empty group for a site with no incident edges', () => {
    const g = graph(['project a', 'task b', 'project isolated'], [['project a', 'task b']])
    const groups = groupBySites(g, ['project a', 'project isolated'])

    assert.deepEqual(groups['project isolated'], [])
    assertValidGroups(g, ['project a', 'project isolated'], groups)
})

test('treats directed edges as undirected for distance', () => {
    const g = graph(
        ['project a', 'task b', 'task c', 'project d'],
        [
            ['task b', 'project a'],
            ['task c', 'task b'],
            ['project d', 'task c'],
        ]
    )
    const groups = groupBySites(g, ['project a', 'project d'])

    assert.deepEqual(groups, {
        'project a': ['task b link project a', 'task c link task b'],
        'project d': ['project d link task c', 'task c link task b'],
    })
    assertValidGroups(g, ['project a', 'project d'], groups)
    assertNearestOnly(g, ['project a', 'project d'], groups)
})

test('orders output deterministically regardless of input order', () => {
    const g = graph(
        ['project d', 'task c', 'project a', 'task b'],
        [
            ['task c', 'project d'],
            ['project a', 'task b'],
            ['task b', 'task c'],
        ]
    )

    assert.deepEqual(groupBySites(g, ['project d', 'project a']), groupBySites(g, ['project a', 'project d']))
})

test('throws for an unknown site', () => {
    const g = graph(['project a', 'task b'], [['project a', 'task b']])
    assert.throws(() => groupBySites(g, ['project missing']), /Unknown Voronoi site/)
})

test('throws when an edge region has no path to any site', () => {
    const g = graph(
        ['project a', 'task b', 'task x', 'task y'],
        [
            ['project a', 'task b'],
            ['task x', 'task y'],
        ]
    )
    assert.throws(() => groupBySites(g, ['project a']), /unreachable from any Voronoi site/)
})

test('throws when canonical edges have duplicate edge IDs', () => {
    const g = graph(
        ['project a', 'task b'],
        [
            ['project a', 'task b'],
            ['project a', 'task b'],
        ]
    )
    assert.throws(() => groupBySites(g, ['project a']), /Duplicate edge ID/)
})

test('renders one Mermaid flowchart per group with titles and edge ID labels', () => {
    const g = graph(
        ['project a', 'task b', 'task c', 'project d'],
        [
            ['project a', 'task b'],
            ['task b', 'task c'],
            ['task c', 'project d'],
        ]
    )
    const output = groupRecordToMermaid(g, groupBySites(g, ['project a', 'project d']))

    assert.match(output, /^```mermaid\nflowchart TD\n/)
    assert.match(output, /project-a\[A\]/)
    assert.match(output, /task-b\[B\]/)
    assert.match(output, /project-a\[A\] -->\|link\| task-b\[B\]/)
    assert.match(output, /task-b\[B\] -->\|link\| task-c\[C\]/)
    assert.match(output, /\n```\n\n```mermaid\nflowchart TD\n/)
    assert.match(output, /project-d\[D\]/)
    assert.match(output, /task-c\[C\] -->\|link\| project-d\[D\]/)
})
