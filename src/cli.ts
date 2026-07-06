import { InvalidArgumentError, Option } from '@commander-js/extra-typings'
import { readFileSync } from 'node:fs'
import * as YAML from 'js-yaml'
import { parseInfograph } from './input'
import { chronological, type ChronologicalComplexity } from './queries/chronological'
import { metrics } from './queries/metrics'
import type { BaseKeys, Infograph } from './types'
import { program } from 'commander'

program.name('infograph').description('Manipulate parsed infographs').version('1.0.0')

program
    .command('parse')
    .description('Parse an infograph file and output the flattened graph as JSON')
    .argument('<file>', 'YAML or JSON infograph file')
    .action(file => {
        const infograph = readInfograph(file)
        writeJson(toJsonInfograph(infograph))
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
    .addOption(new Option('--missing <number>', 'cost of missing complexity').argParser(parseNumber))
    .action((file, options) => {
        const infograph = readInfograph(file)
        const complexity = getComplexityOptions(options)
        const thread = chronological(infograph, {
            budget: options.budget,
            complexity,
        })

        writeJson(thread)
    })

program
    .command('metrics')
    .description('Compute and display statistics about an infograph file')
    .argument('<file>', 'YAML or JSON infograph file')
    .action(file => {
        const infograph = readInfograph(file)
        writeJson(metrics(infograph))
    })

program.parse()

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
    missing?: number
}) {
    const complexity: ChronologicalComplexity = {}

    if (options.simple !== undefined) complexity.simple = options.simple
    if (options.natural !== undefined) complexity.natural = options.natural
    if (options.contextual !== undefined) complexity.contextual = options.contextual
    if (options.intertwined !== undefined) complexity.intertwined = options.intertwined
    if (options.missing !== undefined) complexity.missing = options.missing

    return Object.keys(complexity).length ? complexity : undefined
}

function parseNumber(value: string) {
    const number = Number(value)
    if (!Number.isFinite(number)) {
        throw new InvalidArgumentError(`Expected a number, got '${value}'`)
    }
    return number
}

function writeJson(value: unknown) {
    console.log(JSON.stringify(value, null, 2))
}
