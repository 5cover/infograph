import type { BaseKeys, Infograph, InfographNodeKey } from '../types'

// Strongly connected components via Tarjan's algorithm. Edges are followed by
// direction, so an SCC of more than one node means those nodes are mutually
// reachable through a cycle. Components are returned in reverse topological order
// (a component appears before the components it can reach), as Tarjan emits them.
export function stronglyConnectedComponents<Keys extends BaseKeys>(
    infograph: Infograph<Keys>
): InfographNodeKey<Keys>[][] {
    const nodeKeys = [...infograph.nodes.keys()]
    const adjacency = new Map<InfographNodeKey<Keys>, InfographNodeKey<Keys>[]>(nodeKeys.map(key => [key, []]))
    for (const edge of infograph.edges) {
        if (adjacency.has(edge.from) && adjacency.has(edge.to)) adjacency.get(edge.from)!.push(edge.to)
    }

    const index = new Map<InfographNodeKey<Keys>, number>()
    const lowlink = new Map<InfographNodeKey<Keys>, number>()
    const onStack = new Set<InfographNodeKey<Keys>>()
    const stack: InfographNodeKey<Keys>[] = []
    const components: InfographNodeKey<Keys>[][] = []
    let counter = 0

    for (const key of nodeKeys) {
        if (!index.has(key)) strongConnect(key)
    }

    return components

    function strongConnect(node: InfographNodeKey<Keys>) {
        index.set(node, counter)
        lowlink.set(node, counter)
        counter++
        stack.push(node)
        onStack.add(node)

        for (const next of adjacency.get(node)!) {
            if (!index.has(next)) {
                strongConnect(next)
                lowlink.set(node, Math.min(lowlink.get(node)!, lowlink.get(next)!))
            } else if (onStack.has(next)) {
                lowlink.set(node, Math.min(lowlink.get(node)!, index.get(next)!))
            }
        }

        if (lowlink.get(node) !== index.get(node)) return

        const component: InfographNodeKey<Keys>[] = []
        while (true) {
            const popped = stack.pop()!
            onStack.delete(popped)
            component.push(popped)
            if (popped === node) break
        }
        components.push(component)
    }
}
