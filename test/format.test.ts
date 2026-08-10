import assert from 'node:assert/strict'
import test from 'node:test'
import * as YAML from 'yaml'
import { formatInfographByNodes } from '../src/input/format.js'
import { parseInfograph } from '../src/input/index.js'
import type {  Infograph, InfographNodeKey } from '../src/types.js'
import { unparseEdgeKey } from '../src/infograph.js';

type Keys = {
    node: string
    kind: 'project' | 'task' | 'actor'
    verb: 'contains' | 'involves'
    source: 'journal'
}

type Node = InfographNodeKey<Keys>

const reason = <T extends string>(is: T, why: string[]) => ({ is, why })

const infograph = (): Infograph<Keys> => ({
    info: {
        title: 'Example',
        context: 'Formatter test',
        author: 'me',
    },
    domain: {
        kind: { project: null, task: null, actor: null },
        verb: { contains: null, involves: null },
        source: { journal: null },
    },
    nodes: new Map([
        [
            'project alpha',
            {
                title: 'Alpha',
                summary: 'Project node.',
                claim: [{ type: 'fact', content: 'I worked on Alpha.' }],
                date: { from: new Date('2026-01-01T00:00:00.000Z'), to: new Date('2026-01-01T00:00:00.000Z') },
                importance: reason('major', ['central to the example']),
                complexity: reason('simple', ['easy']),
                technicality: reason('some', ['needs a little platform context']),
                source: [reason('journal', ['entry'])],
                tag: ['alpha'],
            },
        ],
        [
            'task beta',
            {
                title: 'Beta',
                complexity: reason('natural', ['needs context', 'has details']),
                technicality: reason('none', ['plain language']),
                tag: ['beta', 'task'],
            },
        ],
        [
            'actor me',
            {
                title: 'Me',
                complexity: reason('simple', ['author']),
            },
        ],
    ] as [Node, Infograph<Keys>['nodes'] extends Map<Node, infer Value> ? Value : never][]),
    edges: [
        {
            from: 'project alpha',
            verb: 'contains',
            to: 'task beta',
            info: {
                complexity: reason('simple', ['direct']),
                technicality: reason('none', ['plain']),
                claim: [{ type: 'fact', content: 'Alpha contains Beta.' }],
            },
        },
        {
            from: 'project alpha',
            verb: 'involves',
            to: 'actor me',
            info: {
                complexity: reason('simple', ['direct']),
            },
        },
    ],
})

test('formats an infograph to terse input shape', () => {
    assert.deepEqual(formatInfographByNodes(infograph()), {
        info: {
            title: 'Example',
            context: 'Formatter test',
            author: 'me',
        },
        domain: {
            kind: { actor: null, project: null, task: null },
            verb: { contains: null, involves: null },
            source: { journal: null },
        },
        nodes: {
            'actor me': {
                info: {
                    title: 'Me',
                    complexity: { is: 'simple', why: 'author' },
                },
            },
            'project alpha': {
                info: {
                    title: 'Alpha',
                    summary: 'Project node.',
                    date: '2026',
                    importance: { is: 'major', why: 'central to the example' },
                    complexity: { is: 'simple', why: 'easy' },
                    technicality: { is: 'some', why: 'needs a little platform context' },
                    source: { is: 'journal', why: 'entry' },
                    claim: [{ fact: 'I worked on Alpha.' }],
                    tag: 'alpha',
                },
                contains: {
                    'task beta': {
                        with: {
                            complexity: { is: 'simple', why: 'direct' },
                            technicality: { is: 'none', why: 'plain' },
                            claim: [{ fact: 'Alpha contains Beta.' }],
                        },
                    },
                },
                involves: {
                    'actor me': {
                        with: {
                            complexity: { is: 'simple', why: 'direct' },
                        },
                    },
                },
            },
            'task beta': {
                info: {
                    title: 'Beta',
                    complexity: { is: 'natural', why: ['needs context', 'has details'] },
                    technicality: { is: 'none', why: 'plain language' },
                    tag: ['beta', 'task'],
                },
            },
        },
    })
})

test('formats object keys in canonical order', () => {
    const formatted = formatInfographByNodes(infograph()) as Record<string, any>

    assert.deepEqual(Object.keys(formatted), ['info', 'domain', 'nodes'])
    assert.deepEqual(Object.keys(formatted.domain), ['kind', 'verb', 'source'])
    assert.deepEqual(Object.keys(formatted.domain.kind), ['actor', 'project', 'task'])
    assert.deepEqual(Object.keys(formatted.nodes), ['actor me', 'project alpha', 'task beta'])
    assert.deepEqual(Object.keys(formatted.nodes['project alpha'].info), [
        'title',
        'summary',
        'date',
        'importance',
        'complexity',
        'technicality',
        'source',
        'claim',
        'tag',
    ])
    assert.deepEqual(Object.keys(formatted.nodes['project alpha'].contains), ['task beta'])
    assert.deepEqual(Object.keys(formatted.nodes['project alpha'].involves), ['actor me'])
})

test('formatted infograph parses back to an equivalent graph', () => {
    const parsed = parseInfograph(formatInfographByNodes(infograph()))

    assert.deepEqual([...parsed.nodes.keys()].sort(), [...infograph().nodes.keys()].sort())
    assert.deepEqual(
        parsed.edges.map(unparseEdgeKey),
        infograph().edges.map(unparseEdgeKey)
    )
})

test('throws when duplicate canonical edges cannot be represented in input objects', () => {
    const graph = infograph()
    graph.edges.push(graph.edges[0])

    assert.throws(() => formatInfographByNodes(graph), /Duplicate edge cannot be formatted/)
})
