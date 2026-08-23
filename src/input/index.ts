import {
    type BaseKeys,
    type Infograph,
    type InfographEdgeKey,
    type InfographNode,
    type InfographNodeIdentity,
    type InfographNodeKey,
    type InfographReason,
} from '../types.js'
import {
    type InputInfograph,
    type InputNode,
    kdataNode,
    type InputOutgoing,
    kdataEdge,
    type InputReason,
    type Flexarray,
} from './types.js'
import { verbPattern, zInfographInput } from './schemas.js'
import { parseEdgeKey, parseNodeKey, unparseNodeKey } from '../infograph.js'

export const defineInfograph = <Keys extends BaseKeys>(infograph: InputInfograph<Keys>) => infograph

const zInfograph = zInfographInput.transform((g, ctx): Infograph => {
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

    const verifyKeyword =
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
    const verifyKind = verifyKeyword('kind', k => k in g.domain.kind)
    const verifyVerb = verifyKeyword('verb', k => k in g.domain.verb)
    const verifySource = verifyKeyword('source', k => k in g.domain.source)
    const verifyNode = verifyKeyword<InfographNodeKey>('node', k => infograph.nodes.has(k))
    type DeferredEntry<K extends string> = [f: (key: K) => void, key: K]
    const deferredChecks: DeferredEntry<any>[] = []
    const defer = <K extends string>(...r: DeferredEntry<K>) => {
        deferredChecks.push(r)
    }

    const infographEdges = walkEntry(g, 'edges', edges =>
        edges
            ? entries(edges)
                  .map(([keystring, edge]) => {
                      const info = parseEdgeKey(keystring as InfographEdgeKey)
                      verifyVerb(info.verb)
                      const from = unparseNodeKey(info.from)
                      const to = unparseNodeKey(info.to)
                      defer(verifyNode, from)
                      defer(verifyNode, to)
                      return {
                          from,
                          verb: info.verb,
                          to,
                          info: {
                              complexity: buildReason(edge.complexity),
                              technicality: edge.technicality && buildReason(edge.technicality),
                              claim: edge.claim,
                          },
                      }
                  })
                  .toArray()
            : []
    )

    const infograph: Infograph = {
        info: g.info,
        domain: g.domain,
        edges: infographEdges,
        nodes: new Map(
            walkEntry(g, 'nodes', nodes => entries(nodes).flatMap(([key, node]) => parseNode(parseNodeKey(key), node)))
        ),
    }

    for (const [c, k] of deferredChecks) {
        c(k)
    }

    return infograph

    function* parseNode(
        key: InfographNodeIdentity,
        node: InputNode
    ): Generator<[k: InfographNodeKey, v: InfographNode]> {
        const d = node[kdataNode]
        verifyKind(key.kind)
        yield [
            unparseNodeKey(key),
            {
                ...d,
                title: d.title,
                complexity: buildReason(d.complexity),
                technicality: d.technicality && buildReason(d.technicality),
                importance: d.importance && buildReason(d.importance),
                source: deflex(d.source)?.map(source => {
                    verifySource(source.is)
                    return buildReason(source)
                }),
                tag: deflex(d.tag),
                date: d.date
                    ? typeof d.date === 'string'
                        ? (() => {
                              const on = verifyDate(d.date)
                              return { from: on, to: on }
                          })()
                        : {
                              from: verifyDate(d.date.from),
                              to: verifyDate(d.date.to),
                          }
                    : undefined,
            },
        ] as const
        yield* entries(node).flatMap(([verb, value]) => {
            if (!verbPattern.test(verb)) return []
            verifyVerb(verb)
            if (!value) return []
            const nodes = value as Exclude<InputOutgoing<BaseKeys>[string], undefined>
            return entries(nodes).flatMap(([outkeystring, node]) => {
                const isInlineNode = node && kdataNode in node
                const outkey = parseNodeKey(outkeystring)
                const to = unparseNodeKey(outkey)
                infographEdges.push({
                    verb,
                    from: unparseNodeKey(key),
                    to,
                    info: {
                        complexity: buildReason(node[kdataEdge].complexity),
                        technicality: node[kdataEdge].technicality && buildReason(node[kdataEdge].technicality),
                        claim: node[kdataEdge].claim,
                    },
                })
                if (isInlineNode) return parseNode(outkey, node)
                defer(verifyNode, to)
                return []
            })
        })
    }

    function* entries<V>(o: { [k: string]: V }) {
        for (const [k, v] of Object.entries(o)) {
            if (v === undefined) continue
            path.push(k)
            yield [k, v] as const
            path.pop()
        }
    }
})

export const parseInfograph = (data: unknown) => zInfograph.parse(data, { reportInput: true })

export const getSchema = (options?: { additionalProperties?: boolean }) =>
    zInfographInput.toJSONSchema({
        target: 'draft-07',
        reused: 'ref',
        io: 'input',
        override: options?.additionalProperties
            ? undefined
            : ctx => {
                  if (
                      undefined !== ctx.jsonSchema.properties &&
                      undefined === ctx.jsonSchema.propertyNames &&
                      undefined === ctx.jsonSchema.additionalProperties
                  )
                      ctx.jsonSchema.additionalProperties = false
              },
    })

function buildReason<T>(c: InputReason<T>): InfographReason<T> {
    return { is: c.is, why: deflex(c.why) }
}

function deflex<T>(fa: Flexarray<readonly T[]> | undefined): never // ambiguous
function deflex<T>(fa: Flexarray<Exclude<T, undefined>>): Exclude<T, undefined>[]
function deflex<T>(fa: Flexarray<T> | undefined): T[] | undefined
function deflex<T>(fa: Flexarray<T> | undefined): T[] | undefined {
    return fa === undefined ? undefined : Array.isArray(fa) ? fa : [fa]
}
