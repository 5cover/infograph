import assert from 'node:assert/strict'
import test from 'node:test'
import { applyEdits, parseEdits } from '../src/edit.js'
import type { Infograph } from '../src/types.js'

const simple = { is: 'simple' as const, why: ['test'] }

const graph = (): Infograph => ({
    domain: {
        kind: { project: null, task: null },
        verb: { contains: null },
        source: { journal: null },
    },
    nodes: new Map([
        ['project alpha', { title: 'Alpha', summary: 'Temporary', complexity: simple, tag: ['alpha'] }],
        ['task beta', { title: 'Beta', complexity: simple, tag: ['legacy'] }],
    ]),
    edges: [{ from: 'project alpha', verb: 'contains', to: 'task beta', info: { complexity: simple } }],
})

test('applyEdits applies constrained changes without mutating the original graph', () => {
    const original = graph()
    const edits = parseEdits([
        { 'set-node': { node: 'project alpha', fields: { summary: null } } },
        { 'set-node': { node: 'task beta', fields: { tag: [] } } },
        { 'add-claim': { node: 'task beta', claim: { fact: 'Beta was completed.' } } },
        { 'add-tag': { node: 'task beta', tag: 'delivery' } },
        { 'add-tag': { node: 'task beta', tag: 'delivery' } },
        {
            'add-node': {
                node: 'task gamma',
                info: { title: 'Gamma', complexity: { is: 'simple', why: 'test' } },
            },
        },
        {
            'add-edge': {
                from: 'task beta',
                verb: 'contains',
                to: 'task gamma',
                with: { complexity: { is: 'simple', why: 'test' } },
            },
        },
        { 'remove-node': { node: 'project alpha' } },
    ])

    const result = applyEdits(original, edits)
    assert.equal(original.nodes.has('project alpha'), true)
    assert.equal(result.infograph.nodes.has('project alpha'), false)
    assert.equal(result.infograph.nodes.get('task beta')?.summary, undefined)
    assert.equal(result.infograph.nodes.get('task beta')?.tag?.[0], 'delivery')
    assert.deepEqual(
        result.infograph.nodes.get('task beta')?.claim?.map(({ type, content }) => ({ type, content })),
        [{ type: 'fact', content: 'Beta was completed.' }]
    )
    assert.deepEqual(
        result.infograph.edges.map(edge => [edge.from, edge.to]),
        [['task beta', 'task gamma']]
    )
    assert.deepEqual(result.changes.at(-1), {
        operation: 'remove-node',
        target: 'project alpha',
        status: 'applied',
        removedEdges: 1,
    })
    assert.equal(result.changes[4]?.status, 'noop')
})

test('invalid edits fail before callers receive a changed graph', () => {
    const original = graph()
    assert.throws(
        () =>
            applyEdits(original, parseEdits([{ 'set-node': { node: 'project alpha', fields: { complexity: null } } }])),
        /complexity cannot be null/
    )
    assert.equal(original.nodes.get('project alpha')?.summary, 'Temporary')
    assert.throws(() => parseEdits({ 'remove-node': { node: 'project alpha' } }), /operation/)
})
