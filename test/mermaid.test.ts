import assert from 'node:assert/strict'
import test from 'node:test'
import { Flowchart } from 'mermaid-ast'
import { render } from '../src/mermaid.js'

const diagram = (id: string, label: string) => {
    const flowchart = Flowchart.create()
    flowchart.addNode(id, label)
    return flowchart
}

test('renders an empty diagram array as an empty string', () => {
    assert.equal(render([]), '')
})

test('renders a single diagram array like a single diagram', () => {
    const flowchart = diagram('a', 'A')
    assert.equal(render([flowchart]), render(flowchart))
})

test('wraps multiple diagrams in Mermaid markdown blocks separated by a blank line', () => {
    assert.equal(
        render([diagram('a', 'A'), diagram('b', 'B')]),
        '```mermaid\nflowchart TD\na[A]\n```\n\n```mermaid\nflowchart TD\nb[B]\n```'
    )
})
