import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { resolve } from 'node:path'

test('project partition analysis writes JSON to stdout and its table to stderr', () => {
    const root = resolve(import.meta.dirname, '..')
    const result = spawnSync(
        process.execPath,
        [
            resolve(root, 'node_modules/tsx/dist/cli.mjs'),
            resolve(root, 'scripts/analyze-project-partition.ts'),
            resolve(root, 'doc/domains/experiential/example-infograph.yaml'),
        ],
        { cwd: root, encoding: 'utf8' }
    )

    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout) as { exclusive: { maximumEdges: number } }
    assert.equal(typeof report.exclusive.maximumEdges, 'number')
    assert.match(result.stderr, /project\s+overlap edges/)
})
