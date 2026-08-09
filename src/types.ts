export const complexity = ['simple', 'natural', 'contextual', 'intertwined'] as const
export type Complexity = (typeof complexity)[number]
export const importance = ['minor', 'useful', 'major', 'central'] as const
export type Importance = (typeof importance)[number]
export const technicality = ['none', 'some', 'most', 'all'] as const
export type Technicality = (typeof technicality)[number]
export const claimTypes = {
    fact: 'affirmation held to be true in the infographic, because observed or sufficiently supported by sources. It can include a reasonable inference, without imposing an additional distinction.',
    hypothesis: 'possible explanation whose sources do not yet allow establishing the truth.',
    opinion:
        'judgment, appreciation, preference or position of the author. It is not intended to become true or false by accumulation of evidence.',
    counterfactual: 'affirmation about what could have, should have, or might occur in a different situation.',
    option: 'alternative that was genuinely considered in the context of the node, at the time. Distinct from counterfactual: an option was actually on the table, not reasoning about changed circumstances.',
} as const

export type ClaimType = keyof typeof claimTypes

export type Claim = {
    type: ClaimType
    content: string
}

export type EdgeInfo = {
    complexity: InfographReason<Complexity>
    technicality?: InfographReason<Technicality>
    claim?: Claim[]
}

export type InfographDate<T = Date> = {
    from: T
    to: T
}

export type InfographReason<T> = {
    is: T
    why: string[]
}

export type InfographNode<Keys extends BaseKeys = BaseKeys> = {
    title: string
    summary?: string
    claim?: Claim[]
    date?: InfographDate
    importance?: InfographReason<Importance>
    complexity: InfographReason<Complexity>
    technicality?: InfographReason<Technicality>
    source?: InfographReason<Keys['source']>[]
    tag?: string[]
}

export type InfographInfo = {
    title?: string
    context?: string
    author?: string
}

type Keyword = undefined | null | { desc?: string }

export type BaseKeys = {
    node: string
    kind: string
    verb: string
    source: string
}
export type InfographNodeIdentity<Keys extends BaseKeys = BaseKeys> = { kind: Keys['kind']; id: Keys['node'] }

export type InfographNodeKey<Keys extends BaseKeys = BaseKeys> = `${Keys['kind']} ${Keys['node']}`
export type InfographEdgeKey<Keys extends BaseKeys = BaseKeys> =
    `${InfographNodeKey<Keys>} ${Keys['verb']} ${InfographNodeKey<Keys>}`

export type InfographEdgeIdentity<Keys extends BaseKeys> = {
    verb: Keys['verb']
    from: InfographNodeKey<Keys>
    to: InfographNodeKey<Keys>
}

export type Infograph<Keys extends BaseKeys = BaseKeys> = {
    info?: InfographInfo
    domain: InfographDomain<Keys>
    nodes: Map<InfographNodeKey<Keys>, InfographNode<Keys>>
    edges: (InfographEdgeIdentity<Keys> & {
        info: EdgeInfo
    })[]
}

export type InfographDomain<Keys extends BaseKeys> = {
    kind: Record<Keys['kind'], Keyword>
    verb: Record<Keys['verb'], Keyword>
    source: Record<Keys['source'], Keyword>
}
