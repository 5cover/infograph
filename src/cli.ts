import { InvalidArgumentError, Option, program } from '@commander-js/extra-typings'
import { readFileSync } from 'node:fs'
import * as YAML from 'js-yaml'
import { parseInfograph } from './input/index.js'
import { chronological, threadToMermaid, type ChronologicalComplexity } from './queries/chronological.js'
import { metrics } from './queries/metrics.js'
import { nonTrivialComponents, stronglyConnectedComponents } from './queries/scc.js'
import { toMermaid, toMermaidGrouped } from './infograph.js'
import type { BaseKeys, Infograph } from './types.js'

type Format = 'json' | 'yaml' | 'mermaid'

const asJson = (value: unknown) => JSON.stringify(value, null, 2)
const asYaml = (value: unknown) => YAML.dump(value)

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

program
    .command('chronological')
    .description('Run the chronological query profile on an infograph file')
    .argument('<file>', 'YAML or JSON infograph file')
    .addOption(new Option('-b, --budget <number>', 'branch complexity budget').default(20).argParser(parseNumber))
    .addOption(new Option('--simple <number>', 'cost of simple complexity').argParser(parseNumber))
    .addOption(new Option('--natural <number>', 'cost of natural complexity').argParser(parseNumber))
    .addOption(new Option('--contextual <number>', 'cost of contextual complexity').argParser(parseNumber))
    .addOption(new Option('--intertwined <number>', 'cost of intertwined complexity').argParser(parseNumber))
    .action((file, options) => {
        const infograph = readInfograph(file)
        const complexity = getComplexityOptions(options)
        const thread = chronological(infograph, {
            budget: options.budget,
            complexity,
        })

        emit(globalFormat(), thread, {
            json: asJson,
            yaml: asYaml,
            mermaid: threadToMermaid,
        })
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
    return parseInfograph(YAML.load(readFileSync(file, 'utf8')))
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

    return Object.keys(complexity).length ? complexity : undefined
}

function parseNumber(value: string) {
    const number = Number(value)
    if (!Number.isFinite(number)) {
        throw new InvalidArgumentError(`Expected a number, got '${value}'`)
    }
    return number
}
