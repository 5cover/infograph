---
name: infograph-query
description: Investigate an Infograph corpus with its CLI and TypeScript API, preserving graph evidence and provenance. Use for questions about nodes, claims, sources, relationships, and bounded graph context.
---

# Infograph querying

Use the Infograph CLI for normal graph investigation. It emits YAML by default; request JSON only when another tool needs JSON. If working from a checkout, invoke it as `pnpm exec tsx src/cli.ts`; use `infograph` when the package is installed globally.

## Investigation workflow

1. Inspect the graph vocabulary before making assumptions:
   ```sh
   infograph query keywords --desc corpus.yaml
   infograph query edgespace corpus.yaml
   ```
2. Narrow evidence with `select`:
   ```sh
   infograph query select nodes corpus.yaml --kind decision --importance '>=major'
   infograph query select nodes corpus.yaml --match 'claim=validation'
   infograph query select edges corpus.yaml --verb explains
   ```
3. Expand only needed context with a bounded traversal:
   ```sh
   infograph query traverse corpus.yaml --from 'decision adopt_api' --direction both --max-hops 2
   infograph query traverse corpus.yaml --from 'project alpha' --via explains --kind finding --max-hops 3
   ```

Repeated `--kind`, `--tag`, `--source`, `--via`, and identity flags are alternatives within that field. Different flags combine as constraints. Text matches are literal, case-insensitive substrings of `title`, `summary`, or `claim`; they are not semantic search.

## Evidence discipline

- Treat node and edge claims as the corpus evidence. State the node key, source, or relationship when it materially supports an answer.
- Separate what the graph says from conclusions drawn by combining results. Do not turn an opinion or hypothesis claim into a fact.
- `traverse` is breadth-first and bounded; a missing result may be outside the selected vocabulary, direction, or hop limit.

## Complex analysis

Do not pass JavaScript through CLI arguments. For a one-off calculation, create a short temporary `.mts` file that imports the public API, then run it with `pnpm exec tsx`. Read [the API recipe](references/api-recipe.md) before doing this. Prefer adding a reusable API primitive only when the operation is broadly useful and has stable semantics.

## Installation

The npm package contains this skill but a global CLI installation does not automatically register it with agents. For Codex, run:

```sh
infograph skill install --agent codex
```

For another agent, use `infograph skill path` to find this directory and load its `SKILL.md` according to that agent's skill/instruction mechanism. Read [portable agent integration](references/portable-agents.md) when configuring another host.
