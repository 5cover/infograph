import {
    complexity,
    importance,
    technicality,
    type BaseKeys,
    type Complexity,
    type Importance,
    type Infograph,
    type InfographDate,
    type InfographEdge,
    type InfographNode,
    type InfographNodeKey,
    type Technicality,
} from '../types.js'

export type ComparisonOperator = '=' | '!=' | '<' | '<=' | '>' | '>='

export type LevelComparison<T extends string> = {
    operator: ComparisonOperator
    value: T
}

export type DateRange = Partial<InfographDate>
export type TextField = 'title' | 'summary' | 'claim'
export type TextMatch = { field: TextField; value: string }

/** Declarative predicates shared by CLI selection and API callers. */
export type NodePredicate<Keys extends BaseKeys = BaseKeys> = {
    key?: readonly InfographNodeKey<Keys>[]
    kind?: readonly Keys['kind'][]
    tag?: readonly string[]
    source?: readonly Keys['source'][]
    importance?: LevelComparison<Importance>
    complexity?: LevelComparison<Complexity>
    technicality?: LevelComparison<Technicality>
    date?: DateRange
    match?: readonly TextMatch[]
}

export type EdgePredicate<Keys extends BaseKeys = BaseKeys> = {
    from?: readonly InfographNodeKey<Keys>[]
    to?: readonly InfographNodeKey<Keys>[]
    verb?: readonly Keys['verb'][]
    complexity?: LevelComparison<Complexity>
    technicality?: LevelComparison<Technicality>
    match?: readonly Pick<TextMatch, 'value'>[]
}

export type SelectQuery<Keys extends BaseKeys = BaseKeys> =
    { target: 'nodes'; where?: NodePredicate<Keys> } | { target: 'edges'; where?: EdgePredicate<Keys> }

export type NodeSelection<Keys extends BaseKeys = BaseKeys> = {
    target: 'nodes'
    nodes: { key: InfographNodeKey<Keys>; node: InfographNode<Keys> }[]
}

export type EdgeSelection<Keys extends BaseKeys = BaseKeys> = {
    target: 'edges'
    edges: InfographEdge<Keys>[]
}

export type SelectionResult<Keys extends BaseKeys = BaseKeys> = NodeSelection<Keys> | EdgeSelection<Keys>

export type TraverseQuery<Keys extends BaseKeys = BaseKeys> = {
    from: readonly InfographNodeKey<Keys>[]
    direction?: 'in' | 'out' | 'both'
    /** Maximum number of edges from a root. Must be a positive integer. */
    maxHops?: number
    node?: NodePredicate<Keys>
    edge?: EdgePredicate<Keys>
}

export type TraversalResult<Keys extends BaseKeys = BaseKeys> = {
    roots: InfographNodeKey<Keys>[]
    nodes: { key: InfographNodeKey<Keys>; node: InfographNode<Keys>; depth: number }[]
    edges: InfographEdge<Keys>[]
    /** Reached nodes at the configured depth limit. */
    frontier: InfographNodeKey<Keys>[]
}

export function select<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    query: SelectQuery<Keys>
): SelectionResult<Keys> {
    if (query.target === 'nodes') {
        return {
            target: 'nodes',
            nodes: [...infograph.nodes.entries()]
                .filter(([key, node]) => matchesNode(key, node, query.where))
                .map(([key, node]) => ({ key, node })),
        }
    }
    return { target: 'edges', edges: infograph.edges.filter(edge => matchesEdge(edge, query.where)) }
}

/** Breadth-first traversal with deterministic canonical edge and node order. */
export function traverse<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    query: TraverseQuery<Keys>
): TraversalResult<Keys> {
    const maxHops = query.maxHops ?? 1
    if (!Number.isInteger(maxHops) || maxHops < 1) throw new RangeError('maxHops must be a positive integer')
    if (query.from.length === 0) throw new RangeError('from must contain at least one node key')

    const roots = unique(query.from)
    for (const key of roots) if (!infograph.nodes.has(key)) throw new RangeError(`Unknown node key: ${key}`)

    const direction = query.direction ?? 'out'
    const depth = new Map<InfographNodeKey<Keys>, number>(roots.map(key => [key, 0]))
    const queue = [...roots]
    const edges: InfographEdge<Keys>[] = []
    const seenEdges = new Set<InfographEdge<Keys>>()

    for (let index = 0; index < queue.length; index++) {
        const current = queue[index]!
        const currentDepth = depth.get(current)!
        if (currentDepth === maxHops) continue
        for (const edge of infograph.edges) {
            const next = adjacent(edge, current, direction)
            if (next === undefined || !matchesEdge(edge, query.edge)) continue
            const node = infograph.nodes.get(next)!
            if (!matchesNode(next, node, query.node)) continue
            if (!seenEdges.has(edge)) {
                seenEdges.add(edge)
                edges.push(edge)
            }
            if (!depth.has(next)) {
                depth.set(next, currentDepth + 1)
                queue.push(next)
            }
        }
    }

    return {
        roots,
        nodes: queue.map(key => ({ key, node: infograph.nodes.get(key)!, depth: depth.get(key)! })),
        edges,
        frontier: queue.filter(key => depth.get(key) === maxHops),
    }
}

function adjacent<Keys extends BaseKeys>(
    edge: InfographEdge<Keys>,
    current: InfographNodeKey<Keys>,
    direction: 'in' | 'out' | 'both'
): InfographNodeKey<Keys> | undefined {
    if ((direction === 'out' || direction === 'both') && edge.from === current) return edge.to
    if ((direction === 'in' || direction === 'both') && edge.to === current) return edge.from
    return undefined
}

function matchesNode<Keys extends BaseKeys>(
    key: InfographNodeKey<Keys>,
    node: InfographNode<Keys>,
    predicate: NodePredicate<Keys> | undefined
): boolean {
    if (predicate === undefined) return true
    if (predicate.key !== undefined && predicate.key.length > 0 && !predicate.key.includes(key)) return false
    if (
        predicate.kind !== undefined &&
        predicate.kind.length > 0 &&
        !predicate.kind.includes(nodeKind(key) as Keys['kind'])
    )
        return false
    if (predicate.tag !== undefined && predicate.tag.length > 0 && !predicate.tag.some(tag => node.tag?.includes(tag)))
        return false
    if (
        predicate.source !== undefined &&
        predicate.source.length > 0 &&
        !predicate.source.some(source => node.source?.some(reason => reason.is === source))
    )
        return false
    if (!matchesLevel(node.importance?.is, predicate.importance, importance)) return false
    if (!matchesLevel(node.complexity.is, predicate.complexity, complexity)) return false
    if (!matchesLevel(node.technicality?.is, predicate.technicality, technicality)) return false
    if (!matchesDate(node.date, predicate.date)) return false
    return predicate.match?.every(match => matchesText(node, match)) ?? true
}

function matchesEdge<Keys extends BaseKeys>(
    edge: InfographEdge<Keys>,
    predicate: EdgePredicate<Keys> | undefined
): boolean {
    if (predicate === undefined) return true
    if (predicate.from !== undefined && predicate.from.length > 0 && !predicate.from.includes(edge.from)) return false
    if (predicate.to !== undefined && predicate.to.length > 0 && !predicate.to.includes(edge.to)) return false
    if (predicate.verb !== undefined && predicate.verb.length > 0 && !predicate.verb.includes(edge.verb)) return false
    if (!matchesLevel(edge.info.complexity.is, predicate.complexity, complexity)) return false
    if (!matchesLevel(edge.info.technicality?.is, predicate.technicality, technicality)) return false
    return (
        predicate.match?.every(match =>
            contains(edge.info.claim?.map(claim => claim.content).join('\n'), match.value)
        ) ?? true
    )
}

function matchesText(node: InfographNode, match: TextMatch): boolean {
    if (match.field === 'title') return contains(node.title, match.value)
    if (match.field === 'summary') return contains(node.summary, match.value)
    return contains(node.claim?.map(claim => claim.content).join('\n'), match.value)
}

function contains(value: string | undefined, needle: string): boolean {
    return value?.toLocaleLowerCase().includes(needle.toLocaleLowerCase()) ?? false
}

function matchesDate(date: InfographDate | undefined, range: DateRange | undefined): boolean {
    if (range === undefined) return true
    if (date === undefined) return false
    return (range.from === undefined || date.to >= range.from) && (range.to === undefined || date.from <= range.to)
}

function matchesLevel<T extends string>(
    value: T | undefined,
    comparison: LevelComparison<T> | undefined,
    levels: readonly T[]
): boolean {
    if (comparison === undefined) return true
    if (!levels.includes(comparison.value)) throw new RangeError(`Unknown comparison level: ${comparison.value}`)
    if (value === undefined) return comparison.operator === '!='
    const delta = levels.indexOf(value) - levels.indexOf(comparison.value)
    if (comparison.operator === '=') return delta === 0
    if (comparison.operator === '!=') return delta !== 0
    if (comparison.operator === '<') return delta < 0
    if (comparison.operator === '<=') return delta <= 0
    if (comparison.operator === '>') return delta > 0
    return delta >= 0
}

function nodeKind(key: string): string {
    return key.split(' ', 1)[0]!
}

function unique<T>(values: readonly T[]): T[] {
    return [...new Set(values)]
}
