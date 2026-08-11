import assert from 'node:assert/strict'
import test from 'node:test'
import { Flowchart } from 'mermaid-ast'
import { render } from '../src/mermaid.js'

const diagram = (id: string, label: string) => {
    const flowchart = Flowchart.create()
    flowchart.addNode(id, label)
    return flowchart
}

test('renders one raw Mermaid diagram', () => {
    assert.equal(render(diagram('a', 'A')), 'flowchart TD\na[A]')
})
