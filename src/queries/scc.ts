import type { BaseKeys, Infograph, InfographNodeKey } from '../types.js'

// Strongly connected components via Tarjan's algorithm. Edges are followed by direction, so an SCC of more than one node means those nodes are mutually reachable through a cycle. Components are returned in reverse topological order (a component appears before the components it can reach), as Tarjan emits them.
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

// Keep only components that contain a cycle: more than one node, or a single node with a self-loop. Matches the "non-trivial" notion reported by the metrics query.
export function nonTrivialComponents<Keys extends BaseKeys>(
    infograph: Infograph<Keys>,
    components: InfographNodeKey<Keys>[][]
): InfographNodeKey<Keys>[][] {
    const selfLooped = new Set<InfographNodeKey<Keys>>()
    for (const edge of infograph.edges) {
        if (edge.from === edge.to) selfLooped.add(edge.from)
    }
    return components.filter(component => component.length > 1 || selfLooped.has(component[0]))
}

/** Non-trivial strongly connected components in a deterministic display order. */
export function cyclicComponents<Keys extends BaseKeys>(infograph: Infograph<Keys>): InfographNodeKey<Keys>[][] {
    return nonTrivialComponents(infograph, stronglyConnectedComponents(infograph))
        .map(component => component.toSorted())
        .toSorted((a, b) => b.length - a.length || compareComponents(a, b))
}

function compareComponents<Keys extends BaseKeys>(a: InfographNodeKey<Keys>[], b: InfographNodeKey<Keys>[]) {
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
        if (a[index] < b[index]) return -1
        if (a[index] > b[index]) return 1
    }
    return a.length - b.length
}
