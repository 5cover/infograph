# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Infograph structures information, experiences and their relationships in a factual, human-writable, language-agnostic graph. A query profile traverses that graph under restrictions (e.g. a complexity budget) to produce a simplified "presentation surface" — a subset of nodes/edges usable for reports, writeups or presentations. Edges crossing the active/inactive boundary become "handles" for Q&A or deeper dives.

## Commands

There is no build/lint/test setup. TypeScript runs directly via **tsx** (not installed as a dependency — invoked through `npx`). Plain `node src/*.ts` fails because the code uses directory imports (`./input`) that only tsx's resolver handles.

- Run the CLI: `npx tsx src/cli.ts [-f json|yaml|mermaid] <command> <file>`
  - The global `-f, --format` option is read from `program.opts()` and goes **before** the subcommand. Each command supports a subset (see `emit()` in `src/cli.ts`); `metrics` falls back to `json` for unsupported values.
  - `parse <file>` — flattened graph as JSON/YAML, or `toMermaid` for mermaid.
  - `chronological <file> [--budget N] [--simple N --natural N --contextual N --intertwined N]` — traversal thread as JSON/YAML, or `threadToMermaid` for mermaid.
  - `metrics <file>` — graph statistics (JSON/YAML).
  - `scc <file>` — non-trivial strongly connected components as a JSON/YAML list, or one Mermaid flowchart with a subgraph per SCC.
  - Mermaid is built with the **mermaid-ast** library (`src/mermaid.ts` holds the shared `sanitizeId`; `toMermaid`/`toMermaidGrouped` live in `src/infograph.ts`).
- Regenerate the JSON Schema: `npx tsx scripts/schemas.ts` (writes `schemas/infograph.json` from the zod schema — the schema is derived, never hand-edit it).
- Typecheck: `npx tsc --noEmit`. Note tsx runs code by stripping types without checking them, so run `tsc` explicitly to catch type errors.
- Package manager is **pnpm** (`pnpm@11.9.0`).

Example input lives in `example-infographs/alt.yaml`; its first line references `schemas/infograph.json` for editor validation.

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

`src/queries/chronological.ts` is a query profile: a DFS from a chosen root that accumulates a per-branch "explanation complexity" cost (node + edge complexity, with a configurable cost per `Complexity` level and a `missing` default) and stops descending a branch once the budget is exceeded. Root selection and candidate ordering are date-first. Add new query profiles as sibling files here.

`src/infograph.ts` renders a canonical `Infograph` to a Mermaid `flowchart`.

`src/cli.ts` is the commander-based entry point wiring files → `parseInfograph` → query profiles → JSON.

## Conventions

- `tsconfig.json` sets `verbatimModuleSyntax: true` and `strict: true` — import types with `import type`, and keep null-safety strict.
- Node kinds, verbs, and sources form a **closed vocabulary** declared under `domain`; the parser rejects any reference outside it. When extending the model, update `domain` and the zod schema together.
