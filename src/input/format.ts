import * as YAML from 'yaml'
import type {
    BaseKeys,
    Claim,
    Infograph,
    InfographDate,
    InfographEdgeId,
    InfographNode,
    InfographNodeKey,
    InfographReason,
} from '../types.js'
import { terseDate } from '../terseDate.js'
import { kdataEdge, kdataNode } from './types.js'

type PlainObject = Record<string, unknown>

export function formatInfograph<Keys extends BaseKeys>(infograph: Infograph<Keys>): PlainObject {
    const nodes: PlainObject = {}

    for (const [key, node] of infograph.nodes) {
        nodes[key] = { [kdataNode]: formatNode(node) }
    }

    const seenEdges = new Set<InfographEdgeId<Keys>>()
    for (const edge of infograph.edges) {
        const id = `${edge.from} ${edge.verb} ${edge.to}` as InfographEdgeId<Keys>
        if (seenEdges.has(id)) throw new Error(`Duplicate edge cannot be formatted: ${id}`)
        seenEdges.add(id)

        const source = nodes[edge.from] as PlainObject | undefined
        if (source === undefined) throw new Error(`Cannot format edge from unknown node: ${id}`)

        const byVerb = ensureObject(source, edge.verb)
        byVerb[edge.to] = { [kdataEdge]: formatEdge(edge.info) }
    }

    return omitUndefined({
        info: infograph.info,
        domain: infograph.domain,
        nodes,
    })
}

export function formatInfographYaml<Keys extends BaseKeys>(infograph: Infograph<Keys>): string {
    return new YAML.Document(formatInfograph(infograph), null, { aliasDuplicateObjects: false }).toString({
        nullStr: '',
        lineWidth: 0,
        singleQuote: true,
    })
}

function formatNode<Keys extends BaseKeys>(node: InfographNode<Keys>): PlainObject {
    return omitUndefined({
        title: node.title,
        summary: node.summary,
        claim: formatClaims(node.claim),
        date: formatDate(node.date),
        importance: formatReason(node.importance),
        complexity: formatReason(node.complexity),
        technicality: formatReason(node.technicality),
        source: flex(node.source?.map(formatReason)),
        tag: flex(node.tag),
    })
}

function formatEdge<Keys extends BaseKeys>(edge: Infograph<Keys>['edges'][number]['info']): PlainObject {
    return omitUndefined({
        complexity: formatReason(edge.complexity),
        technicality: formatReason(edge.technicality),
        claim: formatClaims(edge.claim),
    })
}

function formatClaims(claims: Claim[] | undefined): PlainObject[] | undefined {
    return claims?.map(claim => ({ [claim.type]: claim.content }))
}

function formatReason<T>(reason: InfographReason<T> | undefined): PlainObject | undefined {
    if (reason === undefined) return undefined
    return { is: reason.is, why: flex(reason.why) }
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

function omitUndefined(values: PlainObject): PlainObject {
    return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined))
}

function isPlainObject(value: unknown): value is PlainObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
