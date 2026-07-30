import { InvalidArgumentError, Option, program } from '@commander-js/extra-typings'
import { readFileSync } from 'node:fs'
import * as YAML from 'yaml'
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
import { toMermaid, toMermaidGrouped } from './infograph.js'
import type { BaseKeys, Infograph } from './types.js'
import { terseDate } from './terseDate.js'

type Format = 'json' | 'yaml' | 'mermaid'

const asJson = (value: unknown) => JSON.stringify(value, null, 2)
const asYaml = (value: unknown) =>
    new YAML.Document(value, (key: unknown, value: unknown) => (value instanceof Date ? terseDate(value) : value), {
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
            .choices(['json', 'yaml', 'mermaid'])
            .default('json')
    )

program
    .command('parse')
    .description('Parse an infograph file and output the flattened graph')
    .argument('<file>', 'YAML or JSON infograph file')
    .action(file => {
        const infograph = readInfograph(file)
        emit(globalFormat(), infograph, {
            json: g => asJson(toJsonInfograph(g)),
            yaml: g => asYaml(toJsonInfograph(g)),
            mermaid: g => toMermaid(g),
        })
    })

const chronologicalCmd = program
    .command('chronological')
    .description('Chronological query profiles (see the run and stats subcommands)')

chronologicalCmd
    .command('run')
    .description('Run the chronological query profile on an infograph file')
    .argument('<file>', 'YAML or JSON infograph file')
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

        emit(globalFormat(), thread, {
            json: t => asJson(notes(t)),
            yaml: t => asYaml(notes(t)),
            mermaid: threadToMermaid,
        })
    })

chronologicalCmd
    .command('stats')
    .description('Compare chronological projections across multiple budgets')
    .argument('<file>', 'YAML or JSON infograph file')
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

        emit(globalFormat(), rows, { json: asJson, yaml: asYaml }, asJson)
    })

program
    .command('metrics')
    .description('Compute and display statistics about an infograph file')
    .argument('<file>', 'YAML or JSON infograph file')
    .action(file => {
        const infograph = readInfograph(file)
        emit(globalFormat(), metrics(infograph), { json: asJson, yaml: asYaml }, asJson)
    })

program
    .command('scc')
    .description('Display the non-trivial strongly connected components of an infograph')
    .argument('<file>', 'YAML or JSON infograph file')
    .action(file => {
        const infograph = readInfograph(file)
        const groups = nonTrivialComponents(infograph, stronglyConnectedComponents(infograph)).sort(
            (a, b) => b.length - a.length
        )

        emit(globalFormat(), groups, {
            json: asJson,
            yaml: asYaml,
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

program.parse()

function globalFormat(): Format {
    return (program.opts() as { format: Format }).format
}

function emit<T>(
    format: Format,
    value: T,
    handlers: Partial<Record<Format, (value: T) => string>>,
    fallback?: (value: T) => string
): void {
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
