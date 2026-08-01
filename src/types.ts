export const complexity = ['simple', 'natural', 'contextual', 'intertwined'] as const
export type Complexity = (typeof complexity)[number]
export const importance = ['minor', 'useful', 'major', 'central'] as const
export type Importance = (typeof importance)[number]
export const claimTypes = {
    fact: 'affirmation held to be true in the infographic, because observed or sufficiently supported by sources. It can include a reasonable inference, without imposing an additional distinction.',
    hypothesis: 'possible explanation whose sources do not yet allow establishing the truth.',
    opinion:
        'judgment, appreciation, preference or position of the author. It is not intended to become true or false by accumulation of evidence.',
    counterfactual: 'affirmation about what could have, should have, or might occur in a different situation.',
} as const

export type ClaimType = keyof typeof claimTypes

export type Claim = {
    type: ClaimType
    content: string
}

export type EdgeInfo = {
    complexity: InfographReason<Complexity>
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

export type InfographNode<Keys extends BaseKeys> = {
    title: string
    summary?: string
    claim?: Claim[]
    date?: InfographDate
    importance?: InfographReason<Importance>
    complexity: InfographReason<Complexity>
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

export type InfographNodeKey<Keys extends BaseKeys> = `${Keys['kind']} ${Keys['node']}`

export type Infograph<Keys extends BaseKeys> = {
    info?: InfographInfo
    domain: InfographDomain<Keys>
    nodes: Map<InfographNodeKey<Keys>, InfographNode<Keys>>
    edges: {
        verb: Keys['verb']
        from: InfographNodeKey<Keys>
        to: InfographNodeKey<Keys>
        info: EdgeInfo
    }[]
}

export type InfographDomain<Keys extends BaseKeys> = {
    kind: Record<Keys['kind'], Keyword>
    verb: Record<Keys['verb'], Keyword>
    source: Record<Keys['source'], Keyword>
}
