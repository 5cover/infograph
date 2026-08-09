import { Argument, InvalidArgumentError, Option, program } from '@commander-js/extra-typings'
import { readFileSync } from 'node:fs'
import * as YAML from 'yaml'
import { formatInfographByEdges, formatInfographByNodes } from './input/format.js'
import { parseInfograph } from './input/index.js'
import {
    chronological,
    threadStats,
    threadToMermaid,
    threadToNotes,
    type ChronologicalComplexity,
    type ChronologicalThread,
} from './queries/chronological.js'
import { metrics } from './queries/metrics.js'
import { nonTrivialComponents, stronglyConnectedComponents } from './queries/scc.js'
import { groupBySites, groupRecordToMermaid } from './queries/groupby.js'
import { toMermaid, toMermaidGrouped } from './infograph.js'
import type { BaseKeys, Infograph } from './types.js'
import { terseDate } from './terseDate.js'
import { strcmp } from './util.js'

const formats = ['json', 'yaml', 'mermaid'] as const
type Format = (typeof formats)[number]

const args = {
    infograph: new Argument('<file>', 'YAML or JSON infograph file'),
}

const asJson = (value: unknown) => JSON.stringify(value, null, 2)
const asYaml = (value: unknown) =>
    new YAML.Document(value, (_key: unknown, value: unknown) => (value instanceof Date ? terseDate(value) : value), {
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
            mermaid: g => toMermaid(g),
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

        const notes = (t: ChronologicalThread<BaseKeys>) => (options.notes ? threadToNotes(infograph, t) : t)

        emit(thread, {
            json: t => asJson(notes(t)),
            yaml: t => asYaml(notes(t)),
            mermaid: threadToMermaid,
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
                toMermaidGrouped(
                    infograph,
                    g.map((component, index) => ({
                        title: `SCC ${index + 1} — ${component.length} nodes`,
                        nodes: component,
                    }))
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
    .command('kind <kind>')
    .description('Group edges around project nodes using edge Voronoi partitioning')
    .addArgument(args.infograph)
    .action((kind, file, _, c) => {
        const infograph = readInfograph(file)
        const sites = [...infograph.nodes.keys()].filter(node => node.startsWith(kind + ' '))
        const groups = groupBySites(infograph, sites)
        if (c.optsWithGlobals().count) {
            emit(Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])))
        } else {
            emit(groups, { mermaid: g => groupRecordToMermaid(infograph, groups) })
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
    handlers = { json: asJson, yaml: asYaml, ...handlers }
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
