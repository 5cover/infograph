import type {
    BaseKeys,
    Claim,
    Complexity,
    Importance,
    InfographDate,
    InfographDomain,
    InfographInfo,
    InfographNodeKey,
    Technicality,
} from '../types.js'

export const kdataEdge = 'with'
export const kdataNode = 'info'

export type Flexarray<T> = T | T[]

export type InputEdgeInfo = {
    complexity: InputReason<Complexity>
    technicality?: InputReason<Technicality>
    claim?: Claim[]
}

export type InputReason<T> = {
    is: T
    why: Flexarray<string>
}

export type InputNodeInfo<Keys extends BaseKeys> = {
    title: string
    summary?: string
    claim?: Claim[]
    date?: string | InfographDate<string>
    importance?: InputReason<Importance>
    complexity: InputReason<Complexity>
    technicality?: InputReason<Technicality>
    source?: Flexarray<InputReason<Keys['source']>>
    tag?: Flexarray<string>
}

export type InputNodeRef = { [kdataEdge]: InputEdgeInfo }

type R<K extends PropertyKey, V> = { [P in K]?: V }

export type InputNode<Keys extends BaseKeys> = { [kdataNode]: InputNodeInfo<Keys> } & InputOutgoing<Keys>

type InputEdgeId<Keys extends BaseKeys> = `${InfographNodeKey<Keys>} ${Keys['verb']} ${InfographNodeKey<Keys>}`

export type InputOutgoing<Keys extends BaseKeys> = {
    [P in Keys['verb']]?: R<InfographNodeKey<Keys>, InputNodeRef | (InputNodeRef & InputNode<Keys>)>
}

export type InputInfograph<Keys extends BaseKeys> = {
    info?: InfographInfo
    domain: InfographDomain<Keys>
    nodes: R<InfographNodeKey<Keys>, InputNode<Keys>>
    edges?: R<InputEdgeId<Keys>, InputEdgeInfo>
}
