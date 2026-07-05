import { z } from 'zod'
import { type BaseKeys, type Infograph, type InfographNode, type InfographNodeKey, type InfographClaim } from '../types'
import {
    type InputInfograph,
    type InputNode,
    kdataNode,
    type InputOutgoing,
    kdataEdge,
    type InputClaim,
    type Flexarray,
} from './types'
import { verbPattern, zInfographInput } from './schemas'

export const defineInfograph = <Keys extends BaseKeys>(infograph: InputInfograph<Keys>) => infograph

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
        const verifySource = verifyKeyset('source', k => k in g.domain.source)
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
                            from,
                            verb,
                            to,
                            info: {
                                complexity: edge.complexity && buildClaim(edge.complexity),
                                fact: deflex(edge.fact),
                            },
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
            const d = node[kdataNode]
            const [kind, id] = originalKey.split(' ', 2)
            const key = flattenNodeKey(originalKey, parents)
            verifyKind(kind)
            parents.push({ kind, id, title: d.title })
            yield [
                key,
                {
                    ...d,
                    title: parents.map(p => p.title).join(' '),
                    fact: deflex(d.fact),
                    complexity: d.complexity && buildClaim(d.complexity),
                    importance: d.importance && buildClaim(d.importance),
                    source: deflex(d.source)?.map(source => {
                        verifySource(source.is)
                        return buildClaim(source)
                    }),
                    tag: deflex(d.tag),
                    date:
                        d.date ?
                            typeof d.date === 'string' ?
                                (() => {
                                    const on = verifyDate(d.date)
                                    return { from: on, to: on }
                                })()
                            :   {
                                    from: verifyDate(d.date.from),
                                    to: verifyDate(d.date.to),
                                }
                        :   undefined,
                },
            ] as const
            yield* entries(node).flatMap(([verb, value]) => {
                if (!verbPattern.test(verb)) return []
                verifyVerb(verb)
                if (!value) return []
                const nodes = value as Exclude<InputOutgoing<BaseKeys>[string], undefined>
                return entries(nodes).flatMap(([outkey, node]) => {
                    const isInlineNode = node && kdataNode in node
                    const to = isInlineNode ? flattenNodeKey(outkey, parents) : (outkey as InfographNodeKey<BaseKeys>)
                    infographEdges.push({
                        verb,
                        from: key,
                        to,
                        info: {
                            complexity: node?.[kdataEdge]?.complexity && buildClaim(node?.[kdataEdge]?.complexity),
                            fact: deflex(node?.[kdataEdge]?.fact),
                        },
                    })
                    if (isInlineNode) return parseNode(outkey, node, parents)
                    defer(verifyNode, to)
                    return []
                })
            })
            parents.pop()
        }
        function flattenNodeKey(originalKey: string, parents: { kind: string; id: string }[]) {
            const [kind, id] = originalKey.split(' ', 2)
            return nodeKey(kind, [id, ...parents.map(p => nodeKey(p.kind, p.id)).reverse()].join(' < '))
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

function buildClaim<T>(c: InputClaim<T>): InfographClaim<T> {
    return { is: c.is, why: deflex(c.why) }
}

function deflex<T>(fa: Flexarray<readonly T[]> | undefined): never // ambiguous
function deflex<T>(fa: Flexarray<Exclude<T, undefined>>): Exclude<T, undefined>[]
function deflex<T>(fa: Flexarray<T> | undefined): T[] | undefined
function deflex<T>(fa: Flexarray<T> | undefined): T[] | undefined {
    return (
        fa === undefined ? undefined
        : Array.isArray(fa) ? fa
        : [fa]
    )
}

function nodeKey(kind: string, id: string) {
    return `${kind} ${id}` as const
}
