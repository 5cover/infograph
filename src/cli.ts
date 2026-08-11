import { Argument, InvalidArgumentError, Option, program } from '@commander-js/extra-typings'
import { readFileSync } from 'node:fs'
import { inspect } from 'node:util'
import * as YAML from 'yaml'
import { toGraph, toGroupedGraph, unparseEdgeKey } from './infograph.js'
import { formatInfographByEdges, formatInfographByNodes } from './input/format.js'
import { parseInfograph } from './input/index.js'
import {
    chronological,
    threadStats,
    threadToGraph,
    threadToNotes,
    type ChronologicalComplexity,
} from './queries/chronological.js'
import {
    groupByKinds,
    groupSort,
    groupTreeToGraph,
    mapGroupTree,
    type GroupRecordValue,
    type GroupTree,
} from './queries/groupby.js'
import { metrics } from './queries/metrics.js'
import { nonTrivialComponents, stronglyConnectedComponents } from './queries/scc.js'
import type { BaseKeys } from './types.js'
import { terseDate } from './terseDate.js'
import { strcmp } from './util.js'

const formats = ['json', 'yaml', 'native', 'plain'] as const
type Format = (typeof formats)[number]
const data = ['plain', 'count', 'graph:mermaid', 'graph:graphviz', 'graph:cytoscape'] as const
type Data = (typeof data)[number]
type DataKind = 'plain' | 'count' | 'graph'
type GraphFormat = Extract<Data, `graph:${string}`> extends `graph:${infer Format}` ? Format : never

const args = {
    infograph: new Argument('<file>', 'YAML or JSON infograph file'),
}

function replacer(_key: unknown, value: unknown) {
    return value instanceof Date
        ? terseDate(value)
        : value instanceof Map
          ? Object.fromEntries(value.entries())
          : value
}

const asJson = (value: unknown) => JSON.stringify(value, replacer, 2)
const asYaml = (value: unknown) =>
    new YAML.Document(value, replacer, { aliasDuplicateObjects: false }).toString({
        nullStr: '',
        lineWidth: 0,
        singleQuote: true,
    })

program
    .name('infograph')
    .description('Manipulate parsed infographs')
    .version('1.0.0')
    .addOption(new Option('-f, --format <format>', 'output syntax (pass before the subcommand)').choices(formats).default('yaml'))
    .addOption(new Option('-d, --data <data>', 'requested output data (pass before the subcommand)').choices(data).default('plain'))

program
    .command('parse')
    .description('Parse an infograph file and output the flattened graph')
    .addArgument(args.infograph)
    .action(file => {
        const infograph = readInfograph(file)
        emit(infograph, { graph: (graph, format) => toGraph(graph, graphFormat(format)) })
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
    .addOption(new Option('--notes', 'render plain thread data as presentation notes'))
    .action((file, options) => {
        const infograph = readInfograph(file)
        const thread = chronological(infograph, {
            budget: options.budget,
            complexity: getComplexityOptions(options),
            cutoff: options.cutoff,
        })
        emit(thread, {
            plain: value => (options.notes ? threadToNotes(infograph, value) : value),
            graph: (value, format) => threadToGraph(value, graphFormat(format)),
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
        emit(
            budgets.map(budget => {
                const stats = threadStats(chronological(infograph, { budget, complexity, cutoff: options.cutoff }))
                return { budget, ...stats, coverage: round(stats.nodes / infograph.nodes.size) }
            })
        )
    })

queryCommand
    .command('metrics')
    .description('Compute and display statistics about an infograph file')
    .addArgument(args.infograph)
    .action(file => emit(metrics(readInfograph(file))))

queryCommand
    .command('scc')
    .description('Display the non-trivial strongly connected components of an infograph')
    .addArgument(args.infograph)
    .action(file => {
        const infograph = readInfograph(file)
        const groups = nonTrivialComponents(infograph, stronglyConnectedComponents(infograph)).toSorted((a, b) => b.length - a.length)
        emit(groups, {
            graph: (components, format) =>
                toGroupedGraph(
                    infograph,
                    components.map((nodes, index) => ({ title: `SCC ${index + 1} — ${nodes.length} nodes`, nodes })),
                    graphFormat(format)
                ),
        })
    })

queryCommand
    .command('elements')
    .requiredOption('-v, --verb <verb>', 'The verb to filter edges by')
    .addArgument(args.infograph)
    .description('Filter edges')
    .action((file, options) => emit(readInfograph(file).edges.filter(edge => edge.verb === options.verb)))

queryCommand
    .command('groupby')
    .description('Group infograph topology around selected sites')
    .command('kind <arguments...>')
    .description('Hierarchically group edges around requested kinds (kinds followed by infograph file)')
    .addOption(
        new Option('-s, --sorted <mode>', 'sort each group alphabetically or with the funnel heuristic')
            .choices(groupSort)
            .default('alphabetical')
    )
    .action((arguments_, options) => {
        if (arguments_.length < 2) {
            throw new InvalidArgumentError('Expected at least one kind followed by an infograph file')
        }
        const file = arguments_.at(-1)!
        const kinds = arguments_.slice(0, -1)
        const infograph = readInfograph(file)
        for (const kind of kinds) {
            if (!Object.hasOwn(infograph.domain.kind, kind)) throw new InvalidArgumentError(`Unknown node kind: ${kind}`)
        }
        const edgeById = new Map(infograph.edges.map(edge => [unparseEdgeKey(edge), edge] as const))
        const groups = groupByKinds(infograph, kinds, options.sorted) as unknown as GroupTree<
            BaseKeys,
            GroupRecordValue<BaseKeys, null | number>
        >
        emit(groups, {
            count: tree =>
                mapGroupTree(tree, kinds.length, edges => {
                    const nodes = new Set<string>()
                    for (const id of edges.keys()) {
                        const edge = edgeById.get(id)
                        if (edge) {
                            nodes.add(edge.from)
                            nodes.add(edge.to)
                        }
                    }
                    return { edges: edges.size, nodes: nodes.size }
                }),
            graph: (tree, format) => groupTreeToGraph(infograph, tree, kinds.length, graphFormat(format)),
        })
    })

queryCommand
    .command('edgespace')
    .description('show possible kind/verb/kind 3-uples in a table')
    .addArgument(args.infograph)
    .action(file => {
        const domain = readInfograph(file).domain
        const verbs = Object.keys(domain.verb).toSorted()
        const kinds = Object.keys(domain.kind).toSorted()
        const rows: { from: string; verb: string; to: string }[] = []
        for (const from of kinds) for (const to of kinds) for (const verb of verbs) rows.push({ from, to, verb })
        emit(rows)
    })

queryCommand
    .command('keywords')
    .description('show keywords')
    .option('--desc', 'show descs too')
    .addArgument(args.infograph)
    .action((file, options) => {
        const entries = Object.entries(readInfograph(file).domain)
        const result = options.desc
            ? entries.map(([key, value]) => [key, Object.fromEntries(Object.entries(value).toSorted((a, b) => strcmp(a[0], b[0])))])
            : entries.map(([key, value]) => [key, Object.keys(value).toSorted()])
        emit(Object.fromEntries(result))
    })

program.parse()

function globalFormat(): Format {
    return (program.opts() as { format: Format }).format
}

function globalData(): Data {
    return (program.opts() as { data: Data }).data
}

type DataHandlers<T> = Partial<{
    plain: (value: T) => unknown
    count: (value: T) => unknown
    graph: (value: T, format: string | undefined) => unknown
}>

function emit<T>(value: T, handlers: DataHandlers<T> = {}): void {
    const [kind, argument] = globalData().split(':') as [DataKind, string | undefined]
    const transformed = handlers[kind]?.(value, argument as never) ?? defaultData(kind, value)
    if (transformed === undefined) {
        throw new InvalidArgumentError(
            `--data ${globalData()} is not supported by this command (supported: ${['plain', 'count', ...Object.keys(handlers)].filter((x, i, all) => all.indexOf(x) === i).join(', ')})`
        )
    }
    console.log(serialize(transformed))
}

function defaultData(kind: DataKind, value: unknown): unknown {
    if (kind === 'plain') return value
    if (kind === 'count') return structuralCount(value)
    return undefined
}

function serialize(value: unknown): string {
    if (globalFormat() === 'json') return asJson(value)
    if (globalFormat() === 'yaml') return asYaml(value)
    if (globalFormat() === 'native') return inspect(value)
    return flatten(value)
}

function flatten(value: unknown): string {
    return Array.isArray(value) ? value.map(flatten).join('\n\n') : String(value)
}

function structuralCount(value: unknown): unknown {
    if (Array.isArray(value)) return value.length
    if (value instanceof Set || value instanceof Map) return value.size
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, property]) => [
                key,
                Array.isArray(property) || property instanceof Set || property instanceof Map || (property !== null && typeof property === 'object' && !(property instanceof Date))
                    ? structuralSize(property)
                    : property,
            ])
        )
    }
    return value
}

function structuralSize(value: object): number {
    if (Array.isArray(value)) return value.length
    if (value instanceof Set || value instanceof Map) return value.size
    return Object.keys(value).length
}

function graphFormat(value: string | undefined): GraphFormat {
    if (value === 'mermaid' || value === 'graphviz' || value === 'cytoscape') return value
    throw new InvalidArgumentError(`Expected a graph output backend, got '${value ?? ''}'`)
}

function readInfograph(file: string) {
    return parseInfograph(YAML.parse(readFileSync(file, 'utf8')))
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
    if (!Number.isFinite(number)) throw new InvalidArgumentError(`Expected a number, got '${value}'`)
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
    if (Number.isNaN(date.valueOf())) throw new InvalidArgumentError(`Expected a date, got '${value}'`)
    return date
}
