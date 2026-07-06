import type {
    BaseKeys,
    Complexity,
    Importance,
    InfographDate,
    InfographDomain,
    InfographInfo,
    InfographNodeKey,
    InfographActor,
} from '../types'

export const kdataEdge = 'with'
export const kdataNode = 'info'

export type Flexarray<T> = T | T[]

export type InputEdgeInfo = {
    complexity?: InputClaim<Complexity>
    fact?: Flexarray<string>
}

export type InputClaim<T> = {
    is: T
    why: Flexarray<string>
}

export type InputActor = Omit<InfographActor, 'role'> & {
    role: Flexarray<string>
}

export type InputNodeInfo<Keys extends BaseKeys> = {
    title: string
    summary?: string
    fact?: Flexarray<string>
    date?: string | InfographDate<string>
    importance?: InputClaim<Importance>
    complexity?: InputClaim<Complexity>
    source?: Flexarray<InputClaim<Keys['source']>>
    tag?: Flexarray<string>
    actor?: Flexarray<InputActor>
}

export type InputNodeRef = { [kdataEdge]?: InputEdgeInfo }

type R<K extends PropertyKey, V> = { [P in K]?: V }

export type InputNode<Keys extends BaseKeys> = { [kdataNode]: InputNodeInfo<Keys> } & InputOutgoing<Keys>

type InputEdgeId<Keys extends BaseKeys> = `${InfographNodeKey<Keys>} ${Keys['verb']} ${InfographNodeKey<Keys>}`

export type InputOutgoing<Keys extends BaseKeys> = {
    [P in Keys['verb']]?: R<InfographNodeKey<Keys>, null | InputNodeRef | (InputNodeRef & InputNode<Keys>)>
}

export type InputInfograph<Keys extends BaseKeys> = {
    info?: InfographInfo
    domain: InfographDomain<Keys>
    nodes: R<InfographNodeKey<Keys>, InputNode<Keys>>
    edges?: R<InputEdgeId<Keys>, InputEdgeInfo>
}
