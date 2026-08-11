import { Argument, InvalidArgumentError, Option, program } from '@commander-js/extra-typings'
import { readFileSync } from 'node:fs'
import * as YAML from 'yaml'
import { formatInfographByEdges, formatInfographByNodes } from './input/format.js'
import { parseInfograph } from './input/index.js'
import {
    chronological,
    threadStats,
    threadToGraph,
    threadToNotes,
    type ChronologicalComplexity,
    type ChronologicalThread,
} from './queries/chronological.js'
import { metrics } from './queries/metrics.js'
import { nonTrivialComponents, stronglyConnectedComponents } from './queries/scc.js'
import {
    groupBySites,
    groupRecordToGraph,
    groupSort,
    type GroupRecordValue,
} from './queries/groupby.js'
import { parseEdgeKey, parseNodeKey, subgraphFilterEdges, toGraph, toGroupedGraph, unparseEdgeKey, unparseNodeKey } from './infograph.js'
import type { BaseKeys, Infograph, InfographNodeKey } from './types.js'
import { terseDate } from './terseDate.js'
import { strcmp } from './util.js'
import { inspect } from 'node:util'

const formats = ['json', 'yaml', 'mermaid', 'graphviz', 'cytoscape', 'native'] as const
type Format = (typeof formats)[number]

const args = {
    infograph: new Argument('<file>', 'YAML or JSON infograph file'),
}

function replacer(_key: unknown, value: unknown) {
    return value instanceof Date
        ? terseDate(value)
        : value instanceof Map
          ? Object.fromEntries(value.entries().map(([k, v]): [unknown, unknown] => [k, replacer(k, v)]))
          : value
}

const asJson = (value: unknown) => JSON.stringify(value, replacer, 2)
const asYaml = (value: unknown) =>
    new YAML.Document(value, replacer, {
        aliasDuplicateObjects: false,
    }).toString({
        nullStr: '',
        lineWidth: 0,
        singleQuote: true,
    })

program
    .name('infograph')
    .description('Manipulate parsed infographs')
    .version('1.0.0')
    .addOption(
        new Option('-f, --format <format>', 'output format (pass before the subcommand)')
            .choices(formats)
            .default('yaml')
    )

program
    .command('parse')
    .description('Parse an infograph file and output the flattened graph')
    .addArgument(args.infograph)
    .action(file => {
        const infograph = readInfograph(file)
        emit(infograph, {
            json: g => asJson(toJsonInfograph(g)),
            yaml: g => asYaml(toJsonInfograph(g)),
            mermaid: g => toGraph(g, 'mermaid'),
            graphviz: g => toGraph(g, 'graphviz'),
            cytoscape: g => toGraph(g, 'cytoscape'),
        })
    })

const formatCommand = program.command('format').description('Rewrite an infograph')

formatCommand
    .command('nodes')
    .description('nodes first')
    .addArgument(args.infograph)
    .action(file => emit(formatInfographByNodes(readInfograph(file))))

formatCommand
    .command('edges')
    .description('edges first')
    .addArgument(args.infograph)
    .action(file => emit(formatInfographByEdges(readInfograph(file))))

const queryCommand = program.command('query').description('run a query on the infograph')

const chronologicalCmd = queryCommand
    .command('chronological')
    .description('Chronological query profiles (see the run and stats subcommands)')

chronologicalCmd
    .command('run')
    .addArgument(args.infograph)
    .description('Run the chronological query profile on an infograph file')

    .addOption(new Option('-b, --budget <number>', 'branch complexity budget').default(20).argParser(parseNumber))
    .addOption(new Option('--simple <number>', 'cost of simple complexity').argParser(parseNumber))
    .addOption(new Option('--natural <number>', 'cost of natural complexity').argParser(parseNumber))
    .addOption(new Option('--contextual <number>', 'cost of contextual complexity').argParser(parseNumber))
    .addOption(new Option('--intertwined <number>', 'cost of intertwined complexity').argParser(parseNumber))
    .addOption(new Option('--cutoff <date>', 'only root at a node dated on or after this date').argParser(parseDate))
    .addOption(new Option('--notes', 'render json/yaml as a readable presentation-notes document'))
    .action((file, options) => {
        const infograph = readInfograph(file)
        const complexity = getComplexityOptions(options)
        const thread = chronological(infograph, {
            budget: options.budget,
            complexity,
            cutoff: options.cutoff,
        })

        const maynotes = (t: ChronologicalThread<BaseKeys>) => (options.notes ? threadToNotes(infograph, t) : t)

        emit(thread, {
            json: t => asJson(maynotes(t)),
            yaml: t => asYaml(maynotes(t)),
            mermaid: t => threadToGraph(t, 'mermaid'),
            graphviz: t => threadToGraph(t, 'graphviz'),
            cytoscape: t => threadToGraph(t, 'cytoscape'),
        })
    })

chronologicalCmd
    .command('stats')
    .description('Compare chronological projections across multiple budgets')
    .addArgument(args.infograph)
    .addOption(
        new Option('-b, --budget <number>', 'branch complexity budget (repeatable)')
            .argParser(collectNumber)
            .default([] as number[])
    )
    .addOption(new Option('--simple <number>', 'cost of simple complexity').argParser(parseNumber))
    .addOption(new Option('--natural <number>', 'cost of natural complexity').argParser(parseNumber))
    .addOption(new Option('--contextual <number>', 'cost of contextual complexity').argParser(parseNumber))
    .addOption(new Option('--intertwined <number>', 'cost of intertwined complexity').argParser(parseNumber))
    .addOption(new Option('--cutoff <date>', 'only root at a node dated on or after this date').argParser(parseDate))
    .action((file, options) => {
        const infograph = readInfograph(file)
        const complexity = getComplexityOptions(options)
        const budgets = options.budget.length ? options.budget : [20]

        const rows = budgets.map(budget => {
            const thread = chronological(infograph, { budget, complexity, cutoff: options.cutoff })
            const stats = threadStats(thread)
            return { budget, ...stats, coverage: round(stats.nodes / infograph.nodes.size) }
        })

        emit(rows)
    })

queryCommand
    .command('metrics')
    .description('Compute and display statistics about an infograph file')
    .addArgument(args.infograph)
    .action(file => {
        const infograph = readInfograph(file)
        emit(metrics(infograph))
    })

queryCommand
    .command('scc')
    .description('Display the non-trivial strongly connected components of an infograph')
    .addArgument(args.infograph)
    .action(file => {
        const infograph = readInfograph(file)
        const groups = nonTrivialComponents(infograph, stronglyConnectedComponents(infograph)).sort(
            (a, b) => b.length - a.length
        )

        emit(groups, {
            mermaid: g =>
                toGroupedGraph(
                    infograph,
                    g.map((component, index) => ({
                        title: `SCC ${index + 1} — ${component.length} nodes`,
                        nodes: component,
                    })),
                    'mermaid'
                ),
            graphviz: g =>
                toGroupedGraph(
                    infograph,
                    g.map((component, index) => ({
                        title: `SCC ${index + 1} — ${component.length} nodes`,
                        nodes: component,
                    })),
                    'graphviz'
                ),
            cytoscape: g =>
                toGroupedGraph(
                    infograph,
                    g.map((component, index) => ({
                        title: `SCC ${index + 1} — ${component.length} nodes`,
                        nodes: component,
                    })),
                    'cytoscape'
                ),
        })
    })

queryCommand
    .command('elements')
    .requiredOption('-v, --verb <verb>', 'The verb to filter edges by')
    .addArgument(args.infograph)
    .description('Filter edges')
    .action((file, opts) => {
        const infograph = readInfograph(file)
        emit(infograph.edges.filter(e => e.verb === opts.verb))
    })

const groupbyCommand = queryCommand
    .command('groupby')
    .option('-c,--count')
    .description('Group infograph topology around selected sites')
groupbyCommand
    .command('kind <kind1> <kind2>')
    .description('Group edges around nodes of these kinds using edge Voronoi partitioning')
    .addArgument(args.infograph)
    .addOption(
        new Option('-s, --sorted <mode>', 'sort each group alphabetically or with the funnel heuristic')
            .choices(groupSort)
            .default('alphabetical')
    )
    .action((kind1, kind2, file, o, c) => {
        let infograph = readInfograph(file)
        infograph = subgraphFilterEdges(infograph, e => e.verb !== 'involves' || e.to !== 'actor me')
        const sites1 = infograph.nodes
            .keys()
            .filter(node => parseNodeKey(node).kind === kind1)
            .toArray()
        const sites2 = infograph.nodes
            .keys()
            .filter(node => parseNodeKey(node).kind === kind2)
            .toArray()

        const emitCount = c.optsWithGlobals().count

        const groupedBySite1 = groupBySites(infograph, { sorted: o.sorted, inputSites: sites1 })

        const groupSite2 = <T>(transform: (v2: GroupRecordValue<BaseKeys, unknown>) => T) =>
            new Map(
                groupedBySite1.entries().flatMap(([k1, v1]): [string, T][] => {
                    const subinfograph = subgraphFilterEdges(infograph, e => v1.has(unparseEdgeKey(e)))
                    const inputSites = sites2.filter(e => subinfograph.nodes.has(e))
                    if (!inputSites.length) return [[`${k1}>*`, transform(v1)]]
                    const groups: Map<string, GroupRecordValue<BaseKeys, unknown>> = groupBySites(subinfograph, {
                        sorted: o.sorted,
                        allowUnreachable: true,
                        inputSites,
                    })
                    const nonempty = groups.entries().filter(([, v2]) => v2.size)
                    const result = nonempty.map(([k2, v2]): [string, T] => [`${k1}>${k2}`, transform(v2)]).toArray()
                    if (!result.length) return [[`${k1}>*`, transform(v1)]]
                    return result
                })
            )

        if (emitCount) {
            const result = groupSite2(v2 => v2)
            emit(result, {
                mermaid: g => groupRecordToGraph(infograph, g, 'mermaid'),
                graphviz: g => groupRecordToGraph(infograph, g, 'graphviz'),
                cytoscape: g => groupRecordToGraph(infograph, g, 'cytoscape'),
            })
        } else {
            emit(
                groupSite2(v2 => {
                    const nodes = new Set<string>()
                    for (const ek of v2.keys()) {
                        const e = parseEdgeKey(ek)
                        nodes.add(unparseNodeKey(e.from))
                        nodes.add(unparseNodeKey(e.to))
                    }
                    return { edges: v2.size, nodes: nodes.size }
                })
            )
        }
    })

queryCommand
    .command('edgespace')
    .description('show possible kind/verb/kind 3-uples in a table')
    .addArgument(args.infograph)
    .action(file => {
        const domain = readInfograph(file).domain
        const verbs = Object.keys(domain.verb).sort()
        const kinds = Object.keys(domain.kind).sort()
        const result: { from: string; verb: string; to: string }[] = []
        for (const from of kinds) {
            for (const to of kinds) {
                for (const verb of verbs) {
                    result.push({ from, to, verb })
                }
            }
        }
        console.table(result)
    })

queryCommand
    .command('keywords')
    .description('show keywords')
    .option('--desc', 'show descs too')
    .addArgument(args.infograph)
    .action((file, opts) => {
        const d = Object.entries(readInfograph(file).domain)
        const entries = opts.desc
            ? d.map(([k, v]) => [k, Object.fromEntries(Object.entries(v).sort((a, b) => strcmp(a[0], b[0])))])
            : d.map(([k, v]) => [k, Object.keys(v).sort()])
        emit(Object.fromEntries(entries))
    })

program.parse()

function globalFormat(): Format {
    return (program.opts() as { format: Format }).format
}

function emit<T>(
    value: T,
    handlers?: Partial<Record<Format, (value: T) => string>>,
    fallback?: (value: T) => string
): void {
    const format = globalFormat()
    handlers = { native: x => inspect(x), json: asJson, yaml: asYaml, ...handlers }
    const handler = handlers[format] ?? fallback
    if (!handler) {
        throw new InvalidArgumentError(
            `--format ${format} is not supported by this command (supported: ${Object.keys(handlers).join(', ')})`
        )
    }
    console.log(handler(value))
}

function readInfograph(file: string) {
    return parseInfograph(YAML.parse(readFileSync(file, 'utf8')))
}

function toJsonInfograph<Keys extends BaseKeys>(infograph: Infograph<Keys>) {
    return {
        ...infograph,
        nodes: Object.fromEntries(infograph.nodes),
    }
}

function getComplexityOptions(options: {
    simple?: number
    natural?: number
    contextual?: number
    intertwined?: number
}) {
    const complexity: ChronologicalComplexity = {}
    if (options.simple !== undefined) complexity.simple = options.simple
    if (options.natural !== undefined) complexity.natural = options.natural
    if (options.contextual !== undefined) complexity.contextual = options.contextual
    if (options.intertwined !== undefined) complexity.intertwined = options.intertwined
    return complexity
}

function parseNumber(value: string) {
    const number = Number(value)
    if (!Number.isFinite(number)) {
        throw new InvalidArgumentError(`Expected a number, got '${value}'`)
    }
    return number
}

function collectNumber(value: string, previous: number[]) {
    return [...previous, parseNumber(value)]
}

function round(value: number) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0
}

function parseDate(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.valueOf())) {
        throw new InvalidArgumentError(`Expected a date, got '${value}'`)
    }
    return date
}
