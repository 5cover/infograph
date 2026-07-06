import z from 'zod'
import type { SomeType } from 'zod/v4/core'
import { type Complexity, importance, type BaseKeys } from '../types'
import { kdataEdge, kdataNode, type InputOutgoing, type InputInfograph } from './types'
import { exit } from 'node:process'

const slugPattern = '(-|[a-z0-9]+(_[a-z0-9]+)*)'
export const verbPattern = new RegExp(`^(?!${RegExp.escape(kdataEdge)}$|${RegExp.escape(kdataNode)}$)${slugPattern}$`)
const zSlug = z.string().regex(new RegExp(`^${slugPattern}$`))
const zKindKey = zSlug
const zNodeId = zSlug
const zSourceKey = zSlug
const zNodeKey = z.templateLiteral([zKindKey, ' ', zNodeId])
const zVerbKey = z.string().regex(verbPattern)

const zEdgeId = z.templateLiteral([zNodeKey, ' ', zVerbKey, ' ', zNodeKey])

const zComplexity: z.ZodType<Complexity> = z.union([
    z.literal('simple').describe('easy to mention'),
    z.literal('natural').describe('needs explanation, but self-contained and natural to explain'),
    z.literal('contextual').describe('needs context from other nodes not in the relation'),
    z.literal('intertwined').describe('needs deep context or demonstration'),
])

const zNaturalLanguage = z
    .string()
    .nonempty()
    .describe(
        'Information intentionally expressed in natural language rather than a structured value. Use it when meaning is better conveyed through human language than additional schema. Keep it factual, concise and independent from any specific presentation or wording.',
    )

const zPlainKeyword = z
    .object({
        desc: zNaturalLanguage.describe("Description of this keyword's semantic and intended use."),
    })
    .or(z.null())

const zFlexarray = <T extends SomeType>(item: T) => z.union([item, z.array(item).nonempty()])

const zClaim = <T extends z.ZodType<string>>(is: T) =>
    z.object({
        is: is.describe('Selected value.'),
        why: zFlexarray(zNaturalLanguage).describe(
            'Justification for selecting this value. Why choose this value and not another. Retraces author intent.',
        ),
    })

// normally, dates would be parsed here, but the transforms breaks with looseRecord passing values as-is
const zDate = z.string().describe('YYYY, YYYY-MM, or YYYY-MM-DD')

const zNode = z.looseObject({
    [kdataNode]: z.object({
        title: zNaturalLanguage.describe('Short human label for the node.'),
        summary: zNaturalLanguage
            .optional()
            .describe(
                'Compact factual description of the node. Gives enough context to understand the node without following every edge. It should remain factual, not rhetorical.',
            ),
        fact: zFlexarray(zNaturalLanguage)
            .optional()
            .describe(
                'Atomic factual claims attached to the node. Keeps facts separated from wording. The same statements can later support slides, reports or oral explanations.',
            ),
        date: z
            .object({
                from: zDate,
                to: zDate,
            })
            .or(zDate.describe('One "on" date, for punctual events'))
            .optional()
            .describe(
                'Time range during which this node matters. Allows timeline-oriented queries without forcing every fact into prose. Approximate periods are acceptable.',
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
        tag: zFlexarray(zSlug)
            .optional()
            .describe(
                'Lowercase kebab-case labels intended for lightweight classification, not prose. Allow for simple search and grouping without adding many specialized fields.',
            ),
    }),
})

const zEdge = z.object({
    complexity: zClaim(zComplexity).optional(),
    fact: zFlexarray(zNaturalLanguage)
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
            title: zNaturalLanguage.describe('Human-readable name for the whole graph.'),
            context: zNaturalLanguage.describe(
                'Short description of the real-world context represented by the graph. Gives global orientation without repeating the same context in every node.',
            ),
            author: zNaturalLanguage.describe(
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
