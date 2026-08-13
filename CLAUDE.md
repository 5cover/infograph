# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Infograph structures information, experiences and their relationships in a factual, human-writable, language-agnostic graph. A query profile traverses that graph under restrictions (e.g. a complexity budget) to produce a simplified "presentation surface" — a subset of nodes/edges usable for reports, writeups or presentations. Edges crossing the active/inactive boundary become "handles" for Q&A or deeper dives.

## Commands

There is no build/lint/test setup. TypeScript runs directly via **tsx** (not installed as a dependency — invoked through `npx`). Plain `node src/*.ts` fails because the code uses directory imports (`./input`) that only tsx's resolver handles.

- Run the CLI: `npx tsx src/cli.ts [-f json|yaml|native|plain] [-d plain|count|graph:mermaid|graph:graphviz|graph:cytoscape] <command> <file>`
  - The global `-f, --format` option selects syntax and `-d, --data` selects the requested data; both go **before** the subcommand. `emit()` first transforms the query result by data mode, then serializes it in the selected form.
  - `parse <file>` — flattened canonical graph, or one graph string with a `graph:*` data mode.
  - `query chronological run <file> [--budget N] [--simple N --natural N --contextual N --intertwined N]` — traversal thread, or a rendered graph. `--notes` changes plain thread data into the readable notes document.
  - `metrics <file>` — graph statistics (JSON/YAML).
  - `query scc <file>` — non-trivial strongly connected components, or one graph with a visual group per SCC.
  - `query groupby kind <kind...> <file>` — hierarchically groups edges by one or more node kinds. Each scope keeps its own edges and its next-level center nodes; `count` gives matching summaries and `graph:*` matching graph strings.
  - Mermaid, Graphviz DOT, and Cytoscape are rendered from the common `GraphDiagram` model in `src/graph.ts`.
- Regenerate the JSON Schema: `npx tsx scripts/schemas.ts` (writes `schemas/infograph.json` from the zod schema — the schema is derived, never hand-edit it).
- Analyze a one-project-per-edge nearest-site partition: `pnpm exec tsx scripts/analyze-project-partition.ts <infograph-file>` (JSON to stdout, comparison table to stderr).
- Typecheck: `npx tsc --noEmit`. Note tsx runs code by stripping types without checking them, so run `tsc` explicitly to catch type errors.
- Package manager is **pnpm** (`pnpm@11.9.0`).

Domains live under `doc/domains/<name>/`. Each holds `example-infograph.yaml` (the canonical `kind`/`verb`/`source` vocabulary with definitions in `desc`, plus an illustrative graph) and `modeling.md` (prose guidance: keyword disambiguations, modeling patterns, rating scales). The only domain so far is `experiential`, for representing lived professional experience.

Example input lives in `doc/domains/experiential/example-infograph.yaml`; its first line references `schemas/infograph.json` for editor validation.

## Architecture

Data flows: **human-writable YAML/JSON → validated & flattened canonical `Infograph` → query profile → simplified output.**

There are two distinct type layers — do not conflate them:

- **Input types** (`src/input/types.ts`, `src/input/schemas.ts`): what a human writes. Ergonomic and nested — outgoing edges are written _inside_ their source node keyed by verb, nodes can be defined inline at the far end of an edge, values use the "flexarray" convention (`T | T[]`), and dates are strings.
- **Canonical types** (`src/types.ts`): the normalized model everything downstream consumes. `Infograph<Keys>` has a closed `domain` vocabulary (`kind` / `verb` / `source`), a `nodes` **Map** keyed by `` `${kind} ${id}` ``, and a flat `edges` array. Flexarrays are expanded to arrays; dates are `Date` ranges (`{from, to}`).

The conversion between the two layers is the heart of the codebase, in `src/input/index.ts` (`parseInfograph`), a single zod `.pipe(z.transform(...))`:

- Recursively walks nested input nodes, **flattening** them into the canonical `nodes` Map. Nested/inline node keys carry their parent chain: `` `kind id < parentkind parentid` `` (see `flattenNodeKey`).
- Hoists inline outgoing edges into the flat `edges` array.
- Verifies references against the closed vocabulary (`kind`, `verb`, `source`) and validates date strings. Node-existence checks are **deferred** (collected in `deferredChecks`, run after all nodes are built) because an edge may reference a node defined later.
- Reserved keys distinguish structure from data: `kdataNode = 'info'` (node payload) and `kdataEdge = 'with'` (edge payload). The `verbPattern` regex explicitly excludes these two words, so any other key on a node is treated as a verb / outgoing-edge group.

`src/queries/chronological.ts` is a query profile: minimum-cost reachability from a chosen root under a per-path "explanation complexity" budget (node + edge complexity, with a configurable cost per `Complexity` level). It uses Dijkstra-style relaxation so a later cheaper path can replace an earlier route. Root selection and equal-cost candidate ordering are date-first. Add new query profiles as sibling files here.

`src/graph.ts` defines a backend-neutral graph construction API; `src/infograph.ts` projects canonical infographs into that model.

`src/cli.ts` is the commander-based entry point wiring files → `parseInfograph` → query profiles → JSON.

## Conventions

- `tsconfig.json` sets `verbatimModuleSyntax: true` and `strict: true` — import types with `import type`, and keep null-safety strict.
- Node kinds, verbs, and sources form a **closed vocabulary** declared under `domain`; the parser rejects any reference outside it. When extending the model, update `domain` and the zod schema together.
