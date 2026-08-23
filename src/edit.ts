import { isDeepStrictEqual } from 'node:util'
import { formatInfographByEdges } from './input/format.js'
import { parseInfograph } from './input/index.js'
import { parseEdgeKey, unparseNodeKey } from './infograph.js'
import type { BaseKeys, Infograph } from './types.js'

type NodeField =
    'title' | 'summary' | 'claim' | 'date' | 'importance' | 'complexity' | 'technicality' | 'source' | 'tag'
type RecordValue = Record<string, unknown>
type EditableInput = {
    nodes: Record<string, { info: RecordValue }>
    edges: Record<string, unknown>
}

/** Raw human-writable values, validated by the normal Infograph parser after all edits apply. */
export type EditNodeInfo = Record<string, unknown>
export type EditEdgeInfo = Record<string, unknown>
export type EditClaim = Record<string, string>

export type AddNodeEdit = { 'add-node': { node: string; info: EditNodeInfo } }
export type SetNodeEdit = { 'set-node': { node: string; fields: Partial<Record<NodeField, unknown | null>> } }
export type AddClaimEdit = { 'add-claim': { node: string; claim: EditClaim } }
export type AddTagEdit = { 'add-tag': { node: string; tag: string } }
export type AddEdgeEdit = { 'add-edge': { from: string; verb: string; to: string; with: EditEdgeInfo } }
export type RemoveEdgeEdit = { 'remove-edge': { from: string; verb: string; to: string } }
export type RemoveNodeEdit = { 'remove-node': { node: string } }

export type InfographEdit =
    AddNodeEdit | SetNodeEdit | AddClaimEdit | AddTagEdit | AddEdgeEdit | RemoveEdgeEdit | RemoveNodeEdit

export type EditOperation =
    'add-node' | 'set-node' | 'add-claim' | 'add-tag' | 'add-edge' | 'remove-edge' | 'remove-node'

export type EditChange = {
    operation: EditOperation
    target: string
    status: 'applied' | 'noop'
    removedEdges?: number
}

export type ApplyEditsResult<Keys extends BaseKeys = BaseKeys> = {
    infograph: Infograph<Keys>
    changes: EditChange[]
    nodeCount: number
    edgeCount: number
}

/** Parse a constrained YAML/JSON edit operation list. Field values are validated against the final Infograph schema. */
export function parseEdits(data: unknown): InfographEdit[] {
    if (!Array.isArray(data)) throw new Error('Edit input must be a YAML or JSON list of operations')
    return data.map((value, index) => parseEdit(value, index))
}

/** Apply edits to a fresh canonical graph; the input graph is never mutated. */
export function applyEdits<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    edits: readonly InfographEdit[]
): ApplyEditsResult<Keys> {
    const input = formatInfographByEdges(infograph) as unknown as EditableInput
    const changes: EditChange[] = []

    for (const edit of edits) {
        if ('add-node' in edit) {
            const { node, info } = edit['add-node']
            if (input.nodes[node] !== undefined) throw new Error(`Node already exists: ${node}`)
            input.nodes[node] = { info: requireRecord(info, 'add-node.info') }
            changes.push(change('add-node', node))
            continue
        }
        if ('set-node' in edit) {
            const { node, fields } = edit['set-node']
            const info = nodeInfo(input, node)
            applyNodeFields(info, fields)
            changes.push(change('set-node', node))
            continue
        }
        if ('add-claim' in edit) {
            const { node, claim } = edit['add-claim']
            const info = nodeInfo(input, node)
            const claims = list(info.claim)
            const status = claims.some(existing => isDeepStrictEqual(existing, claim)) ? 'noop' : 'applied'
            if (status === 'applied') info.claim = [...claims, claim]
            changes.push(change('add-claim', node, status))
            continue
        }
        if ('add-tag' in edit) {
            const { node, tag } = edit['add-tag']
            const info = nodeInfo(input, node)
            const tags = list(info.tag)
            const status = tags.includes(tag) ? 'noop' : 'applied'
            if (status === 'applied') info.tag = [...tags, tag]
            changes.push(change('add-tag', node, status))
            continue
        }
        if ('add-edge' in edit) {
            const { from, verb, to, with: info } = edit['add-edge']
            nodeInfo(input, from)
            nodeInfo(input, to)
            const key = edgeKey(from, verb, to)
            const existing = input.edges[key]
            if (existing !== undefined && !isDeepStrictEqual(existing, info))
                throw new Error(`Conflicting edge already exists: ${key}`)
            const status = existing === undefined ? 'applied' : 'noop'
            if (status === 'applied') input.edges[key] = info
            changes.push(change('add-edge', key, status))
            continue
        }
        if ('remove-edge' in edit) {
            const { from, verb, to } = edit['remove-edge']
            const key = edgeKey(from, verb, to)
            if (input.edges[key] === undefined) throw new Error(`Edge does not exist: ${key}`)
            delete input.edges[key]
            changes.push(change('remove-edge', key))
            continue
        }

        const { node } = edit['remove-node']
        nodeInfo(input, node)
        delete input.nodes[node]
        let removedEdges = 0
        for (const key of Object.keys(input.edges)) {
            const edge = parseEdgeKey(key as never)
            const from = unparseNodeKey(edge.from)
            const to = unparseNodeKey(edge.to)
            if (from === node || to === node) {
                delete input.edges[key]
                removedEdges++
            }
        }
        changes.push({ ...change('remove-node', node), removedEdges })
    }

    const result = parseInfograph(input) as Infograph<Keys>
    return { infograph: result, changes, nodeCount: result.nodes.size, edgeCount: result.edges.length }
}

function parseEdit(value: unknown, index: number): InfographEdit {
    const record = requireRecord(value, `Operation ${index + 1}`)
    const entries = Object.entries(record)
    if (entries.length !== 1) throw new Error(`Operation ${index + 1} must contain exactly one operation key`)
    const [operation, raw] = entries[0]!
    const body = requireRecord(raw, `Operation ${index + 1}.${operation}`)
    if (operation === 'add-node') {
        requireKeys(body, ['node', 'info'], operation)
        return {
            'add-node': {
                node: stringValue(body.node, 'add-node.node'),
                info: requireRecord(body.info, 'add-node.info'),
            },
        }
    }
    if (operation === 'set-node') {
        requireKeys(body, ['node', 'fields'], operation)
        return {
            'set-node': {
                node: stringValue(body.node, 'set-node.node'),
                fields: requireRecord(body.fields, 'set-node.fields'),
            },
        }
    }
    if (operation === 'add-claim') {
        requireKeys(body, ['node', 'claim'], operation)
        return {
            'add-claim': {
                node: stringValue(body.node, 'add-claim.node'),
                claim: requireRecord(body.claim, 'add-claim.claim') as EditClaim,
            },
        }
    }
    if (operation === 'add-tag') {
        requireKeys(body, ['node', 'tag'], operation)
        return {
            'add-tag': { node: stringValue(body.node, 'add-tag.node'), tag: stringValue(body.tag, 'add-tag.tag') },
        }
    }
    if (operation === 'add-edge') {
        requireKeys(body, ['from', 'verb', 'to', 'with'], operation)
        return {
            'add-edge': {
                from: stringValue(body.from, 'add-edge.from'),
                verb: stringValue(body.verb, 'add-edge.verb'),
                to: stringValue(body.to, 'add-edge.to'),
                with: requireRecord(body.with, 'add-edge.with'),
            },
        }
    }
    if (operation === 'remove-edge') {
        requireKeys(body, ['from', 'verb', 'to'], operation)
        return {
            'remove-edge': {
                from: stringValue(body.from, 'remove-edge.from'),
                verb: stringValue(body.verb, 'remove-edge.verb'),
                to: stringValue(body.to, 'remove-edge.to'),
            },
        }
    }
    if (operation === 'remove-node') {
        requireKeys(body, ['node'], operation)
        return { 'remove-node': { node: stringValue(body.node, 'remove-node.node') } }
    }
    throw new Error(`Unknown edit operation: ${operation}`)
}

function applyNodeFields(info: RecordValue, fields: RecordValue) {
    const allowed = new Set<NodeField>([
        'title',
        'summary',
        'claim',
        'date',
        'importance',
        'complexity',
        'technicality',
        'source',
        'tag',
    ])
    if (Object.keys(fields).length === 0) throw new Error('set-node.fields must not be empty')
    for (const [field, value] of Object.entries(fields)) {
        if (!allowed.has(field as NodeField)) throw new Error(`set-node.fields has unknown field: ${field}`)
        if (value === null) {
            if (field === 'title' || field === 'complexity') throw new Error(`set-node.fields.${field} cannot be null`)
            delete info[field]
        } else if (
            (field === 'claim' || field === 'source' || field === 'tag') &&
            Array.isArray(value) &&
            value.length === 0
        ) {
            delete info[field]
        } else {
            info[field] = value
        }
    }
}

function nodeInfo(input: EditableInput, node: string): RecordValue {
    const value = input.nodes[node]?.info
    if (value === undefined) throw new Error(`Unknown node key: ${node}`)
    return value
}

function list(value: unknown): unknown[] {
    return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

function edgeKey(from: string, verb: string, to: string) {
    return `${from} ${verb} ${to}`
}

function change(operation: EditOperation, target: string, status: 'applied' | 'noop' = 'applied'): EditChange {
    return { operation, target, status }
}

function requireRecord(value: unknown, name: string): RecordValue {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new Error(`${name} must be an object`)
    return value as RecordValue
}

function stringValue(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`)
    return value
}

function requireKeys(record: RecordValue, keys: readonly string[], operation: string) {
    for (const key of Object.keys(record)) {
        if (!keys.includes(key)) throw new Error(`${operation} has unknown field: ${key}`)
    }
    for (const key of keys) {
        if (record[key] === undefined) throw new Error(`${operation} requires field: ${key}`)
    }
}
