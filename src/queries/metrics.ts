import {
    complexity as complexityLevels,
    importance as importanceLevels,
    type BaseKeys,
    type Infograph,
    type InfographNode,
    type InfographNodeKey,
} from '../types'

export type Stats = {
    min: number
    average: number
    max: number
}

export type FieldCoverage = {
    count: number
    ratio: number
}

export type ComponentStats = {
    count: number
    largestSize: number
}

export type Metrics = {
    nodeCount: number
    edgeCount: number
    density: number
    nodesByKind: Record<string, number>
    edgesByVerb: Record<string, number>
    nodesByImportance: Record<string, number>
    nodesByComplexity: Record<string, number>
    edgesByComplexity: Record<string, number>
    incidence: Stats
    inDegree: Stats
    outDegree: Stats
    sourceCount: number
    sinkCount: number
    isolatedNodeCount: number
    selfLoopCount: number
    components: ComponentStats
    fieldCoverage: Record<string, FieldCoverage>
}

const coverageFields = ['summary', 'fact', 'date', 'importance', 'complexity', 'source', 'tag'] as const

export function metrics<Keys extends BaseKeys>(infograph: Infograph<Keys>): Metrics {
    const nodeKeys = [...infograph.nodes.keys()]
    const nodes = [...infograph.nodes.values()]
    const nodeCount = nodeKeys.length

    const inDegree = new Map<InfographNodeKey<Keys>, number>(nodeKeys.map(key => [key, 0]))
    const outDegree = new Map<InfographNodeKey<Keys>, number>(nodeKeys.map(key => [key, 0]))
    let selfLoopCount = 0
    for (const edge of infograph.edges) {
        bump(outDegree, edge.from)
        bump(inDegree, edge.to)
        if (edge.from === edge.to) selfLoopCount++
    }

    const inValues = [...inDegree.values()]
    const outValues = [...outDegree.values()]
    const totalValues = nodeKeys.map(key => (inDegree.get(key) ?? 0) + (outDegree.get(key) ?? 0))

    return {
        nodeCount,
        edgeCount: infograph.edges.length,
        density: density(nodeCount, infograph.edges.length),
        nodesByKind: tally(nodeKeys.map(nodeKind)),
        edgesByVerb: tally(infograph.edges.map(edge => edge.verb)),
        nodesByImportance: tallyLevels(
            importanceLevels,
            nodes.map(node => node.importance?.is),
        ),
        nodesByComplexity: tallyLevels(
            complexityLevels,
            nodes.map(node => node.complexity?.is),
        ),
        edgesByComplexity: tallyLevels(
            complexityLevels,
            infograph.edges.map(edge => edge.info.complexity?.is),
        ),
        incidence: stats(totalValues),
        inDegree: stats(inValues),
        outDegree: stats(outValues),
        sourceCount: inValues.filter(degree => degree === 0).length,
        sinkCount: outValues.filter(degree => degree === 0).length,
        isolatedNodeCount: totalValues.filter(degree => degree === 0).length,
        selfLoopCount,
        components: components(nodeKeys, infograph.edges),
        fieldCoverage: fieldCoverage(nodes, nodeCount),
    }
}

function nodeKind<Keys extends BaseKeys>(key: InfographNodeKey<Keys>): string {
    return key.split(' ', 1)[0]
}

function bump<K>(counts: Map<K, number>, key: K) {
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1)
}

function tally(values: string[]): Record<string, number> {
    const counts = new Map<string, number>()
    for (const value of values) {
        counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)))
}

// Buckets over a fixed set of levels, so every level appears (including zero
// counts) in a stable order, with a trailing `missing` bucket for absent values.
function tallyLevels<K extends string>(levels: readonly K[], values: (K | undefined)[]): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const level of levels) counts[level] = 0
    counts.missing = 0
    for (const value of values) counts[value ?? 'missing']++
    return counts
}

function density(nodeCount: number, edgeCount: number): number {
    if (nodeCount < 2) return 0
    return round(edgeCount / (nodeCount * (nodeCount - 1)))
}

function fieldCoverage<Keys extends BaseKeys>(
    nodes: InfographNode<Keys>[],
    nodeCount: number,
): Record<string, FieldCoverage> {
    return Object.fromEntries(
        coverageFields.map(field => {
            const count = nodes.filter(node => node[field] !== undefined).length
            return [field, { count, ratio: nodeCount === 0 ? 0 : round(count / nodeCount) }]
        }),
    )
}

// Weakly connected components: edges are treated as undirected via union-find.
function components<Keys extends BaseKeys>(
    nodeKeys: InfographNodeKey<Keys>[],
    edges: Infograph<Keys>['edges'],
): ComponentStats {
    const parent = new Map<InfographNodeKey<Keys>, InfographNodeKey<Keys>>(nodeKeys.map(key => [key, key]))

    const find = (key: InfographNodeKey<Keys>): InfographNodeKey<Keys> => {
        let root = key
        while (parent.get(root) !== root) root = parent.get(root)!
        while (parent.get(key) !== root) {
            const next = parent.get(key)!
            parent.set(key, root)
            key = next
        }
        return root
    }

    for (const edge of edges) {
        if (!parent.has(edge.from) || !parent.has(edge.to)) continue
        parent.set(find(edge.from), find(edge.to))
    }

    const sizes = new Map<InfographNodeKey<Keys>, number>()
    for (const key of nodeKeys) {
        const root = find(key)
        sizes.set(root, (sizes.get(root) ?? 0) + 1)
    }

    return {
        count: sizes.size,
        largestSize: sizes.size === 0 ? 0 : Math.max(...sizes.values()),
    }
}

function stats(values: number[]): Stats {
    if (values.length === 0) {
        return { min: 0, average: 0, max: 0 }
    }
    const sum = values.reduce((total, value) => total + value, 0)
    return {
        min: Math.min(...values),
        average: round(sum / values.length),
        max: Math.max(...values),
    }
}

function round(value: number): number {
    return Math.round(value * 100) / 100
}
