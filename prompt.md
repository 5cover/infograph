
instructions

- keep prose factual
- avoid excess or filler words
- technical words and jargon used in source material allowed. Do not artificially simplify language.
- present tense should suffice outside of special cases : avoid summaries and past tenses merely because the node is not currently active.
- present tense statements need not be true right now. Consider application in date or date range period of the current node. For edges, consider the present is the interesection of the date ranges of both nodes.
- Use past and future tenses when you find yourself needing to refer to something outside the node or edge's active time period.

inputs for infograph content

directory|desc|notes
-|-|-
journalt|daily YYYY-MM-DD work logs
../engie/Sponsorship|Engie Sponsorship project repositories|has Sponsorship.wiki (wiki), Sponsorship (main), and tools (tools)
../engie/Legal Higlights 2|Legal Highlights project
ai/journalt.md

Start with the first day in journalt, and explore relevant repositories as needed. You can use git commands to get the local datetime and any other information about commits.

references for context about infographs. Not direct input, but information on what they are, how to write them

filename|desc|notes
-|-|-
../infograph/README.MD|Explanation of the infograph project
../infograph/example-infographs/alt.yaml|Example infograph.
../infograph/src/input/|Input infograph parsing code. Focus on the zInfographInput zod schema defined in schemas.ts. Consider kdataEdge = 'with', kdataNode = 'info', as defined in types.ts. index.ts contains validation code, complex but still useful if you want the exact rule
ai/infograph.md|AI chat export providing context on the rationale and development of the infograph project
