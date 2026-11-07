import { code, codeBlock, escape, heading, joinBlocks, link, list, table } from 'ts-markdown-builder'
import { toGroupedGraph } from './infograph.js'
import { chronological, compareChronologicalBudgets, threadToGraph, threadToNotes } from './queries/chronological.js'
import { groupByKinds, groupTreeToGraph, summarizeGroupTree, type GroupTree } from './queries/groupby.js'
import { edgeSpace, keywordVocabulary } from './queries/inspect.js'
import { metrics } from './queries/metrics.js'
import { cyclicComponents } from './queries/scc.js'
import { select, traverse, type EdgePredicate, type NodePredicate } from './queries/select.js'
import type { BaseKeys, Infograph, InfographEdge, InfographNodeKey } from './types.js'

export type AnalyzeOptions = {
    source: { name: string; sha256: string }
    rawFormat: 'yaml' | 'json'
    budgets: number[]
    cutoff?: Date
    groupKinds: string[]
}

export type Output = { kind: 'raw'; path: string; value: unknown } | { kind: 'markdown'; path: string; text: string }

type Check = { title: string; description: string; items: string[]; raw?: string }

// Chronology budget whose thread gets the presentation notes; the CLI default.
const presentationBudget = 20

export function analyze<Keys extends BaseKeys>(infograph: Infograph<Keys>, options: AnalyzeOptions): Output[] {
    const outputs: Output[] = []
    const pages: [string, string][] = []
    const rawPath = (name: string) => `raw/${name}.${options.rawFormat}`
    const raw = (name: string, value: unknown) => {
        outputs.push({ kind: 'raw', path: rawPath(name), value })
        return rawPath(name)
    }
    const page = (name: string, title: string, description: string, blocks: (string | string[])[]) => {
        outputs.push({
            kind: 'markdown',
            path: `${name}.md`,
            text: joinBlocks([heading(title, { level: 1 }), description, ...blocks.flat()]),
        })
        pages.push([link(`${name}.md`, title), description])
    }
    const section = (title: string, blocks: (string | string[])[]) => [
        heading(title, { level: 2 }),
        ...blocks.flat(),
    ]
    const selectNodes = (where: NodePredicate<Keys>) => {
        const result = select(infograph, { target: 'nodes', where })
        return result.target === 'nodes' ? result.nodes : []
    }
    const selectEdges = (where: EdgePredicate<Keys>) => {
        const result = select(infograph, { target: 'edges', where })
        return result.target === 'edges' ? result.edges : []
    }
    const edgeText = (edge: InfographEdge<Keys>) => `${code(edge.from)} ${code(edge.verb)} ${code(edge.to)}`
    const kindOf = (key: InfographNodeKey<Keys>) => key.split(' ', 1)[0]
    const domain = infograph.domain

    const m = metrics(infograph)
    const metricsPath = raw('metrics', m)

    page(
        'summary',
        'Summary',
        'Headline figures for the whole infograph.',
        [
            table(
                ['Measure', 'Value'],
                [
                    ['Nodes', String(m.nodeCount)],
                    ['Edges', String(m.edgeCount)],
                    ['Density', String(m.density)],
                    ['Source nodes (no incoming edges)', String(m.sourceCount)],
                    ['Sink nodes (no outgoing edges)', String(m.sinkCount)],
                    ['Isolated nodes', String(m.isolatedNodeCount)],
                    ['Self-loops', String(m.selfLoopCount)],
                    ['Weakly connected components', String(m.components.count)],
                    ['Largest weakly connected component', String(m.components.largestSize)],
                    ['Non-trivial strongly connected components', String(m.stronglyConnected.nonTrivial)],
                    ['Feedback arc set size', String(m.feedbackArcSetSize)],
                    ['Undated nodes', String(m.undated.length)],
                ],
                { compact: true }
            ),
            section('Field coverage', [
                table(
                    ['Field', 'Nodes', 'Ratio'],
                    Object.entries(m.fieldCoverage).map(([field, coverage]) => [
                        code(field),
                        String(coverage.count),
                        `${Math.round(coverage.ratio * 100)}%`,
                    ]),
                    { compact: true }
                ),
            ]),
            link(metricsPath, 'Raw metrics'),
        ]
    )

    page(
        'structure',
        'Structure',
        'Distributions of kinds, verbs, ratings and degrees.',
        [
            section('Kinds', [
                table(
                    ['Kind', 'Nodes'],
                    Object.entries(m.nodesByKind).map(([kind, count]) => [code(kind), String(count)]),
                    { compact: true }
                ),
            ]),
            section('Verbs', [
                table(
                    ['Verb', 'Edges'],
                    Object.entries(m.edgesByVerb).map(([verb, count]) => [code(verb), String(count)]),
                    { compact: true }
                ),
            ]),
            section('Node importance', [
                table(
                    ['Importance', 'Nodes'],
                    Object.entries(m.nodesByImportance).map(([level, count]) => [code(level), String(count)]),
                    { compact: true }
                ),
            ]),
            section('Node complexity', [
                table(
                    ['Complexity', 'Nodes'],
                    Object.entries(m.nodesByComplexity).map(([level, count]) => [code(level), String(count)]),
                    { compact: true }
                ),
            ]),
            section('Edge complexity', [
                table(
                    ['Complexity', 'Edges'],
                    Object.entries(m.edgesByComplexity).map(([level, count]) => [code(level), String(count)]),
                    { compact: true }
                ),
            ]),
            section('Degrees', [
                table(
                    ['Measure', 'Minimum', 'Average', 'Maximum'],
                    [
                        ['Incidence', String(m.incidence.min), String(m.incidence.average), String(m.incidence.max)],
                        ['In-degree', String(m.inDegree.min), String(m.inDegree.average), String(m.inDegree.max)],
                        ['Out-degree', String(m.outDegree.min), String(m.outDegree.average), String(m.outDegree.max)],
                    ],
                    { compact: true }
                ),
            ]),
            link(metricsPath, 'Raw metrics'),
        ]
    )

    const components = cyclicComponents(infograph)
    const sccPath = raw('scc', components)
    page(
        'cycles',
        'Cycles',
        'Non-trivial strongly connected components: nodes that reach each other through edges.',
        [
            table(
                ['Measure', 'Value'],
                [
                    ['Non-trivial components', String(m.stronglyConnected.nonTrivial)],
                    ['Largest component', String(m.stronglyConnected.largestSize)],
                    ['Feedback arc set size', String(m.feedbackArcSetSize)],
                ],
                { compact: true }
            ),
            components.length === 0
                ? 'No cycles were found.'
                : components.flatMap((nodes, index) =>
                      section(`Component ${index + 1}`, [
                          list(nodes.map(key => code(key))),
                          codeBlock(
                              toGroupedGraph(infograph, [{ title: `Component ${index + 1}`, nodes }], 'mermaid'),
                              { language: 'mermaid' }
                          ),
                      ])
                  ),
            link(sccPath, 'Raw components'),
        ]
    )

    const budgets = [...new Set(options.budgets)].toSorted((a, b) => a - b)
    const chronologyBlocks: (string | string[])[] = []
    if (infograph.nodes.size === 0) {
        chronologyBlocks.push('The infograph has no nodes, so no chronological thread exists.')
    } else {
        const threads = budgets.map(budget => chronological(infograph, { budget, cutoff: options.cutoff }))
        const comparison = compareChronologicalBudgets(infograph, { budgets, cutoff: options.cutoff })
        chronologyBlocks.push(
            table(
                ['Budget', 'Root', 'Nodes', 'Edges', 'Boundary nodes', 'Boundary edges', 'Max depth', 'Coverage'],
                comparison.map((row, index) => [
                    String(row.budget),
                    code(threads[index].root),
                    String(row.nodes),
                    String(row.edges),
                    String(row.boundaryNodes),
                    String(row.boundaryEdges),
                    String(row.maxDepth),
                    `${Math.round(row.coverage * 100)}%`,
                ]),
                { compact: true }
            ),
            budgets.map((budget, index) =>
                link(raw(`chronological-${budget}`, threads[index]), `Budget ${budget} thread`)
            )
        )
        const presentation = budgets.indexOf(presentationBudget)
        if (presentation === -1) {
            chronologyBlocks.push(`Presentation notes need budget ${presentationBudget}, which is not in the requested budgets.`)
        } else {
            const thread = threads[presentation]
            chronologyBlocks.push(
                section(`Presentation at budget ${presentationBudget}`, [
                    codeBlock(threadToGraph(thread, 'mermaid'), { language: 'mermaid' }),
                    link(
                        raw(`chronological-${presentationBudget}-notes`, threadToNotes(infograph, thread)),
                        'Presentation notes'
                    ),
                ])
            )
        }
    }
    page('chronology', 'Chronology', 'Chronological threads under increasing complexity budgets.', chronologyBlocks)

    const hubs = selectNodes({ importance: { operator: '=', value: 'central' } })
    const neighborhoods = hubs.map(({ key }) => ({
        hub: key,
        result: traverse(infograph, { from: [key], direction: 'both', maxHops: 1 }),
    }))
    page(
        'hubs',
        'Hubs',
        'One-hop neighborhoods of every node rated central.',
        [
            hubs.length === 0
                ? 'No node is rated central.'
                : neighborhoods.flatMap(({ hub, result }) =>
                      section(escape(hub), [
                          result.edges.length === 0
                              ? 'No edges.'
                              : table(
                                    ['From', 'Verb', 'To'],
                                    result.edges.map(edge => [code(edge.from), code(edge.verb), code(edge.to)]),
                                    { compact: true }
                                ),
                      ])
                  ),
            link(raw('hubs', neighborhoods), 'Raw neighborhoods'),
        ]
    )

    const groupKinds = options.groupKinds.filter(kind => Object.hasOwn(domain.kind, kind))
    const skipped = options.groupKinds.filter(kind => !groupKinds.includes(kind))
    const groupBlocks: (string | string[])[] = skipped.length
        ? [`Not declared by this domain, so skipped: ${skipped.map(kind => code(kind)).join(', ')}.`]
        : []
    if (groupKinds.length === 0) {
        groupBlocks.push('No requested grouping kind is declared by this domain.')
    } else {
        const tree = groupByKinds(infograph, groupKinds)
        const summary = summarizeGroupTree(infograph, tree)
        const rendered = groupTreeToGraph(infograph, tree, 'mermaid')
        const summaries = scopes(summary.tree)
        const graphs = scopes(rendered)
        groupBlocks.push(
            link(raw(`groupby-${groupKinds.join('-')}`, tree), 'Raw groupings'),
            summaries.length === 0
                ? 'No edges are grouped.'
                : table(
                      ['Scope', 'Edges', 'Nodes'],
                      summaries.map(scope => [
                          scope.centers.length ? code(scope.centers.join(' > ')) : 'Unassigned',
                          String(scope.value.edges),
                          String(scope.value.nodes),
                      ]),
                      { compact: true }
                  ),
            summaries.flatMap((scope, index) =>
                section(scope.centers.length ? escape(scope.centers.join(' > ')) : 'Unassigned', [
                    codeBlock(graphs[index].value, { language: 'mermaid' }),
                ])
            )
        )
    }
    page(
        'groups',
        'Groups',
        `Edges grouped hierarchically by ${groupKinds.length ? groupKinds.join(', ') : 'no kind'}.`,
        groupBlocks
    )

    const space = edgeSpace(domain)
    const usedTriples = new Set(
        infograph.edges.map(edge => `${kindOf(edge.from)} ${edge.verb} ${kindOf(edge.to)}`)
    ).size
    const declaredSources = (Object.keys(domain.source) as Keys['source'][]).toSorted()
    page(
        'vocabulary',
        'Vocabulary',
        'Declared kinds, verbs and sources, with how often the graph uses each.',
        [
            `${usedTriples} of ${space.length} possible kind-verb-kind triples are used.`,
            section('Kinds', [
                table(
                    ['Kind', 'Nodes', 'Definition'],
                    (Object.keys(domain.kind) as Keys['kind'][])
                        .toSorted()
                        .map(kind => [code(kind), String(m.nodesByKind[kind] ?? 0), escape(domain.kind[kind]?.desc ?? '')]),
                    { compact: true }
                ),
            ]),
            section('Verbs', [
                table(
                    ['Verb', 'Edges', 'Definition'],
                    (Object.keys(domain.verb) as Keys['verb'][])
                        .toSorted()
                        .map(verb => [code(verb), String(m.edgesByVerb[verb] ?? 0), escape(domain.verb[verb]?.desc ?? '')]),
                    { compact: true }
                ),
            ]),
            section('Sources', [
                declaredSources.length === 0
                    ? 'No sources are declared.'
                    : table(
                          ['Source', 'Nodes', 'Definition'],
                          declaredSources.map(source => [
                              code(source),
                              String(selectNodes({ source: [source] }).length),
                              escape(domain.source[source]?.desc ?? ''),
                          ]),
                          { compact: true }
                      ),
            ]),
            link(raw('keywords', keywordVocabulary(domain, { descriptions: true })), 'Raw keywords'),
            link(raw('edgespace', space), 'Raw possible triples'),
        ]
    )

    const touched = new Set(infograph.edges.flatMap(edge => [edge.from, edge.to]))
    const allTechnical = selectNodes({ technicality: { operator: '=', value: 'all' } })
    const generic: Check[] = [
        {
            title: 'Undated nodes',
            description: 'Nodes without a date. Chronology cannot place them.',
            items: m.undated.map(key => code(key)),
        },
        {
            title: 'Isolated nodes',
            description: 'Nodes with no incident edge.',
            items: [...infograph.nodes.keys()].filter(key => !touched.has(key)).map(key => code(key)),
        },
        {
            title: 'Nodes without a source',
            description: 'Nodes that do not cite where they come from.',
            items: [...infograph.nodes].filter(([, node]) => node.source === undefined).map(([key]) => code(key)),
        },
        {
            title: 'Nodes rated all technical',
            description: 'Technicality rated all. Rare by design: usually an under-modeled element.',
            items: allTechnical.map(({ key }) => code(key)),
            raw: raw('select-technicality-all', allTechnical),
        },
        {
            title: 'Intertwined nodes of major or central importance',
            description: 'Hard to explain and important to the account: the most costly places in a presentation.',
            items: selectNodes({
                complexity: { operator: '=', value: 'intertwined' },
                importance: { operator: '>=', value: 'major' },
            }).map(({ key }) => code(key)),
        },
    ]

    const guidance: Check[] = []
    if (Object.hasOwn(domain.kind, '-')) {
        const fallbackKinds = selectNodes({ kind: ['-'] as Keys['kind'][] })
        guidance.push({
            title: 'Fallback kinds',
            description: 'Nodes using the fallback kind. Each is a debt marker to resolve.',
            items: fallbackKinds.map(({ key }) => code(key)),
            raw: raw('select-fallback-kinds', fallbackKinds),
        })
    }
    if (Object.hasOwn(domain.verb, '-')) {
        const fallbackVerbs = selectEdges({ verb: ['-'] as Keys['verb'][] })
        guidance.push({
            title: 'Fallback verbs',
            description: 'Edges using the fallback verb. Each is a debt marker to resolve.',
            items: fallbackVerbs.map(edgeText),
            raw: raw('select-fallback-verbs', fallbackVerbs),
        })
    }
    if (
        Object.hasOwn(domain.kind, 'challenge') &&
        Object.hasOwn(domain.verb, 'mitigates') &&
        Object.hasOwn(domain.verb, 'anticipates')
    ) {
        const challenges = selectNodes({ kind: ['challenge'] as Keys['kind'][] })
        const responses = challenges.map(({ key }) => ({
            challenge: key,
            result: traverse(infograph, {
                from: [key],
                direction: 'in',
                maxHops: 1,
                edge: { verb: ['mitigates', 'anticipates'] as Keys['verb'][] },
            }),
        }))
        guidance.push({
            title: 'Challenges without a response',
            description: 'Challenges that nothing mitigates or anticipates. Such a challenge is a constraint or a claim.',
            items: responses.filter(({ result }) => result.nodes.length === 1).map(({ challenge }) => code(challenge)),
            raw: raw('traverse-challenge-responses', responses),
        })
    }
    if (Object.hasOwn(domain.kind, 'finding')) {
        const findings = selectNodes({ kind: ['finding'] as Keys['kind'][] })
        const referents = findings.map(({ key }) => ({
            finding: key,
            result: traverse(infograph, { from: [key], direction: 'in', maxHops: 1 }),
        }))
        guidance.push({
            title: 'Findings without a referent',
            description: 'Findings that no other element points at. A finding earns a node only when something points at it.',
            items: referents.filter(({ result }) => result.nodes.length === 1).map(({ finding }) => code(finding)),
            raw: raw('traverse-finding-referents', referents),
        })
    }

    const checkBlocks = (checks: Check[], label: string) =>
        checks.flatMap(check =>
            section(`${check.title}${label}`, [
                check.description,
                check.items.length === 0 ? 'None.' : list(check.items),
                ...(check.raw === undefined ? [] : [link(check.raw, 'Raw query output')]),
            ])
        )
    page(
        'attention',
        'Attention',
        'Nodes and edges that the graph itself flags for review.',
        [
            ...checkBlocks(generic, ''),
            ...checkBlocks(guidance, ' (domain guidance)'),
        ]
    )

    const title = infograph.info?.title ?? options.source.name
    const facts: string[][] = [
        ['Source file', code(options.source.name)],
        ['SHA-256', code(options.source.sha256)],
        ['Nodes', String(m.nodeCount)],
        ['Edges', String(m.edgeCount)],
    ]
    if (infograph.info?.author) facts.push(['Author', escape(infograph.info.author)])
    if (infograph.info?.context) facts.push(['Context', escape(infograph.info.context)])
    outputs.push({
        kind: 'markdown',
        path: 'index.md',
        text: joinBlocks([
            heading(escape(title), { level: 1 }),
            table(['Field', 'Value'], facts, { compact: true }),
            table(['Page', 'Contents'], pages, { compact: true }),
            `Raw query outputs are in raw/ as ${options.rawFormat} files.`,
        ]),
    })

    return outputs
}

type Scope<T> = { centers: string[]; value: T }

// Flatten a group tree into one entry per scope that owns edges, in tree order.
function scopes<T>(tree: GroupTree<BaseKeys, T>, centers: string[] = []): Scope<T>[] {
    const own: Scope<T>[] = tree.edges === undefined ? [] : [{ centers, value: tree.edges }]
    const children = tree.nodes ? [...tree.nodes].flatMap(([key, child]) => scopes(child, [...centers, key])) : []
    return [...own, ...children]
}
