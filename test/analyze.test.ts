import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = fileURLToPath(new URL('..', import.meta.url))
const fixture = 'doc/domains/experiential/example-infograph.yaml'
const pages = ['summary', 'structure', 'cycles', 'chronology', 'hubs', 'groups', 'vocabulary', 'attention']

function cli(...args: string[]) {
    return spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
        cwd: root,
        encoding: 'utf8',
    })
}

test('analyze writes every page, and each relative markdown link resolves', t => {
    const directory = mkdtempSync(join(tmpdir(), 'infograph-analyze-'))
    const out = join(directory, 'report')
    try {
        const result = cli('analyze', fixture, out)
        if (sandboxBlocks(result)) return t.skip('sandbox does not permit spawning the CLI process')
        assert.equal(result.status, 0, result.stderr)
        assert.match(readFileSync(join(out, 'index.md'), 'utf8'), /^# /)
        for (const page of pages) assert.ok(existsSync(join(out, `${page}.md`)), `missing ${page}.md`)
        assert.ok(existsSync(join(out, 'raw', 'metrics.yaml')))

        for (const file of readdirSync(out).filter(name => name.endsWith('.md'))) {
            for (const [, target] of readFileSync(join(out, file), 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
                assert.ok(existsSync(join(out, target)), `${file} links to missing ${target}`)
            }
        }
    } finally {
        rmSync(directory, { recursive: true, force: true })
    }
})

test('analyze refuses a non-empty directory unless --force is given, and writes json raw output', t => {
    const directory = mkdtempSync(join(tmpdir(), 'infograph-analyze-'))
    const out = join(directory, 'report')
    try {
        const first = cli('analyze', fixture, out, '-f', 'json')
        if (sandboxBlocks(first)) return t.skip('sandbox does not permit spawning the CLI process')
        assert.equal(first.status, 0, first.stderr)
        assert.ok(existsSync(join(out, 'raw', 'metrics.json')))

        const refused = cli('analyze', fixture, out)
        assert.notEqual(refused.status, 0)
        assert.match(refused.stderr, /not empty/)

        writeFileSync(join(out, 'notes.txt'), 'kept')
        const forced = cli('analyze', fixture, out, '--force')
        assert.equal(forced.status, 0, forced.stderr)
        assert.equal(readFileSync(join(out, 'notes.txt'), 'utf8'), 'kept')
    } finally {
        rmSync(directory, { recursive: true, force: true })
    }
})

test('analyze rejects the data option, which it does not declare', t => {
    const directory = mkdtempSync(join(tmpdir(), 'infograph-analyze-'))
    try {
        const rejected = cli('analyze', fixture, join(directory, 'report'), '-d', 'plain')
        if (sandboxBlocks(rejected)) return t.skip('sandbox does not permit spawning the CLI process')
        assert.notEqual(rejected.status, 0)
        assert.match(rejected.stderr, /unknown option/)
    } finally {
        rmSync(directory, { recursive: true, force: true })
    }
})

function sandboxBlocks(result: ReturnType<typeof spawnSync>) {
    return (result.error as NodeJS.ErrnoException | undefined)?.code === 'EPERM'
}
