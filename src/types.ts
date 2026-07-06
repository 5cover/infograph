export const complexity = ['simple', 'natural', 'contextual', 'intertwined'] as const
export type Complexity = (typeof complexity)[number]
export const importance = ['minor', 'useful', 'major', 'central'] as const
export type Importance = (typeof importance)[number]

export type EdgeInfo = {
    complexity?: InfographClaim<Complexity>
    fact?: string[]
}

export type InfographDate<T = Date> = {
    from: T
    to: T
}

export type InfographClaim<T> = {
    is: T
    why: string[]
}

export type InfographActor = {
    name: string
    role: string[]
}

export type InfographNode<Keys extends BaseKeys> = {
    title: string
    summary?: string
    fact?: string[]
    date?: InfographDate
    importance?: InfographClaim<Importance>
    complexity?: InfographClaim<Complexity>
    source?: InfographClaim<Keys['source']>[]
    tag?: string[]
    actor?: InfographActor[]
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
