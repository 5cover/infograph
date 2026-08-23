import {
    Argument,
    Command,
    InvalidArgumentError,
    Option,
    type OptionValues,
    program,
} from '@commander-js/extra-typings'
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { inspect } from 'node:util'
import * as YAML from 'yaml'
import { toGraph, toGroupedGraph } from './infograph.js'
import { formatInfographByEdges, formatInfographByNodes } from './input/format.js'
import { parseInfograph } from './input/index.js'
import { applyEdits, parseEdits } from './edit.js'
import {
    chronological,
    compareChronologicalBudgets,
    threadToGraph,
    threadToNotes,
    type ChronologicalComplexity,
} from './queries/chronological.js'
import {
    groupByKinds,
    groupSort,
    groupTreeToGraph,
    summarizeGroupTree,
    type GroupRecordValue,
    type GroupTree,
} from './queries/groupby.js'
import { metrics } from './queries/metrics.js'
import { cyclicComponents } from './queries/scc.js'
import { edgeSpace, edgesWithVerb, keywordVocabulary } from './queries/inspect.js'
import { select, traverse, type EdgePredicate, type NodePredicate, type TextMatch } from './queries/select.js'
import { complexity, importance, technicality, type BaseKeys } from './types.js'
import { terseDate } from './terseDate.js'

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
    return value instanceof Date ? terseDate(value) : value instanceof Map ? Object.fromEntries(value.entries()) : value
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
    .addOption(
        new Option('-f, --format <format>', 'output syntax (pass before the subcommand)')
            .choices(formats)
            .default('yaml')
    )
    .addOption(
        new Option('-d, --data <data>', 'requested output data (pass before the subcommand)')
            .choices(data)
            .default('plain')
    )

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

const editCommand = program.command('edit').description('Apply constrained semantic edits to an infograph')
editCommand
    .command('apply')
    .description('Apply a YAML/JSON operation list from an optional file or standard input')
    .addArgument(args.infograph)
    .addArgument(new Argument('[changefile]', 'YAML or JSON operation list; omit to read standard input'))
    .option('--dry-run', 'validate and summarize without writing')
    .action((file, changefile, options) => {
        const edits = parseEdits(YAML.parse(readEditInput(changefile)))
        const result = applyEdits(readInfograph(file), edits)
        if (!options.dryRun) writeInfograph(file, result.infograph)
        emit({
            dryRun: Boolean(options.dryRun),
            changes: result.changes,
            nodeCount: result.nodeCount,
            edgeCount: result.edgeCount,
        })
    })

const skillCommand = program.command('skill').description('Locate or install the bundled agent skill')
skillCommand
    .command('path')
    .description('Print the bundled Infograph query skill directory')
    .action(() => emit({ path: bundledSkillPath() }))
skillCommand
    .command('install')
    .description('Install the bundled skill into an agent skill directory')
    .addOption(new Option('--agent <agent>', 'agent skill convention').choices(['codex']).default('codex'))
    .option('--path <directory>', 'parent directory for installed skills')
    .action(options => {
        const parent = options.path ?? resolve(process.env.CODEX_HOME ?? resolve(homedir(), '.codex'), 'skills')
        const destination = resolve(parent, 'infograph-query')
        if (existsSync(destination)) throw new InvalidArgumentError(`Skill already exists: ${destination}`)
        mkdirSync(parent, { recursive: true })
        cpSync(bundledSkillPath(), destination, { recursive: true, force: false, errorOnExist: true })
        emit({ installed: destination })
    })

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
        emit(compareChronologicalBudgets(infograph, { budgets, complexity, cutoff: options.cutoff }))
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
        const groups = cyclicComponents(infograph)
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
    .action((file, options) => emit(edgesWithVerb(readInfograph(file), options.verb)))

const selectCommand = queryCommand
    .command('select')
    .description('Select graph nodes or edges with declarative predicates')
const selectNodesCommand = addNodePredicateOptions(
    selectCommand.command('nodes').description('Select nodes').addArgument(args.infograph)
)
selectNodesCommand.action((file, options) => {
    const infograph = readInfograph(file)
    emit(select(infograph, { target: 'nodes', where: nodePredicate(infograph, options) }))
})
const selectEdgesCommand = addEdgePredicateOptions(
    selectCommand.command('edges').description('Select edges').addArgument(args.infograph)
)
selectEdgesCommand.action((file, options) => {
    const infograph = readInfograph(file)
    emit(select(infograph, { target: 'edges', where: edgePredicate(infograph, options) }))
})

const traverseCommand = queryCommand
    .command('traverse')
    .description('Traverse from one or more nodes through a bounded neighborhood')
    .addArgument(args.infograph)
    .requiredOption('--from <node-key>', 'root node key (repeatable)', collectString, [] as string[])
    .addOption(new Option('--direction <direction>', 'edge direction').choices(['in', 'out', 'both']).default('out'))
    .addOption(
        new Option('--max-hops <number>', 'maximum number of edges from each root')
            .default(1)
            .argParser(parsePositiveInteger)
    )
    .option('--via <verb>', 'allow an edge verb at every hop (repeatable)', collectString, [] as string[])
const configuredTraverseCommand = addNodePredicateOptions(traverseCommand)
configuredTraverseCommand.action((file, options) => {
    const infograph = readInfograph(file)
    const from = options.from as string[]
    for (const key of from) verifyNodeKey(infograph, key)
    const verbs = options.via as string[]
    verifyVocabulary(infograph, 'verb', verbs)
    emit(
        traverse(infograph, {
            from: from as never,
            direction: options.direction,
            maxHops: options.maxHops,
            node: nodePredicate(infograph, options),
            edge: verbs.length === 0 ? undefined : { verb: verbs },
        })
    )
})

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
            if (!Object.hasOwn(infograph.domain.kind, kind))
                throw new InvalidArgumentError(`Unknown node kind: ${kind}`)
        }
        const groups = groupByKinds(infograph, kinds, options.sorted) as unknown as GroupTree<
            BaseKeys,
            GroupRecordValue<BaseKeys, null | number>
        >

        emit(groups, {
            count: tree => {
                return summarizeGroupTree(infograph, tree)
            },
            graph: (tree, format) => groupTreeToGraph(infograph, tree, graphFormat(format)),
        })
    })

queryCommand
    .command('edgespace')
    .description('show possible kind/verb/kind 3-uples in a table')
    .addArgument(args.infograph)
    .action(file => emit(edgeSpace(readInfograph(file).domain)))

queryCommand
    .command('keywords')
    .description('show keywords')
    .option('--desc', 'show descs too')
    .addArgument(args.infograph)
    .action((file, options) => emit(keywordVocabulary(readInfograph(file).domain, { descriptions: options.desc })))

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
                Array.isArray(property) ||
                property instanceof Set ||
                property instanceof Map ||
                (property !== null && typeof property === 'object' && !(property instanceof Date))
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

function readEditInput(changefile: string | undefined) {
    return readFileSync(changefile ?? 0, 'utf8')
}

function writeInfograph(file: string, infograph: ReturnType<typeof readInfograph>) {
    const destination = resolve(file)
    const temporary = `${destination}.${randomUUID()}.tmp`
    try {
        writeFileSync(temporary, asYaml(formatInfographByNodes(infograph)))
        renameSync(temporary, destination)
    } finally {
        if (existsSync(temporary)) unlinkSync(temporary)
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
    if (!Number.isFinite(number)) throw new InvalidArgumentError(`Expected a number, got '${value}'`)
    return number
}

function collectNumber(value: string, previous: number[]) {
    return [...previous, parseNumber(value)]
}

function parseDate(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.valueOf())) throw new InvalidArgumentError(`Expected a date, got '${value}'`)
    return date
}

function parsePositiveInteger(value: string) {
    const number = Number(value)
    if (!Number.isInteger(number) || number < 1)
        throw new InvalidArgumentError(`Expected a positive integer, got '${value}'`)
    return number
}

function collectString(value: string, previous: string[]) {
    return [...previous, value]
}

function addNodePredicateOptions<
    Args extends unknown[],
    Options extends OptionValues,
    GlobalOptions extends OptionValues,
>(command: Command<Args, Options, GlobalOptions>) {
    return command
        .option('--key <node-key>', 'match an exact node key (repeatable)', collectString, [] as string[])
        .option('--kind <kind>', 'match a node kind (repeatable)', collectString, [] as string[])
        .option('--tag <tag>', 'match any node tag (repeatable)', collectString, [] as string[])
        .option('--source <source>', 'match any node source (repeatable)', collectString, [] as string[])
        .option('--importance <comparison>', 'compare importance, e.g. >=major', parseComparison)
        .option('--complexity <comparison>', 'compare complexity, e.g. <=natural', parseComparison)
        .option('--technicality <comparison>', 'compare technicality, e.g. =some', parseComparison)
        .option('--date-from <date>', 'match dates ending on or after this date', parseDate)
        .option('--date-to <date>', 'match dates starting on or before this date', parseDate)
        .option(
            '--match <field=literal>',
            'case-insensitive text match in title, summary, or claim (repeatable)',
            collectMatch,
            [] as TextMatch[]
        )
}

function addEdgePredicateOptions<
    Args extends unknown[],
    Options extends OptionValues,
    GlobalOptions extends OptionValues,
>(command: Command<Args, Options, GlobalOptions>) {
    return command
        .option('--from <node-key>', 'match an exact source node key (repeatable)', collectString, [] as string[])
        .option('--to <node-key>', 'match an exact target node key (repeatable)', collectString, [] as string[])
        .option('--verb <verb>', 'match an edge verb (repeatable)', collectString, [] as string[])
        .option('--complexity <comparison>', 'compare complexity, e.g. <=natural', parseComparison)
        .option('--technicality <comparison>', 'compare technicality, e.g. =some', parseComparison)
        .option(
            '--match <literal>',
            'case-insensitive match in edge claim content (repeatable)',
            collectEdgeMatch,
            [] as { value: string }[]
        )
}

function nodePredicate(infograph: ReturnType<typeof readInfograph>, options: Record<string, unknown>): NodePredicate {
    const keys = stringOption(options, 'key')
    for (const key of keys) verifyNodeKey(infograph, key)
    const kinds = stringOption(options, 'kind')
    const sources = stringOption(options, 'source')
    verifyVocabulary(infograph, 'kind', kinds)
    verifyVocabulary(infograph, 'source', sources)
    return {
        key: keys as never,
        kind: kinds as never,
        tag: stringOption(options, 'tag'),
        source: sources as never,
        importance: levelComparison(options, 'importance', importance),
        complexity: levelComparison(options, 'complexity', complexity),
        technicality: levelComparison(options, 'technicality', technicality),
        date: dateRange(options),
        match: options.match as TextMatch[],
    }
}

function edgePredicate(infograph: ReturnType<typeof readInfograph>, options: Record<string, unknown>): EdgePredicate {
    const from = stringOption(options, 'from')
    const to = stringOption(options, 'to')
    const verbs = stringOption(options, 'verb')
    for (const key of [...from, ...to]) verifyNodeKey(infograph, key)
    verifyVocabulary(infograph, 'verb', verbs)
    return {
        from: from as never,
        to: to as never,
        verb: verbs as never,
        complexity: levelComparison(options, 'complexity', complexity),
        technicality: levelComparison(options, 'technicality', technicality),
        match: options.match as { value: string }[],
    }
}

function stringOption(options: Record<string, unknown>, name: string): string[] {
    const value = options[name]
    return Array.isArray(value) ? (value as string[]) : []
}

function dateRange(options: Record<string, unknown>) {
    const from = options.dateFrom as Date | undefined
    const to = options.dateTo as Date | undefined
    if (from !== undefined && to !== undefined && from > to) {
        throw new InvalidArgumentError('--date-from must not be after --date-to')
    }
    return from === undefined && to === undefined ? undefined : { from, to }
}

function parseComparison(value: string) {
    const match = /^(=|!=|<=|>=|<|>)([a-z]+)$/.exec(value)
    if (match === null) throw new InvalidArgumentError(`Expected a comparison such as '>=major', got '${value}'`)
    return { operator: match[1], value: match[2] }
}

function levelComparison<T extends string>(options: Record<string, unknown>, name: string, values: readonly T[]) {
    const comparison = options[name] as { operator: string; value: string } | undefined
    if (comparison === undefined) return undefined
    if (!values.includes(comparison.value as T)) {
        throw new InvalidArgumentError(`Expected ${name} level (${values.join(', ')}), got '${comparison.value}'`)
    }
    return comparison as { operator: '=' | '!=' | '<' | '<=' | '>' | '>='; value: T }
}

function collectMatch(value: string, previous: TextMatch[]) {
    const separator = value.indexOf('=')
    if (separator < 1 || separator === value.length - 1) {
        throw new InvalidArgumentError(`Expected a text match such as 'title=decision', got '${value}'`)
    }
    const field = value.slice(0, separator)
    if (field !== 'title' && field !== 'summary' && field !== 'claim') {
        throw new InvalidArgumentError(`Unknown text field '${field}' (expected title, summary, or claim)`)
    }
    return [...previous, { field: field as TextMatch['field'], value: value.slice(separator + 1) }]
}

function collectEdgeMatch(value: string, previous: { value: string }[]) {
    if (value.length === 0) throw new InvalidArgumentError('Edge text match cannot be empty')
    return [...previous, { value }]
}

function verifyVocabulary(
    infograph: ReturnType<typeof readInfograph>,
    vocabulary: 'kind' | 'verb' | 'source',
    values: readonly string[]
) {
    for (const value of values) {
        if (!Object.hasOwn(infograph.domain[vocabulary], value))
            throw new InvalidArgumentError(`Unknown ${vocabulary}: ${value}`)
    }
}

function verifyNodeKey(infograph: ReturnType<typeof readInfograph>, key: string) {
    if (!infograph.nodes.has(key as never)) throw new InvalidArgumentError(`Unknown node key: ${key}`)
}

function bundledSkillPath() {
    return fileURLToPath(new URL('../skills/infograph-query/', import.meta.url))
}
