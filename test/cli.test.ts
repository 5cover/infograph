import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = new URL('..', import.meta.url).pathname
const fixture = 'doc/domains/experiential/example-infograph.yaml'

function cli(...args: string[]) {
    return spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
        cwd: root,
        encoding: 'utf8',
    })
}

test('query select and traverse preserve machine-readable output formats', t => {
    const selected = cli('-f', 'json', 'query', 'select', 'nodes', fixture, '--kind', 'project')
    if (sandboxBlocks(selected)) return t.skip('sandbox does not permit spawning the CLI process')
    assert.equal(selected.status, 0, selected.stderr)
    const selection = JSON.parse(selected.stdout) as { target: string; nodes: { key: string }[] }
    assert.equal(selection.target, 'nodes')
    assert.deepEqual(selection.nodes.map(node => node.key), ['project sponsorship'])

    const traversed = cli('query', 'traverse', fixture, '--from', 'project sponsorship', '--max-hops', '1')
    assert.equal(traversed.status, 0, traversed.stderr)
    assert.match(traversed.stdout, /^roots:/)
    assert.match(traversed.stdout, /project sponsorship/)
})

test('skill install copies the bundled skill and refuses an existing destination', t => {
    const destination = mkdtempSync(join(tmpdir(), 'infograph-skill-'))
    try {
        const installed = cli('skill', 'install', '--path', destination)
        if (sandboxBlocks(installed)) return t.skip('sandbox does not permit spawning the CLI process')
        assert.equal(installed.status, 0, installed.stderr)
        assert.ok(existsSync(join(destination, 'infograph-query', 'SKILL.md')))

        const repeated = cli('skill', 'install', '--path', destination)
        assert.notEqual(repeated.status, 0)
        assert.match(repeated.stderr, /Skill already exists/)
    } finally {
        rmSync(destination, { recursive: true, force: true })
    }
})

function sandboxBlocks(result: ReturnType<typeof spawnSync>) {
    return (result.error as NodeJS.ErrnoException | undefined)?.code === 'EPERM'
}
