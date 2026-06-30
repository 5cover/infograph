export const complexity = ['simple', 'contained', 'contextual', 'intertwined'] as const
export type Complexity = (typeof complexity)[number]
export const importance = ['minor', 'useful', 'major', 'central'] as const
export type Importance = (typeof importance)[number]

export type EdgeInfo = {
    complexity?: Complexity
    fact?: string[]
}

export type Period = {
    from: Date
    to: Date
}

export type NodeInfo<Domain extends BaseDomain> = {
    title: string
    summary?: string
    fact?: string[]
    period?: Period
    importance?: Importance
    complexity?: Complexity
    source?: (keyof Domain['source'])[]
    tag?: string[]
}

export type InfographMeta = {
    title?: string
    context?: string
    author?: string
}

type Keyword = undefined | null | { desc?: string }

export type BaseDomain = {
    kind: Record<string, Keyword>
    verb: Record<string, Keyword>
    source: Record<string, Keyword>
}

export type Infograph<NodeKey extends string, Domain extends BaseDomain> = {
    meta?: InfographMeta
    domain: Domain
    nodes: Map<
        NodeKey,
        {
            kind: keyof Domain['kind']
            info: NodeInfo<Domain>
        }
    >
    edges?: {
        verb: keyof Domain['verb']
        from: NodeKey
        to: NodeKey
        info: EdgeInfo
    }[]
}
