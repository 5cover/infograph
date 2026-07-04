import { z } from 'zod'
import { SomeType } from 'zod/v4/core'
import {
    Complexity,
    BaseKeys,
    Importance,
    importance,
    InfographInfo,
    Period,
    Infograph,
    InfographNode,
    InfographNodeKey,
    InfographDomain,
} from './types'

const kdataEdge = 'with'
const kdataNode = 'info'

export const defineInfograph = <Keys extends BaseKeys>(infograph: InputInfograph<Keys>) => infograph

export type Flexarray<T> = T | T[]

export type InputEdgeInfo = {
    complexity?: Complexity
    fact?: Flexarray<string>
}

export type InputNodeInfo<Keys extends BaseKeys> = {
    title: string
    summary?: string
    fact?: Flexarray<string>
    period?: Period<string>
    importance?: Importance
    complexity?: Complexity
    source?: Flexarray<Keys['source']>
    tag?: Flexarray<string>
}

export type InputNodeRef = { [kdataEdge]?: InputEdgeInfo }

type R<K extends PropertyKey, V> = { [P in K]?: V }

export type InputNode<Keys extends BaseKeys> = { [kdataNode]: InputNodeInfo<Keys> } & InputOutgoing<Keys>

type InputEdgeId<Keys extends BaseKeys> = `${InfographNodeKey<Keys>} ${Keys['verb']} ${InfographNodeKey<Keys>}`

export type InputOutgoing<Keys extends BaseKeys> = {
    [P in Keys['verb']]?: R<InfographNodeKey<Keys>, null | InputNodeRef | (InputNodeRef & InputNode<Keys>)>
}

export type InputInfograph<Keys extends BaseKeys> = {
    info?: InfographInfo
    domain: InfographDomain<Keys>
    nodes: R<InfographNodeKey<Keys>, InputNode<Keys>>
    edges?: R<InputEdgeId<Keys>, InputEdgeInfo>
}

const zKindKey = z.string().regex(/^[-_a-z]+$/)
const zNodeId = zKindKey
const zNodeKey = z.templateLiteral([zKindKey, ' ', zNodeId])
const verbPattern = new RegExp(`^(?!${RegExp.escape(kdataEdge)}$|${RegExp.escape(kdataNode)}$)[-_a-z]+$`)
const zVerbKey = z.string().regex(verbPattern)
const zSourceKey = z.string()

const zEdgeId = z.templateLiteral([zNodeKey, ' ', zVerbKey, ' ', zNodeKey])

const zComplexity: z.ZodType<Complexity> = z.union([
    z.literal('simple').describe('easy to mention'),
    z.literal('contained').describe('needs explanation, but self-containd'),
    z.literal('contextual').describe('needs context'),
    z.literal('intertwined').describe('needs deep context or demonstration'),
])

const zPlainKeyword = z.null().or(
    z.object({
        desc: z.string().optional(),
    }),
)

const zFlexarray = <T extends SomeType>(item: T) => z.union([item, z.array(item)])

const zNode = z.looseObject({
    [kdataNode]: z.object({
        title: z
            .string()
            .describe(
                'Short human label for the node. Makes the graph readable and editable by hand. This is not final artifact wording.',
            ),
        summary: z
            .string()
            .optional()
            .describe(
                'Compact factual description of the node. Gives enough context to understand the node without following every edge. It should remain factual, not rhetorical.',
            ),
        fact: zFlexarray(z.string())
            .optional()
            .describe(
                'Atomic factual claims attached to the node. Keeps facts separated from wording. The same statements can later support slides, reports or oral explanations.',
            ),
        period: z
            // normally, dates would be parsed here, but the transforms breaks with looseRecord passing values as-is
            .object({
                from: z.string(),
                to: z.string(),
            })
            .optional()
            .describe(
                'Approximate time range during which this node matters. Allows timeline-oriented queries without forcing every fact into prose. Approximate periods are acceptable for manual writing.',
            ),
        importance: z
            .enum(importance)
            .optional()
            .describe(
                'Importance of this node in the real experience. Not correlated to complexity or size. Left missing when unknown.',
            ),
        complexity: zComplexity.optional().describe('Estimated explanation cost of this node.'),
        source: zFlexarray(zSourceKey).optional().describe('Where the information comes from.'),
        tag: zFlexarray(z.string())
            .optional()
            .describe(
                'Lightweight labels. Supports simple search and grouping without adding many specialized fields.',
            ),
    }),
})

const zEdge = z.object({
    complexity: zComplexity.optional(),
    fact: zFlexarray(z.string())
        .optional()
        .describe('Some relationships are harder to explain than the things they connect.'),
})

const zNodeRef = z.looseObject({
    [kdataEdge]: zEdge.optional().describe('Edge information.'),
})
const zOutgoing: z.ZodType<InputOutgoing<BaseKeys>> = z.looseRecord(
    zVerbKey,
    z
        .record(zNodeKey, z.union([z.null(), zNodeRef, zNodeRef.and(zNode).and(z.lazy(() => zOutgoing))]))
        .describe('Outgoing edges.'),
)

const zInfographInput: z.ZodType<InputInfograph<BaseKeys>> = z.object({
    info: z
        .object({
            title: z.string().describe('Human-readable name for the whole graph.'),
            context: z
                .string()
                .describe(
                    'Short description of the real-world context represented by the graph. Gives global orientation without repeating the same context in every node.',
                ),
            author: z
                .string()
                .describe(
                    'Person responsible for validating the graph. This graph is not just extracted text. It is a validated representation. The author field makes that explicit.',
                ),
        })
        .describe('Infograph metadata.')
        .optional(),
    domain: z
        .object({
            kind: z.record(zKindKey, zPlainKeyword).describe('Allowed node kinds.'),
            verb: z
                .record(zVerbKey, zPlainKeyword)
                .describe(
                    'What kinds of relationships exists. A verb may leave unanswered questions about the nature of the relationship, but not about the identity of additional participants.',
                ),
            source: z
                .record(zSourceKey, zPlainKeyword)
                .describe(
                    "Available materialized sources to verify the node's claims. Memory is not a source, it is a private buffer.",
                ),
        })
        .describe("Definitions of the infograph's vocabulary."),
    nodes: z.record(zNodeKey, zNode.and(zOutgoing)).describe('Nodes of the graph. Keyed by node kind.'),
    edges: z.record(zEdgeId, zEdge).optional().describe("Use for edges that don't belong to any particular node."),
})

const zInfograph = zInfographInput.pipe(
    z.transform((g, ctx): Infograph<BaseKeys> => {
        // verify .edges match "{nodesrc} {verb} {nodedest}"" and nodesrc/nodede
        // verify .nodes.{kind}

        const path: string[] = []

        const walkEntry = <T, K extends string & keyof T, R>(o: T, k: K, body: (value: T[K]) => R): R => {
            path.push(k)
            const r = body(o[k])
            path.pop()
            return r
        }

        const verifyDate = (input: string): Date => {
            const d = new Date(input)
            if (Number.isNaN(d.valueOf()))
                ctx.issues.push({
                    code: 'custom',
                    input,
                    path: [...path],
                    message: `Invalid date: '${input}'`,
                })
            return d
        }

        const verifyKeyset =
            <K extends string = string>(thing: string, has: (key: K) => boolean) =>
            (key: K) => {
                if (has(key)) return
                ctx.issues.push({
                    code: 'custom',
                    input: key,
                    path: [...path],
                    message: `Undefined ${thing}: '${key}'`,
                })
            }
        const verifyKind = verifyKeyset('kind', k => k in g.domain.kind)
        const verifyVerb = verifyKeyset('verb', k => k in g.domain.verb)
        const verifyNode = verifyKeyset<InfographNodeKey<BaseKeys>>('node', k => infograph.nodes.has(k))
        type DeferredEntry<K extends string> = [f: (key: K) => void, key: K]
        const deferredChecks: DeferredEntry<any>[] = []
        const defer = <K extends string>(...r: DeferredEntry<K>) => {
            deferredChecks.push(r)
        }

        const infographEdges = walkEntry(g, 'edges', edges =>
            edges ?
                entries(edges)
                    .map(([key, edge]) => {
                        const [fromkind, fromid, verb, tokind, toid] = key.split(' ', 5)
                        verifyVerb(verb)
                        const from = nodeKey(fromkind, fromid)
                        const to = nodeKey(tokind, toid)
                        defer(verifyNode, from)
                        defer(verifyNode, to)
                        return {
                            from: nodeKey(fromkind, from),
                            verb,
                            to: nodeKey(tokind, to),
                            [kdataNode]: { complexity: edge.complexity, fact: deflex(edge.fact) },
                        }
                    })
                    .toArray()
            :   [],
        )

        const infograph: Infograph<BaseKeys> = {
            info: g.info,
            domain: g.domain,
            edges: infographEdges,
            nodes: new Map(
                walkEntry(g, 'nodes', nodes => entries(nodes).flatMap(([key, node]) => parseNode(key, node, []))),
            ),
        }

        for (const [c, k] of deferredChecks) {
            c(k)
        }

        return infograph

        function* parseNode(
            originalKey: string,
            node: InputNode<BaseKeys>,
            parents: { kind: string; id: string; title: string }[],
        ): Generator<[k: InfographNodeKey<BaseKeys>, v: InfographNode<BaseKeys>]> {
            const [kind, id] = originalKey.split(' ', 2)
            const key = nodeKey(kind, [id, ...parents.map(p => nodeKey(p.kind, p.id)).reverse()].join(' < '))
            verifyKind(kind)
            const d = node[kdataNode]
            parents.push({ kind, id, title: d.title })
            yield [
                key,
                {
                    ...d,
                    title: parents.map(p => p.title).join(' '),
                    fact: deflex(d.fact),
                    source: deflex(d.source),
                    tag: deflex(d.tag),
                    period:
                        d.period ?
                            {
                                from: verifyDate(d.period.from),
                                to: verifyDate(d.period.to),
                            }
                        :   undefined,
                },
            ] as const
            yield* entries(node).flatMap(([verb, value]) => {
                if (!verbPattern.test(verb)) return []
                verifyVerb(verb)
                if (!value) return []
                const nodes = value as Exclude<InputOutgoing<BaseKeys>[string], undefined>
                return entries(nodes).flatMap(([inkey_, node]) => {
                    const inkey = inkey_ as InfographNodeKey<BaseKeys>
                    if (node && kdataNode in node) return parseNode(inkey_, node, parents)
                    else defer(verifyNode, inkey)
                    infographEdges.push({
                        verb,
                        from: key,
                        to: inkey as InfographNodeKey<BaseKeys>,
                        info: {
                            complexity: node?.[kdataEdge]?.complexity,
                            fact: deflex(node?.[kdataEdge]?.fact),
                        },
                    })
                    return []
                })
            })
            parents.pop()
        }
        function* entries<V>(o: { [k: string]: V }) {
            for (const [k, v] of Object.entries(o)) {
                if (v === undefined) continue
                path.push(k)
                yield [k, v] as const
                path.pop()
            }
        }
    }),
)

export const parseInfograph = (data: unknown) => zInfograph.parse(data)

export const getSchema = () =>
    zInfographInput.toJSONSchema({
        target: 'draft-07',
        reused: 'ref',
    })

function deflex(fa: Flexarray<string> | undefined) {
    return typeof fa === 'string' ? [fa] : fa
}

function nodeKey(kind: string, id: string) {
    return `${kind} ${id}` as const
}
