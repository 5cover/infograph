import z from 'zod'
import type { SomeType } from 'zod/v4/core'
import { type Complexity, importance, type BaseKeys } from '../types'
import { kdataEdge, kdataNode, type InputOutgoing, type InputInfograph } from './types'

const zKindKey = z.string().regex(/^[-_a-z]+$/)
const zNodeId = zKindKey
const zNodeKey = z.templateLiteral([zKindKey, ' ', zNodeId])
export const verbPattern = new RegExp(`^(?!${RegExp.escape(kdataEdge)}$|${RegExp.escape(kdataNode)}$)[-_a-z]+$`)
const zVerbKey = z.string().regex(verbPattern)
const zSourceKey = z.string()

const zEdgeId = z.templateLiteral([zNodeKey, ' ', zVerbKey, ' ', zNodeKey])

const zComplexity: z.ZodType<Complexity> = z.union([
    z.literal('simple').describe('easy to mention'),
    z.literal('natural').describe('needs explanation, but self-contained and natural to explain'),
    z.literal('contextual').describe('needs context from other nodes not in the relation'),
    z.literal('intertwined').describe('needs deep context or demonstration'),
])

const zPlainKeyword = z.null().or(
    z.object({
        desc: z.string().optional(),
    }),
)

const zFlexarray = <T extends SomeType>(item: T) => z.union([item, z.array(item)])

const zClaim = <T extends z.ZodType<string>>(is: T) =>
    z.object({
        is: is.describe('Selected value.'),
        why: zFlexarray(z.string()).describe(
            'Justification for selecting this value. Why choose this value and not another. Retraces author intent.',
        ),
    })

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
        date: z
            // normally, dates would be parsed here, but the transforms breaks with looseRecord passing values as-is
            .object({
                from: z.string(),
                to: z.string(),
            })
            .or(z.string())
            .optional()
            .describe(
                'Approximate time range during which this node matters. Allows timeline-oriented queries without forcing every fact into prose. Approximate periods are acceptable for manual writing.',
            ),
        importance: zClaim(z.enum(importance))
            .optional()
            .describe(
                'Importance of this node in the real experience. Not correlated to complexity or size. Left missing when unknown.',
            ),
        complexity: zClaim(zComplexity)
            .optional()
            .describe(
                'Estimated explanation cost of this node. Note: this refers to explanation complexity, not node complexity. A node may refer to a very complex task and remain reasonably simple to explain.',
            ),
        source: zFlexarray(zClaim(zSourceKey))
            .optional()
            .describe(
                'Where the information comes from. Source can be omitted for common / general knowledge information, like well-known public tools.',
            ),
        tag: zFlexarray(z.string())
            .optional()
            .describe(
                'Lightweight labels. Supports simple search and grouping without adding many specialized fields.',
            ),
    }),
})

const zEdge = z.object({
    complexity: zClaim(zComplexity).optional(),
    fact: zFlexarray(z.string())
        .optional()
        .describe('Some relationships are harder to explain than the things they connect.'),
})

const zNodeRef = z.looseObject({
    [kdataEdge]: zEdge.optional().describe('Edge information.'),
})
const zExternalNodeRef = zNodeRef.refine(node => !(kdataNode in node), {
    message: `Invalid inline node. '${kdataNode}' must match the inline node schema.`,
})
const zOutgoing: z.ZodType<InputOutgoing<BaseKeys>> = z.looseRecord(
    zVerbKey,
    z
        .record(zNodeKey, z.union([z.null(), zNodeRef.and(zNode).and(z.lazy(() => zOutgoing)), zExternalNodeRef]))
        .describe('Outgoing edges.'),
)

export const zInfographInput: z.ZodType<InputInfograph<BaseKeys>> = z.object({
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
