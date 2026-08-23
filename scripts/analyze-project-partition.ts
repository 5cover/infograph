import { readFileSync } from 'node:fs'
import * as YAML from 'yaml'
import { parseInfograph } from '../src/input/index.js'
import { parseNodeKey, unparseEdgeKey } from '../src/infograph.js'
import { groupBySites, partitionBySites } from '../src/queries/groupby.js'
import type { BaseKeys, InfographEdgeKey } from '../src/types.js'
import { strcmp } from '../src/util.js'

const [file, ...rest] = process.argv.slice(2)
if (file === undefined || rest.length) {
    process.stderr.write('Usage: pnpm exec tsx scripts/analyze-project-partition.ts <infograph-file>\n')
    process.exitCode = 1
} else {
    const infograph = parseInfograph(YAML.parse(readFileSync(file, 'utf8')))
    const projects = infograph.nodes
        .keys()
        .filter(key => parseNodeKey(key).kind === 'project')
        .toArray()
        .toSorted(strcmp)
    const overlapping = groupBySites(infograph, { inputSites: projects, allowUnreachable: true })
    const partition = partitionBySites(infograph, { inputSites: projects })
    const edgeById = new Map(infograph.edges.map(edge => [unparseEdgeKey(edge), edge] as const))
    const counts = (edges: Iterable<InfographEdgeKey<BaseKeys>>) => {
        const nodes = new Set<string>()
        let edgeCount = 0
        for (const id of edges) {
            const edge = edgeById.get(id)
            if (edge) {
                edgeCount++
                nodes.add(edge.from)
                nodes.add(edge.to)
            }
        }
        return { edges: edgeCount, nodes: nodes.size }
    }
    const rows = projects.map(project => ({
        project,
        overlapping: counts(overlapping.get(project)?.keys() ?? []),
        exclusive: counts(partition.groups.get(project)?.keys() ?? []),
        tiedCandidates: [...partition.candidates.values()].filter(
            candidates => candidates.length > 1 && candidates.includes(project)
        ).length,
    }))
    const membershipCounts = new Map<number, number>()
    for (const candidates of partition.candidates.values()) {
        membershipCounts.set(candidates.length, (membershipCounts.get(candidates.length) ?? 0) + 1)
    }
    const totalMemberships = [...partition.candidates.values()].reduce(
        (total, candidates) => total + candidates.length,
        0
    )
    const edgeAssignments = Object.fromEntries(
        [...partition.candidates.entries()]
            .toSorted(([a], [b]) => strcmp(a, b))
            .map(([edge, nearestProjects]) => [edge, { nearestProjects, project: partition.assignment.get(edge) }])
    )
    const report = {
        input: {
            nodes: infograph.nodes.size,
            edges: infograph.edges.length,
            projects: projects.length,
            reachableEdges: partition.assignment.size,
            unreachableEdges: partition.unreachable,
        },
        overlapping: {
            totalMemberships,
            uniqueEdges: partition.candidates.size,
            duplicatePlacements: totalMemberships - partition.candidates.size,
            duplicationFactor: partition.candidates.size ? totalMemberships / partition.candidates.size : 0,
            membershipHistogram: Object.fromEntries([...membershipCounts.entries()].toSorted(([a], [b]) => a - b)),
        },
        exclusive: {
            maximumEdges: partition.maximumEdges,
            groups: rows,
            edgeAssignments,
        },
    }

    writeTable(rows)
    process.stderr.write(
        `\nOverlap: ${report.overlapping.totalMemberships} memberships for ${report.overlapping.uniqueEdges} reachable edges; ` +
            `${report.overlapping.duplicatePlacements} duplicate placements (${report.overlapping.duplicationFactor.toFixed(2)}x).\n` +
            `Exclusive nearest-edge partition: at most ${partition.maximumEdges} edges per project.\n` +
            (partition.unreachable.length
                ? `${partition.unreachable.length} edge(s) unreachable from every project.\n`
                : '')
    )
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}

function writeTable(
    rows: {
        project: string
        overlapping: { edges: number; nodes: number }
        exclusive: { edges: number; nodes: number }
        tiedCandidates: number
    }[]
) {
    const table = [
        ['project', 'overlap edges', 'overlap nodes', 'exclusive edges', 'exclusive nodes', 'tied candidates'],
        ...rows.map(row => [
            row.project,
            String(row.overlapping.edges),
            String(row.overlapping.nodes),
            String(row.exclusive.edges),
            String(row.exclusive.nodes),
            String(row.tiedCandidates),
        ]),
    ]
    const widths = table[0].map((_, column) => Math.max(...table.map(row => row[column].length)))
    process.stderr.write(
        table
            .map((row, index) => {
                const line = row.map((value, column) => value.padEnd(widths[column])).join('  ')
                return index === 1 ? `${'-'.repeat(line.length)}\n${line}` : line
            })
            .join('\n') + '\n'
    )
}
