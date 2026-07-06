Write the infograph of my apprenticeship to out/infograph.yaml

## instructions

- keep prose factual
- avoid excess or filler words
- technical words and jargon used in source material allowed. Do not artificially simplify language.
- present tense should suffice outside of special cases : avoid summaries and past tenses merely because the node is not currently active.
- present tense statements need not be true right now. Consider application in date or date range period of the current node. For edges, consider the present is the interesection of the date ranges of both nodes.
- Use past and future tenses when you find yourself needing to refer to something outside the node or edge's active time period.
- Provide accurate sources and dates where reasonably possible. A node's date isn't mandatory, but it helps. Ideally, a date period should be omitted from a node only when it makes no sense for this particular node. You are free to interpret input to provide an exact date window, but your choice of node and edge data must remain grounded in factual elements.
- identify not only neutral facts but context, tensions, errors, learnings, my mindset and posture, and other actors
- Do not center the
- write the infograph in English. Keep exact designations (proper nouns, projects, organizations, institutional designations) in their original language verbatim. For instance, do not attemt to translate "Secrétariat Général", keep it as-is. Also keep exact citations.
- Do not wrap strings to fit any max line length
- Inline markdown formatting is allowed in infograph prose (which must be a single paragraph. if you have multiple facts, or `why` justifications, put them in an array), `code` (technical identifiers), *italic* (verbatim exact expressions), [label](url) for referencing web URLs. No HTML. No bold.
- Never write em or en dashes.

## inputs

Here is the list of input sources you have access to.

- For AI chat exports, you have access to dated messages where I discuss with an AI, and deepen my understanding of subjects. Use it to retrace context and intent, not only technical details. Can help retrace intent and my situation at the time, however may contain speculative or discarded branches, so tread knowingly.
- For source code, use it as a reference on canonicl formats and behavior.

### sources

Use as sources for infograph content

filename|desc|notes|precedence
-|-|-|-
../engie/Sponsorship/**|Engie Sponsorship project repositories|has Sponsorship.wiki (wiki), Sponsorship (main), and tools (tools)|1 (canoncial source of truth about the project)|1
../engie/Legal Higlights 2/**|Legal Highlights project||2 (canoncial source of truth about the project)
journalt/**|daily YYYY-MM-DD apprenticeship work logs.||3 (main day to day information source)
ai/journalt.md|AI chat export, long chat that expands on journalt|Messages are timestamped: cross reference them with journalt entries of near days|4
facts.md|Additional facts from notes to encode as part of the infograph.|They may repeat information from above sources|5 (confirms or contextualizes)

on ambiguity (two sources provide a different answer), consider the answer from the least precedent source. However, do not fully ignore the other sources: disagreement is information; and it may be revealing a tension. Treat the other sources as advisory/contextual.

you are encouraged to explore and cross reference sources.

Start with the very first day in journalt, and explore relevant repositories as needed. You can use git commands to get the local datetime and any other information about commits.

### references

Uee for context and reference. Not direct input to the infograph.

filename|desc|notes|
-|-|-|
../infograph/README.MD|Explanation of the infograph project, what an infograph is, how to write it
../infograph/example-infographs/alt.yaml|Example infograph.|It provides an example of the structure, and good enough starting points for verbs and kinds, but you need not copy th exact prose style. The earlier instructions about prose prime over the example prose.|
../infograph/src/input/|Input infograph parsing code. Focus on the zInfographInput zod schema defined in schemas.ts. Consider kdataEdge = 'with', kdataNode = 'info', as defined in types.ts. index.ts contains validation code, complex but still useful if you want the exact rule.|
ai/infograph.md|AI chat export providing context on the rationale and development of the infograph project
stage/|daily YYYY-MM-DD internship work logs|The infograph covers the apprenticeship period, however the internship logs are provided for context in case other sources such as journalt refer to it. Only query on-demand to contextualize or resolve a reference from another source|
