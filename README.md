# Infograph

An infograph is a pragmatic, human-writable graph representation of an information corpus. It gives durable entities, facts, interpretations, events and relationships explicit identities, so that a corpus can be explored through graph queries rather than reread only as a flat sequence of documents.

The term combines information and graph. An infograph is not merely a diagram and it is not a database schema imposed on reality. It is an intermediate representation between source material and the projections produced from it.

## What an infograph contains

An infograph has three layers:

- **Nodes** represent entities that deserve independent reference. Depending on the domain, these may be people, organizations, projects, tools, events, processes, problems, requirements, objectives, decisions, methods, findings, learnings, skills, products or models.
- **Claims** record what is said about a node or relationship. Claims can distinguish facts, opinions, hypotheses, counterfactuals and other kinds of assertion instead of flattening them into one undifferentiated description.
- **Edges** represent meaningful relationships between nodes. They record structure, participation, causality, constraints, use, mitigation, rejection, verification and other domain-specific connections.

The domain vocabulary determines which kinds of nodes and relationships are available and how nearby concepts should be distinguished. A domain should be reused consistently rather than replaced by a collection of ad hoc labels.

Sources and dates are part of the representation. A node may be supported by several sources, and a synthesized node may emerge from evidence distributed across many documents. Provenance does not force the graph to have the same granularity as the source corpus.

## What an infograph is intended for

An infograph is intended for **graph-enabled projections of information corpuses**. A projection selects a relevant surface of the graph for a purpose, audience or question. The same underlying graph can therefore support different outputs without requiring the corpus to be rewritten for each one:

- a concise report of a project;
- a presentation organized around decisions and consequences;
- a chronology of events and interruptions;
- a view of recurring problems and learnings;
- a map of actors, responsibilities and organizational constraints;
- a technical explanation of tools and discovered behavior;
- a question-answering surface that can follow relationships beyond the initial summary.

A query can select nodes and edges, follow relationships, and leave other graph elements outside the active presentation surface. Those inactive elements can remain available as handles for questions, clarification and deeper discussion. A projection is therefore a view of the corpus, not the corpus itself.

For example, an apprenticeship infograph can connect a local implementation choice to the finding that motivated it, to a later decision, and to a learning that reappears in another project. A conventional project summary tends to collapse those links into separate paragraphs or omit them entirely. The graph preserves them as navigable structure.

## The method

The method is an extraction and modeling discipline:

1. **Read the corpus as evidence.** Sources are not automatically the natural units of the graph. A journal entry, document or repository file may support several nodes, while one node may be supported by fragments from many sources.
2. **Discover the trajectory.** Progress chronologically when chronology matters. Preserve attempts, interruptions, abandoned directions, prototypes and intermediate ideas when they explain later choices or recurring patterns.
3. **Identify semantic entities.** Promote a concept to a node when it has identity beyond one sentence, participates in several relationships, or makes a repeated structure visible. Keep incidental and local information in claims.
4. **Separate kinds of assertion.** Keep observed behavior distinct from appraisal, hypothesis, interpretation and personal learning. Do not present an inference as a source fact merely because it is a useful synthesis.
5. **Model relationships explicitly.** Connect work to the processes it implements, the requirements it answers, the problems it mitigates, the decisions it explains and the objectives it contributes to.
6. **Preserve provenance and uncertainty.** Cite the evidence that supports a synthesis. Represent disagreement when it reveals evolution, ambiguity or a meaningful tension. Do not invent precision that the sources do not support.
7. **Project only what is needed.** Use the graph to produce a focused representation for a particular audience or question instead of trying to expose everything at once.

The method favors semantic coverage over transcription and useful structure over atomization. It does not create one node per source fragment, one node per sentence, or one node per user story merely to increase the count. A strong graph explains connections that are difficult to see when the corpus is read file by file.

## A pragmatic representation, not a theory of reality

An infograph does **not** attempt to solve epistemology. It does not claim to provide a perfect account of truth, a final ontology of human experience, or a neutral model free from interpretation. Any representation selects, names, groups and excludes. The graph's vocabulary, granularity and relationships introduce practical modeling decisions and therefore a point of view.

The goal is not to discover the one correct graph of a corpus. The goal is to make a representation that is sufficiently faithful, explicit, inspectable and useful for the projections it must support. Sources, dates, claim types and provenance make the choices visible and revisable, but they do not turn the graph into an absolute record of reality.

This is especially important for experiential corpuses. An infograph of an apprenticeship is not a perfect ontology of human experience. It is a pragmatic way to turn the raw ore of day-to-day work into a queryable graph: preserving concrete episodes, context, judgments, technical findings, relationships, changes in posture and connections across projects so that they can be queried and projected later.

In that sense, the graph is closer to an **intermediate representation** than to a metaphysical account. It is refined enough to support useful questions and outputs, while remaining open to correction, enrichment and reinterpretation as new sources or perspectives appear.

## Projection and active surface

Think of a projection as a selected active surface of the graph. A query yields the elements relevant to the current purpose. Edges that cross between active and inactive content become handles for questions, feedback or discussion. A speaker or reader can start with a compact projection and expand it when a relationship points toward context that matters.

This lets an output remain concise without pretending that omitted information does not exist. It also lets different projections disagree in emphasis while remaining grounded in the same source-aware graph.

## Documentation map

## Programmatic API

The package also exposes an in-memory API. It accepts structured input objects or canonical `Infograph` values; reading files and choosing JSON, YAML, or plain-text output remain CLI concerns.

```ts
import { groupByKinds, parseInfograph, renderEdgeGroup, selectGroup } from 'infograph'

const infograph = parseInfograph(input)
const groups = groupByKinds(infograph, ['project', 'task'], 'funnel')
const selected = selectGroup(groups, ['project sponsorship', 'task test_flow_runtime_behavior'], 2)

if (selected?.edges) {
  const dot = renderEdgeGroup(infograph, selected.edges, {
    centers: selected.centers,
    format: 'graphviz',
  })
}
```

Use `infograph/input`, `infograph/model`, `infograph/query`, and `infograph/graph` for focused imports. The root entry re-exports the supported operations. Canonical graphs and grouping results intentionally use `Map`; applications that need a JSON wire representation can serialize them according to their own requirements.

### Generic graph retrieval

For LLM or programmatic investigation, use the read-only `select` and `traverse` APIs. They use deterministic, serializable predicates instead of executing JavaScript supplied to the CLI:

```ts
import { select, traverse } from 'infograph/query'

const decisions = select(infograph, {
  target: 'nodes',
  where: { kind: ['decision'], importance: { operator: '>=', value: 'major' } },
})
const context = traverse(infograph, { from: ['decision adopt_api'], direction: 'both', maxHops: 2 })
```

The corresponding CLI keeps YAML as the default output syntax:

```sh
infograph query select nodes corpus.yaml --kind decision --importance '>=major'
infograph query traverse corpus.yaml --from 'decision adopt_api' --direction both --max-hops 2
```

`select` supports exact identity, vocabulary, tags, sources, dates, ordinal ratings, and literal case-insensitive text matches. `traverse` performs a bounded breadth-first traversal. For custom joins, ranking, or report assembly, compose these public API results in TypeScript rather than placing JavaScript in CLI arguments.

The package also ships an agent skill at `skills/infograph-query`. A global npm install makes it available on disk; install it for Codex explicitly with `infograph skill install --agent codex`, or use `infograph skill path` to integrate the same directory with another agent host.

### Constrained editing

Use `infograph/edit` to apply a short semantic operation list without exposing the full YAML document to an agent. The CLI reads an optional changefile or standard input, validates every operation before writing, and rewrites the file in canonical node-first YAML form:

```sh
infograph edit apply corpus.yaml --dry-run <<'PATCH'
- add-claim:
    node: decision adopt_api
    claim:
      fact: The API was adopted after validation.
- add-tag:
    node: decision adopt_api
    tag: validation
PATCH
```

Run the same command without `--dry-run` to write the result. Supported operations are `add-node`, `set-node`, `add-claim`, `add-tag`, `add-edge`, `remove-edge`, and `remove-node`. Every operation names exact node keys or an exact edge triple; `remove-node` also removes all incident edges. In `set-node`, omitted fields are unchanged, `null` removes an optional field, and empty `claim`, `source`, or `tag` arrays normalize to absence.

The repository keeps the general method, domain conventions and implementation details separate:

### Modeling and domain guidance

- [Experiential domain modeling](doc/domains/experiential/modeling.md) explains how to choose node kinds and relationships, distinguish claims, preserve attribution and chronology, and decide what belongs in the graph.
- [Experiential example infograph](doc/domains/experiential/example-infograph.yaml) declares the vocabulary and shows a complete example of the domain in use.

### Input format and validation

- [JSON schema](schemas/infograph.json) defines the serialized infograph format.
- [Input types](src/input/types.ts) describes the internal input representation.
- [Input schemas](src/input/schemas.ts) contains the validation schemas.
- [Input validation](src/input/index.ts) documents and implements parsing and validation behavior.
- [Input formatting](src/input/format.ts) contains formatting support for normalized graph input.

### Queries and projections

- [Chronological queries](src/queries/chronological.ts) expose time-oriented views.
- [Grouping queries](src/queries/groupby.ts) group graph elements for projections.
- [Metrics](src/queries/metrics.ts) compute graph-level measurements.
- [Strongly connected components](src/queries/scc.ts) expose graph connectivity patterns.
- [Mermaid projections](src/mermaid.ts) render graph views as diagrams.
- [CLI commands](src/cli.ts) expose parsing, querying, formatting and projection operations.

The [tests](test/) provide executable examples of formatting, grouping and Mermaid behavior.

## Design principles

- Make important entities and relationships addressable.
- Preserve source provenance, dates, attribution and uncertainty.
- Prefer synthesized semantic entities over repeated paraphrases.
- Keep facts, findings, opinions, hypotheses and learnings distinguishable.
- Represent organizational context and business processes, not only technical implementation.
- Preserve meaningful chronology, alternatives, interruptions and abandoned directions.
- Keep local or incidental detail in claims instead of atomizing the graph.
- Treat the graph as revisable infrastructure for projections, not as a final answer about the corpus.
