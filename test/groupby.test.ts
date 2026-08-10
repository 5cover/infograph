import assert from 'node:assert/strict'
import test from 'node:test'
import { groupBySites, groupRecordToMermaid, sortGroupRecord, type EdgeId } from '../src/queries/groupby.js'
import type { BaseKeys, Complexity, Infograph, InfographNodeKey, Technicality } from '../src/types.js'
import { unparseEdgeKey } from '../src/infograph.js'

type Keys = {
    node: string
    kind: 'project' | 'task' | 'actor' | 'tool' | 'process' | 'constraint' | 'event'
    verb: 'link'
    source: 'test'
}

type Node = InfographNodeKey<Keys>
type Edge = Infograph<Keys>['edges'][number]

const node = (
    key: Node,
    options: { complexity?: Complexity; technicality?: Technicality } = {}
): Infograph<Keys>['nodes'] extends Map<Node, infer Value> ? Value : never => ({
    title: key.split(' ', 2)[1].toUpperCase(),
    complexity: { is: options.complexity ?? 'simple', why: ['test'] },
    technicality: options.technicality === undefined ? undefined : { is: options.technicality, why: ['test'] },
})

const edge = (from: Node, to: Node, complexity: Complexity = 'simple'): Edge => ({
    from,
    to,
    verb: 'link',
    info: { complexity: { is: complexity, why: ['test'] } },
})

const graph = (
    nodeKeys: Node[],
    edgePairs: [Node, Node][],
    nodeOptions: Partial<Record<Node, { complexity?: Complexity; technicality?: Technicality }>> = {},
    edgeComplexities: Partial<Record<string, Complexity>> = {}
): Infograph<Keys> => ({
    domain: {
        kind: { project: null, task: null, actor: null, tool: null, process: null, constraint: null, event: null },
        verb: { link: null },
        source: { test: null },
    },
    nodes: new Map(nodeKeys.map(key => [key, node(key, nodeOptions[key])])),
    edges: edgePairs.map(([from, to]) => {
        const id = `${from} link ${to}`
        return edge(from, to, edgeComplexities[id])
    }),
})

const ids = (g: Infograph<Keys>) => g.edges.map(edge => unparseEdgeKey<Keys>(edge) as string).sort()
const edgeKeys = (g: Infograph<Keys>): EdgeId<Keys>[] => g.edges.map(edge => unparseEdgeKey<Keys>(edge))

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
        const id = unparseEdgeKey(e) as string
        map.set(e.from, [...(map.get(e.from) ?? []), id])
        map.set(e.to, [...(map.get(e.to) ?? []), id])
    }
    return map
}

const distances = (g: Infograph<Keys>, site: Node) => {
    const byId = new Map(g.edges.map(e => [unparseEdgeKey(e) as string, e] as const))
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

test('alphabetical sorting remains the default and explicit alphabetical mode', () => {
    const g = graph(
        ['project a', 'task b', 'task c'],
        [
            ['project a', 'task c'],
            ['project a', 'task b'],
        ]
    )
    const implicit = groupBySites(g, ['project a'])
    const explicit = groupBySites(g, ['project a'], 'alphabetical')

    assert.deepEqual(implicit, explicit)
    assert.deepEqual(implicit['project a'], ['project a link task b', 'project a link task c'])
})

test('funnel starts with lower exposition-cost edges', () => {
    const g = graph(
        ['project root', 'task accessible', 'task contextual', 'task technical'],
        [
            ['project root', 'task technical'],
            ['project root', 'task accessible'],
            ['project root', 'task contextual'],
        ],
        {
            'task contextual': { complexity: 'contextual', technicality: 'some' },
            'task technical': { complexity: 'intertwined', technicality: 'all' },
        }
    )
    const idsForGroup = edgeKeys(g)
    const groups = sortGroupRecord(g, { 'project root': idsForGroup }, 'funnel')

    assert.deepEqual(groups['project root'], [
        'project root link task accessible',
        'project root link task contextual',
        'project root link task technical',
    ])
})

test('funnel prefers local continuity over an unrelated similarly cheap edge', () => {
    const g = graph(
        ['project root', 'task accessible', 'task technical', 'task isolated', 'task isolated two'],
        [
            ['project root', 'task accessible'],
            ['task accessible', 'task technical'],
            ['task isolated', 'task isolated two'],
        ],
        { 'task technical': { complexity: 'intertwined', technicality: 'some' } }
    )
    const groups = sortGroupRecord(
        g,
        {
            'project root': edgeKeys(g),
        },
        'funnel'
    )

    assert.deepEqual(groups['project root'], [
        'project root link task accessible',
        'task accessible link task technical',
        'task isolated link task isolated two',
    ])
})

test('funnel allows a locally coherent continuation to decrease exposition cost', () => {
    const g = graph(
        ['project root', 'task difficult', 'task less difficult'],
        [
            ['project root', 'task difficult'],
            ['task difficult', 'task less difficult'],
        ],
        {
            'task difficult': { complexity: 'intertwined', technicality: 'some' },
            'task less difficult': { complexity: 'contextual', technicality: 'some' },
        }
    )
    const groups = sortGroupRecord(g, { 'project root': edgeKeys(g) }, 'funnel')

    assert.deepEqual(groups['project root'], [
        'project root link task difficult',
        'task difficult link task less difficult',
    ])
})

test('edge complexity breaks funnel ties after exposition cost', () => {
    const g = graph(
        ['project root', 'task start', 'task easy', 'task hard'],
        [
            ['project root', 'task start'],
            ['task start', 'task hard'],
            ['task start', 'task easy'],
        ],
        {},
        {
            'task start link task hard': 'intertwined',
            'task start link task easy': 'simple',
        }
    )
    const groups = sortGroupRecord(g, { 'project root': edgeKeys(g) }, 'funnel')

    assert.deepEqual(groups['project root'], [
        'project root link task start',
        'task start link task easy',
        'task start link task hard',
    ])
})

test('funnel starts a new implicit thread for disconnected group edges', () => {
    const g = graph(
        ['project root', 'task first', 'task second', 'task isolated', 'task isolated two', 'task isolated three'],
        [
            ['project root', 'task first'],
            ['task first', 'task second'],
            ['task isolated', 'task isolated two'],
            ['task isolated two', 'task isolated three'],
        ],
        {
            'task second': { complexity: 'intertwined', technicality: 'all' },
            'task isolated': { complexity: 'natural', technicality: 'none' },
            'task isolated three': { complexity: 'contextual', technicality: 'some' },
        }
    )
    const groups = sortGroupRecord(g, { 'project root': edgeKeys(g) }, 'funnel')

    assert.deepEqual(groups['project root'], [
        'project root link task first',
        'task first link task second',
        'task isolated link task isolated two',
        'task isolated two link task isolated three',
    ])
})

test('funnel preserves group membership, visits every edge once, and sorts groups independently', () => {
    const g = graph(
        ['project a', 'project d', 'task b', 'task c'],
        [
            ['project a', 'task b'],
            ['task b', 'task c'],
            ['task c', 'project d'],
        ]
    )
    const alphabetical = groupBySites(g, ['project a', 'project d'])
    const funnel = groupBySites(g, ['project a', 'project d'], 'funnel')

    assert.deepEqual(Object.keys(funnel), Object.keys(alphabetical))
    for (const site of Object.keys(alphabetical) as Node[]) {
        assert.deepEqual(new Set(funnel[site]), new Set(alphabetical[site]))
        assert.equal(new Set(funnel[site]).size, funnel[site].length)
    }
})

test('funnel output is deterministic', () => {
    const g = graph(
        ['project root', 'task a', 'task b', 'task c'],
        [
            ['project root', 'task c'],
            ['task b', 'task c'],
            ['project root', 'task a'],
        ]
    )
    const first = sortGroupRecord(g, { 'project root': edgeKeys(g) }, 'funnel')
    const second = sortGroupRecord(g, { 'project root': edgeKeys(g) }, 'funnel')

    assert.deepEqual(first, second)
})

test('funnel gives a realistic graph a plausible accessible-to-technical progression', () => {
    const g = graph(
        [
            'project sponsorship',
            'actor me',
            'tool power_automate',
            'process amount_calculation',
            'constraint reliability_focus',
            'event handover_pressure',
        ],
        [
            ['project sponsorship', 'actor me'],
            ['project sponsorship', 'tool power_automate'],
            ['project sponsorship', 'process amount_calculation'],
            ['process amount_calculation', 'constraint reliability_focus'],
            ['constraint reliability_focus', 'event handover_pressure'],
        ],
        {
            'project sponsorship': { complexity: 'natural', technicality: 'some' },
            'tool power_automate': { complexity: 'simple', technicality: 'some' },
            'process amount_calculation': { complexity: 'contextual', technicality: 'some' },
            'constraint reliability_focus': { complexity: 'intertwined', technicality: 'all' },
            'event handover_pressure': { complexity: 'natural', technicality: 'none' },
        },
        {
            'project sponsorship link tool power_automate': 'natural',
            'project sponsorship link process amount_calculation': 'contextual',
            'process amount_calculation link constraint reliability_focus': 'natural',
            'constraint reliability_focus link event handover_pressure': 'contextual',
        }
    )
    const groups = sortGroupRecord(g, { 'project sponsorship': edgeKeys(g) }, 'funnel')

    assert.deepEqual(groups['project sponsorship'], [
        'project sponsorship link actor me',
        'project sponsorship link tool power_automate',
        'project sponsorship link process amount_calculation',
        'process amount_calculation link constraint reliability_focus',
        'constraint reliability_focus link event handover_pressure',
    ])
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
