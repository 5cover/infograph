import { z } from 'zod'
import { SomeType } from 'zod/v4/core'
import { Complexity, BaseDomain, Importance, importance, InfographMeta, Period, Infograph } from './types'

export const defineInfograph = <NodeKey extends string, Domain extends BaseDomain>(
    infograph: InputInfograph<NodeKey, Domain>
) => infograph

export type Flexarray<T> = T | T[]

export type InputEdgeInfo = {
    complexity?: Complexity
    fact?: Flexarray<string>
}

export type InputNodeInfo<Domain extends BaseDomain> = {
    title: string
    summary?: string
    fact?: Flexarray<string>
    period?: Period
    importance?: Importance
    complexity?: Complexity
    source?: Flexarray<keyof Domain['source']>
    tag?: Flexarray<string>
}

export type InputNodeRef = {
    with?: InputEdgeInfo
}

export type InputNode<NodeKey extends string, Domain extends BaseDomain> = {
    info: InputNodeInfo<Domain>
} & InputOutgoing<NodeKey, Domain>

export type InputOutgoing<NodeKey extends string, Domain extends BaseDomain> = {
    [P in keyof Domain['verb']]?: {
        [P in keyof Domain['kind']]?: {
            [P in NodeKey]: InputNodeRef | (InputNodeRef & InputNode<NodeKey, Domain>)
        }
    }
}

export type InputInfograph<NodeKey extends string, Domain extends BaseDomain> = keyof Domain['verb'] extends string
    ? {
          meta?: InfographMeta
          domain: Domain
          nodes: Record<keyof Domain['kind'], Record<string, InputNode<NodeKey, Domain>>>
          edges?: Record<`${NodeKey} ${keyof Domain['verb']} ${NodeKey}`, InputEdgeInfo>
      }
    : never

const keyEdgeData = 'with'
const keyNodeData = 'info'

const zKindKey = z.string().regex(/^[-_a-z]+$/)
const zNodeKey = zKindKey
const zVerbKey = zKindKey.refine(s => s !== keyEdgeData && s !== keyNodeData)
const zSourceKey = z.string()

const zEdgeKey = z.templateLiteral([zNodeKey, ' ', zVerbKey, ' ', zNodeKey])

const zComplexity: z.ZodType<Complexity> = z.union([
    z.literal('simple').describe('easy to mention'),
    z.literal('contained').describe('needs explanation, but self-containd'),
    z.literal('contextual').describe('needs context'),
    z.literal('intertwined').describe('needs deep context or demonstration'),
])

const zPlainKeyword = z.null().or(
    z.object({
        desc: z.string().optional(),
    })
)

const zFlexarray = <T extends SomeType>(item: T) => z.union([item, z.array(item)])

const zNode = z.object({
    [keyNodeData]: z.object({
        title: z
            .string()
            .describe(
                'Short human label for the node. Makes the graph readable and editable by hand. This is not final artifact wording.'
            ),
        summary: z
            .string()
            .optional()
            .describe(
                'Compact factual description of the node. Gives enough context to understand the node without following every edge. It should remain factual, not rhetorical.'
            ),
        fact: zFlexarray(z.string())
            .optional()
            .describe(
                'Atomic factual claims attached to the node. Keeps facts separated from wording. The same statements can later support slides, reports or oral explanations.'
            ),
        period: z
            .object({
                from: z.iso.date().transform(d => new Date(d)),
                to: z.iso.date().transform(d => new Date(d)),
            })
            .optional()
            .describe(
                'Approximate time range during which this node matters. Allows timeline-oriented queries without forcing every fact into prose. Approximate periods are acceptable for manual writing.'
            ),
        importance: z
            .enum(importance)
            .optional()
            .describe(
                'Importance of this node in the real experience. Not correlated to complexity or size. Left missing when unknown.'
            ),
        complexity: zComplexity.optional().describe('Estimated explanation cost of this node.'),
        source: zFlexarray(zSourceKey).optional().describe('Where the information comes from.'),
        tag: zFlexarray(z.string())
            .optional()
            .describe(
                'Lightweight labels. Supports simple search and grouping without adding many specialized fields.'
            ),
    }),
})

const zEdge = z.object({
    complexity: zComplexity.optional(),
    fact: zFlexarray(z.string())
        .optional()
        .describe('Some relationships are harder to explain than the things they connect.'),
})

const zNodeRef = z.object({
    [keyEdgeData]: zEdge.optional().describe('Edge information.'),
})
const zOutgoing: z.ZodType<InputOutgoing<string, BaseDomain>> = z.record(
    zVerbKey,
    z.record(
        zKindKey,
        z.record(zNodeKey, zNodeRef.or(zNodeRef.and(zNode).and(z.lazy(() => zOutgoing)))).describe('Outgoing edges.')
    )
)

const zInfographInput: z.ZodType<InputInfograph<string, BaseDomain>> = z.object({
    meta: z
        .object({
            title: z.string().describe('Human-readable name for the whole graph.'),
            context: z
                .string()
                .describe(
                    'Short description of the real-world context represented by the graph. Gives global orientation without repeating the same context in every node.'
                ),
            author: z
                .string()
                .describe(
                    'Person responsible for validating the graph. This graph is not just extracted text. It is a validated representation. The author field makes that explicit.'
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
                    'What kinds of relationships exists. A verb may leave unanswered questions about the nature of the relationship, but not about the identity of additional participants.'
                ),
            source: z
                .record(zSourceKey, zPlainKeyword)
                .describe(
                    "Available materialized sources to verify the node's claims. Memory is not a source, it is a private buffer."
                ),
        })
        .describe("Definitions of the infograph's vocabulary."),
    nodes: z
        .record(zKindKey, z.record(zNodeKey, zNode.and(zOutgoing)))
        .describe('Nodes of the graph. Keyed by node kind.'),
    edges: z.record(zEdgeKey, zEdge).optional().describe("Use for edges that don't belong to any particular node."),
})

const zInfograph = zInfographInput.pipe(
    z.transform((g, ctx): Infograph<string, BaseDomain> => {
        // verify .edges match "{nodesrc} {verb} {nodedest}"" and nodesrc/nodede
        // verify .nodes.{kind}

        const verifyKeyset = (has: (key: string) => boolean) => (path: readonly PropertyKey[], key: string) => {
            if (key in keys) return
            ctx.issues.push({
                code: 'custom',
                input: key,
                path: [...path],
                message: `Undefined kind: '${key}'`,
            })
        }
        const verifyKind = verifyKeyset(k => k in g.domain.kind)
        const verifyVerb = verifyKeyset(k => k in g.domain.verb)
        const nodes: Infograph<string, BaseDomain>['nodes'] = new Map()
        const verifyNodeKey_ = verifyKeyset(k => nodes.has(k))
        const deferredChecks: (() => void)[] = []
        const verifyNodeKey = (...args: Parameters<ReturnType<typeof verifyKeyset>>) => verifyNodeKey_(...args)

        Object.entries(g.nodes).flatMap(([kind, nodes]) =>
            Object.entries(nodes).flatMap(([key, node]) => {
                return [key, { kind, info: node.info }]
            })
        )

        return {
            domain: g.domain,
            meta: g.meta,
            edges: g.edges
                ? Object.entries(g.edges).map(([k, v]) => {
                      const verb = k.split(' ', 3)
                  })
                : undefined,
        }
    })
)

function flattenNode(n: InputNode<string, BaseDomain>) {}
