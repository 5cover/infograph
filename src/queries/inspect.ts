import type { BaseKeys, Infograph, InfographDomain } from '../types.js'
import { strcmp } from '../util.js'

export type EdgeSpaceEntry<Keys extends BaseKeys> = {
    from: Keys['kind']
    verb: Keys['verb']
    to: Keys['kind']
}

/** Return the graph edges that use one verb, preserving canonical edge order. */
export function edgesWithVerb<Keys extends BaseKeys>(infograph: Infograph<Keys>, verb: Keys['verb']) {
    return infograph.edges.filter(edge => edge.verb === verb)
}

/** Enumerate the domain's possible kind/verb/kind triples in stable order. */
export function edgeSpace<Keys extends BaseKeys>(domain: InfographDomain<Keys>): EdgeSpaceEntry<Keys>[] {
    const verbs = Object.keys(domain.verb).toSorted() as Keys['verb'][]
    const kinds = Object.keys(domain.kind).toSorted() as Keys['kind'][]
    const result: EdgeSpaceEntry<Keys>[] = []
    for (const from of kinds) for (const to of kinds) for (const verb of verbs) result.push({ from, verb, to })
    return result
}

export type KeywordVocabulary = Record<string, string[] | Record<string, unknown>>

/** Return the declared vocabulary, optionally retaining its description metadata. */
export function keywordVocabulary<Keys extends BaseKeys>(
    domain: InfographDomain<Keys>,
    options: { descriptions?: boolean } = {}
): KeywordVocabulary {
    return Object.fromEntries(
        Object.entries(domain).map(([name, entries]) => [
            name,
            options.descriptions
                ? Object.fromEntries(Object.entries(entries).toSorted((a, b) => strcmp(a[0], b[0])))
                : Object.keys(entries).toSorted(),
        ])
    )
}
