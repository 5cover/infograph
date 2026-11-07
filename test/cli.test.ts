import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = fileURLToPath(new URL('..', import.meta.url))
const fixture = 'doc/domains/experiential/example-infograph.yaml'

function cli(...args: string[]) {
    return cliInput(undefined, ...args)
}

function cliInput(input: string | undefined, ...args: string[]) {
    return spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
        cwd: root,
        encoding: 'utf8',
        input,
    })
}

test('query select and traverse preserve machine-readable output formats', t => {
    const selected = cli('query', 'select', 'nodes', fixture, '--kind', 'project', '-f', 'json')
    if (sandboxBlocks(selected)) return t.skip('sandbox does not permit spawning the CLI process')
    assert.equal(selected.status, 0, selected.stderr)
    const selection = JSON.parse(selected.stdout) as { target: string; nodes: { key: string }[] }
    assert.equal(selection.target, 'nodes')
    assert.deepEqual(
        selection.nodes.map(node => node.key),
        ['project sponsorship']
    )

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

test('edit apply accepts stdin, supports dry-run, and accepts a changefile', t => {
    const directory = mkdtempSync(join(tmpdir(), 'infograph-edit-'))
    const corpus = join(directory, 'corpus.yaml')
    const patch = join(directory, 'remove.yaml')
    copyFileSync(join(root, fixture), corpus)
    const input = '- add-tag:\n    node: project sponsorship\n    tag: llm_checked\n'
    try {
        const dryRun = cliInput(input, 'edit', 'apply', corpus, '--dry-run')
        if (sandboxBlocks(dryRun)) return t.skip('sandbox does not permit spawning the CLI process')
        assert.equal(dryRun.status, 0, dryRun.stderr)
        assert.match(dryRun.stdout, /dryRun: true/)
        assert.doesNotMatch(readFileSync(corpus, 'utf8'), /llm_checked/)

        const applied = cliInput(input, 'edit', 'apply', corpus)
        assert.equal(applied.status, 0, applied.stderr)
        assert.match(readFileSync(corpus, 'utf8'), /llm_checked/)

        const beforeFailure = readFileSync(corpus, 'utf8')
        const failed = cliInput(
            '- remove-edge:\n    from: task missing\n    verb: contains\n    to: task absent\n',
            'edit',
            'apply',
            corpus
        )
        assert.notEqual(failed.status, 0)
        assert.equal(readFileSync(corpus, 'utf8'), beforeFailure)

        writeFileSync(patch, '- remove-node:\n    node: project sponsorship\n')
        const removed = cli('edit', 'apply', corpus, patch)
        assert.equal(removed.status, 0, removed.stderr)
        assert.doesNotMatch(readFileSync(corpus, 'utf8'), /project sponsorship/)
    } finally {
        rmSync(directory, { recursive: true, force: true })
    }
})

function sandboxBlocks(result: ReturnType<typeof spawnSync>) {
    return (result.error as NodeJS.ErrnoException | undefined)?.code === 'EPERM'
}
