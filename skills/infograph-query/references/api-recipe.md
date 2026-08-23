# Complex query API recipe

The public API works on a parsed in-memory Infograph. File reading and YAML parsing deliberately remain application concerns.

Create a temporary `query.mts` near the corpus or in a temporary directory:

```ts
import { readFileSync } from 'node:fs'
import * as YAML from 'yaml'
import { parseInfograph } from 'infograph/input'
import { select, traverse } from 'infograph/query'

const graph = parseInfograph(YAML.parse(readFileSync(process.argv[2]!, 'utf8')))
const decisions = select(graph, {
  target: 'nodes',
  where: { kind: ['decision'], match: [{ field: 'claim', value: 'validation' }] },
})

const context = decisions.nodes.flatMap(
  ({ key }) => traverse(graph, { from: [key], direction: 'both', maxHops: 2 }).nodes
)
console.log(JSON.stringify({ decisions, context }, null, 2))
```

Run the script with `pnpm exec tsx query.mts corpus.yaml`. Use the typed `select` and `traverse` inputs for graph retrieval, then use ordinary TypeScript to join, rank, format, or otherwise compose the returned records. Keep source/claim attribution attached to any final conclusion.
