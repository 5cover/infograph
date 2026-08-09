import * as YAML from 'yaml'
import type {
    BaseKeys,
    Claim,
    Infograph,
    InfographDate,
    InfographEdgeId,
    InfographNode,
    InfographReason,
} from '../types.js'
import { terseDate } from '../terseDate.js'
import { kdataEdge, kdataNode } from './types.js'

type PlainObject = Record<string, unknown>

const topLevelOrder = ['info', 'domain', 'nodes'] as const
const domainOrder = ['kind', 'verb', 'source'] as const
const infoOrder = [
    'title',
    'summary',
    'date',
    'importance',
    'complexity',
    'technicality',
    'source',
    'claim',
    'tag',
] as const
const reasonOrder = ['is', 'why'] as const
const edgeEnvelopeOrder = [kdataEdge] as const

export function formatInfograph<Keys extends BaseKeys>(infograph: Infograph<Keys>): PlainObject {
    const nodes: PlainObject = {}

    for (const [key, node] of [...infograph.nodes].sort(([a], [b]) => compareString(a, b))) {
        nodes[key] = { [kdataNode]: formatNode(node) }
    }

    const seenEdges = new Set<InfographEdgeId<Keys>>()
    for (const edge of [...infograph.edges].sort((a, b) => compareString(edgeId(a), edgeId(b)))) {
        const id = `${edge.from} ${edge.verb} ${edge.to}` as InfographEdgeId<Keys>
        if (seenEdges.has(id)) throw new Error(`Duplicate edge cannot be formatted: ${id}`)
        seenEdges.add(id)

        const source = nodes[edge.from] as PlainObject | undefined
        if (source === undefined) throw new Error(`Cannot format edge from unknown node: ${id}`)

        const byVerb = ensureObject(source, edge.verb)
        byVerb[edge.to] = orderedObject({ [kdataEdge]: formatEdge(edge.info) }, edgeEnvelopeOrder)
    }

    for (const [key, node] of Object.entries(nodes)) {
        nodes[key] = orderNode(node as PlainObject)
    }

    return orderedObject(
        {
            info: infograph.info,
            domain: formatDomain(infograph.domain),
            nodes: sortRecord(nodes),
        },
        topLevelOrder
    )
}

export function formatInfographYaml<Keys extends BaseKeys>(infograph: Infograph<Keys>): string {
    return new YAML.Document(formatInfograph(infograph), null, { aliasDuplicateObjects: false }).toString({
        nullStr: '',
        lineWidth: 0,
        singleQuote: true,
    })
}

function formatNode<Keys extends BaseKeys>(node: InfographNode<Keys>): PlainObject {
    return orderedObject(
        {
            title: node.title,
            summary: node.summary,
            date: formatDate(node.date),
            importance: formatReason(node.importance),
            complexity: formatReason(node.complexity),
            technicality: formatReason(node.technicality),
            source: flex(node.source?.map(formatReason)),
            claim: formatClaims(node.claim),
            tag: flex(node.tag),
        },
        infoOrder
    )
}

function formatEdge<Keys extends BaseKeys>(edge: Infograph<Keys>['edges'][number]['info']): PlainObject {
    return orderedObject(
        {
            complexity: formatReason(edge.complexity),
            technicality: formatReason(edge.technicality),
            claim: formatClaims(edge.claim),
        },
        infoOrder
    )
}

function formatClaims(claims: Claim[] | undefined): PlainObject[] | undefined {
    return claims?.map(claim => ({ [claim.type]: claim.content }))
}

function formatReason<T>(reason: InfographReason<T> | undefined): PlainObject | undefined {
    if (reason === undefined) return undefined
    return orderedObject({ is: reason.is, why: flex(reason.why) }, reasonOrder)
}

function formatDate(date: InfographDate | undefined): string | { from: string; to: string } | undefined {
    if (date === undefined) return undefined
    const from = terseDate(date.from)
    const to = terseDate(date.to)
    return from === to ? from : { from, to }
}

function flex<T>(values: T[] | undefined): T | T[] | undefined {
    if (values === undefined) return undefined
    return values.length === 1 ? values[0] : values
}

function ensureObject(parent: PlainObject, key: string): PlainObject {
    const existing = parent[key]
    if (existing !== undefined && isPlainObject(existing)) return existing
    const created: PlainObject = {}
    parent[key] = created
    return created
}

function formatDomain<Keys extends BaseKeys>(domain: Infograph<Keys>['domain']): PlainObject {
    return orderedObject(
        {
            kind: sortRecord(domain.kind),
            verb: sortRecord(domain.verb),
            source: sortRecord(domain.source),
        },
        domainOrder
    )
}

function orderedObject(values: PlainObject, order: readonly string[]): PlainObject {
    const index = new Map(order.map((key, i) => [key, i] as const))
    return Object.fromEntries(
        Object.entries(values)
            .filter(([, value]) => value !== undefined)
            .sort(
                ([a], [b]) =>
                    (index.get(a) ?? Number.POSITIVE_INFINITY) - (index.get(b) ?? Number.POSITIVE_INFINITY) ||
                    compareString(a, b)
            )
    )
}

function sortRecord(record: PlainObject): PlainObject {
    return Object.fromEntries(Object.entries(record).sort(([a], [b]) => compareString(a, b)))
}

function orderNode(node: PlainObject): PlainObject {
    const ordered: PlainObject = {}
    if (node[kdataNode] !== undefined) ordered[kdataNode] = node[kdataNode]
    for (const [verb, targets] of Object.entries(node).sort(([a], [b]) => compareString(a, b))) {
        if (verb === kdataNode) continue
        ordered[verb] = sortRecord(targets as PlainObject)
    }
    return ordered
}

function edgeId<Keys extends BaseKeys>(edge: Infograph<Keys>['edges'][number]): InfographEdgeId<Keys> {
    return `${edge.from} ${edge.verb} ${edge.to}` as InfographEdgeId<Keys>
}

function compareString(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0
}

function isPlainObject(value: unknown): value is PlainObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
