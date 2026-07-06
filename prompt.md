Write the infograph of my apprenticeship to out/infograph.yaml

## instructions

- keep natural language factual
- avoid excess or filler words
- technical words and jargon used in source material allowed. Do not artificially simplify language.
- present tense should suffice outside of special cases : avoid summaries and past tenses merely because the node is not currently active.
- Natural-language facts should generally be written in the present tense relative to the node or edge period, not relative to today. Consider application in date or date range period of the current node. For edges, consider the present is the interesection of the date ranges of both nodes.
- Use past and future tenses when you find yourself needing to refer to something outside the node or edge's active time period.
- Provide accurate sources and dates. When date precision is unclear, use the smallest honest period rather than inventing precision. Prefer month-level periods over exact dates when only the month is supported. A node's date isn't mandatory, but it helps. Ideally, a date period should be omitted from a node only when it makes no sense for this particular node. You are free to interpret input to provide an exact date window, but your choice of node and edge data must remain grounded in factual elements.
- Encode all relevant stable information needed to understand the apprenticeship: facts, context, tensions, errors, learnings, mindset, posture, and roles played by other actors. Do not try to exhaustively encode every implementation detail.
- write the infograph in English. Do not translate technical identifiers, exact field names, workflow names, team names, institutional labels, or quoted business terms. For instance, do not attemt to translate "Secrétariat Général", keep it as-is. Also keep exact citations.
- Do not wrap strings to fit any max line length
- Some Markdown inline formatting in natural language. Use `code` for exact technical identifiers, filenames, field names, flow names, API names, commands, or schema keys. Use *italic* for verbatim human or business expressions from the sources. No other formatting is allowed.
- Never write em or en dashes.

## inputs

Here is the list of input sources you have access to.

- For AI chat exports, you have access to dated messages where I discuss with an AI, and deepen my understanding of subjects. Use it to retrace context and intent, not only technical details. Can help retrace intent and my situation at the time, however may contain speculative or discarded branches, so tread knowingly. The AI chat export is not a chronological log of work. It is a record of the progressive refinement of understanding.
- Repositories are canonical for implementation structure and behavior.
- Journalt is canonical for day-to-day experience, context, blockers, intent and learning.

For information density:

- high: Information is already highly structured. Prefer extracting canonical facts over reinterpretation.
- medium: Information is mostly factual but may require synthesis across entries.
- low: Information is dominated by exploratory iterative reasoning, reformulations and convergence. Focus on stable conclusions rather than discussion volume or recurring wording. Repetition usually reflects refinement of understanding rather than importance.

Do not treat repetition as evidence of importance.

### sources

Use as sources for infograph content.

precedence|information density|filename|desc|notes
-|-|-|-|-
1|high|facts.md|Additional facts from notes to encode as part of the infograph.|facts.md is already a filtered source of assertions and modelling cues. Use it to guide what should be represented, but validate or contextualize important claims against journalt and repositories when possible. They may repeat information from sorces above.
2|high|../engie/Sponsorship/**|Engie Sponsorship project repositories|has Sponsorship.wiki (wiki), Sponsorship (main), and tools (tools)|1 (canoncial source of truth about the project)
3|high|../engie/Legal Higlights 2/**|Legal Highlights project
4|medium|journalt/**|daily YYYY-MM-DD apprenticeship work logs.|main day to day information source
5|low|ai/journalt.md|AI chat export, long chat that expands on journalt|Messages are timestamped: cross reference them with journalt entries of near days

When sources disagree, prefer the source with the lowest precedence number. Still preserve disagreement when it reveals a meaningful tension, evolution, or uncertainty.

you are encouraged to explore and cross reference sources.

Start from the very first day in journalt and progress chronologically. Build your understanding incrementally, as a human reader would. Discover projects, concepts and actors progressively rather than reconstructing the final understanding immediately. Explore repositories and other sources on demand as they become relevant to the current context.

Resist the temptation to reconstruct the final mental model too early. Let recurring evidence gradually justify new nodes, relationships and abstractions.

### references

Uee for context and reference. Not direct input to the infograph.

Provided in the order you should need them.

precedence|information density|filename|desc|notes
-|-|-|-|-
1|high|directives.md|Directives to guide extraction
2|high|../infograph/README.MD|Explanation of the infograph project, what an infograph is, how to write it
3|high|../infograph/example-infographs/alt.yaml|Example infograph.|It provides an example of the structure, and good enough starting points for verbs and kinds, but you need not copy the exact natural language style.
4|medium-high|../infograph/src/input/**|Input infograph parsing code. Focus on the zInfographInput Zod schema defined in schemas.ts. Consider kdataEdge = 'with', kdataNode = 'info', as defined in types.ts. index.ts contains validation code, complex but still useful if you want the exact rule. Schema descriptions contain information
5|medium|stage/*|daily YYYY-MM-DD internship work logs|The infograph covers the apprenticeship period, however the internship logs are provided for context in case other sources such as journalt refer to it. Only query on-demand to contextualize or resolve a reference from another source
6|low|ai/infograph.md|AI chat export providing context on the rationale and development of the infograph project
