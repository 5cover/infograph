import assert from 'node:assert/strict'
import test from 'node:test'
import { select, traverse } from '../src/query.js'
import type { Infograph } from '../src/types.js'

const simple = { is: 'simple' as const, why: ['test'] }
const major = { is: 'major' as const, why: ['test'] }
const central = { is: 'central' as const, why: ['test'] }

const graph = (): Infograph => ({
    domain: {
        kind: { project: null, decision: null, finding: null },
        verb: { explains: null, uses: null },
        source: { journal: null, repo: null },
    },
    nodes: new Map([
        [
            'project alpha',
            {
                title: 'Alpha',
                summary: 'A validation project',
                claim: [{ type: 'fact', content: 'Alpha is supported by a journal.' }],
                date: { from: new Date('2026-01-01'), to: new Date('2026-03-31') },
                importance: central,
                complexity: simple,
                source: [{ is: 'journal', why: ['entry'] }],
                tag: ['delivery'],
            },
        ],
        [
            'decision adopt_api',
            {
                title: 'Adopt API',
                claim: [{ type: 'opinion', content: 'Validation needed an API.' }],
                importance: major,
                complexity: simple,
                source: [{ is: 'repo', why: ['commit'] }],
                tag: ['validation'],
            },
        ],
        ['finding retry', { title: 'Retry finding', complexity: simple }],
    ]),
    edges: [
        ['project alpha', 'decision adopt_api', 'explains'],
        ['decision adopt_api', 'finding retry', 'uses'],
        ['finding retry', 'project alpha', 'explains'],
    ].map(([from, to, verb]) => ({
        from: from as `project ${string}` | `decision ${string}` | `finding ${string}`,
        to: to as `project ${string}` | `decision ${string}` | `finding ${string}`,
        verb: verb as 'explains' | 'uses',
        info: { complexity: simple },
    })),
})

test('select applies declarative node and edge predicates', () => {
    const infograph = graph()
    const nodes = select(infograph, {
        target: 'nodes',
        where: {
            kind: ['project', 'decision'],
            importance: { operator: '>=', value: 'major' },
            match: [{ field: 'claim', value: 'validation' }],
        },
    })
    assert.equal(nodes.target, 'nodes')
    if (nodes.target !== 'nodes') throw new Error('Expected node selection')
    assert.deepEqual(
        nodes.nodes.map(result => result.key),
        ['decision adopt_api']
    )

    const dated = select(infograph, {
        target: 'nodes',
        where: { source: ['journal'], date: { from: new Date('2026-03-01'), to: new Date('2026-04-01') } },
    })
    assert.equal(dated.target, 'nodes')
    if (dated.target !== 'nodes') throw new Error('Expected node selection')
    assert.deepEqual(
        dated.nodes.map(result => result.key),
        ['project alpha']
    )

    const edges = select(infograph, { target: 'edges', where: { verb: ['explains'] } })
    assert.equal(edges.target, 'edges')
    if (edges.target !== 'edges') throw new Error('Expected edge selection')
    assert.deepEqual(
        edges.edges.map(edge => edge.from),
        ['project alpha', 'finding retry']
    )
})

test('traverse is bounded, breadth-first, and respects node and edge predicates', () => {
    const infograph = graph()
    const result = traverse(infograph, {
        from: ['project alpha'],
        direction: 'out',
        maxHops: 2,
        edge: { verb: ['explains', 'uses'] },
    })
    assert.deepEqual(
        result.nodes.map(node => [node.key, node.depth]),
        [
            ['project alpha', 0],
            ['decision adopt_api', 1],
            ['finding retry', 2],
        ]
    )
    assert.deepEqual(result.frontier, ['finding retry'])

    const filtered = traverse(infograph, {
        from: ['project alpha'],
        direction: 'out',
        maxHops: 2,
        node: { kind: ['decision'] },
    })
    assert.deepEqual(
        filtered.nodes.map(node => node.key),
        ['project alpha', 'decision adopt_api']
    )
    assert.throws(() => traverse(infograph, { from: ['project alpha'], maxHops: 0 }), /positive integer/)
})
