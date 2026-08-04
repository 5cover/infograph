# The `experiential` domain

Kinds and verbs for representing lived professional experience: work, the conditions it happened under, what was discovered, decided and learned.

This is the domain the infograph was created for. Its vocabulary is declared in [`example-infograph.yaml`](./example-infograph.yaml), which is authoritative: each kind, verb and source carries its definition in `desc`, and the nodes there illustrate usage. This document holds the prose that a `desc` cannot: what the domain is for, how to choose between nearby keywords, recurring modeling patterns, and how to use the rating scales.

Use this file as the modeling reference in prompts. Use the yaml as the vocabulary the graph must validate against.

## Contents

- [What the domain is for](#what-the-domain-is-for)
- [Vocabulary](#vocabulary)
- [Voice and attribution](#voice-and-attribution)
- [Rating scales](#rating-scales)
- [Choosing between keywords](#choosing-between-keywords)
- [Modeling patterns](#modeling-patterns)
- [What stays out of the graph](#what-stays-out-of-the-graph)

## What the domain is for

The domain assumes a first-person corpus: a journal, project artifacts, conversations, documentation. It is built to answer questions of the form *what happened, under what conditions, why did it go that way, what did I learn, and what can I show*.

Three design commitments follow, and they explain most of the choices below.

**The conditions matter as much as the work.** In a real corpus the important fact is frequently not what was done but what made it difficult or narrowed the options. `constraint`, `problem`, `challenge` and `finding` exist so those conditions can carry edges instead of being buried in prose.

**Knowledge is an output.** Much of the value of an experience is what was discovered, not only what was delivered. `finding`, `model` and `learning` give discovered behavior, structural interpretation and personal progression each a place, and `produces` and `verifies` connect them to the work that established them.

**Not everything deserves a node.** The graph is a presentation surface, not an archive. A projection selects a subset; edges crossing the boundary become discussion openings. That only works if nodes are things worth navigating to. Most detail belongs in `claim`, `summary` and `tag`.

## Vocabulary

Nineteen kinds and eighteen verbs, including one fallback each.

**Kinds.** `project` `task` `product` `tool` `constraint` `finding` `event` `decision` `requirement` `objective` `problem` `challenge` `method` `process` `model` `learning` `actor` `jargon` `-`

**Verbs.** `contains` `uses` `produces` `requires` `verifies` `explains` `illustrates` `constrains` `anticipates` `mitigates` `prevents` `rejects` `replaces` `contributes` `systematizes` `involves` `participates` `-`

A verb does not need to make sense with every pair of kinds, and a kind does not need to support every verb. But a kind should participate naturally in several relations, and a verb should work across several combinations. A keyword that only supports one predetermined triplet is too specialized.

The two `-` fallbacks exist to prevent schema pressure. Prefer a fallback over stretching another keyword past its definition, and state in a claim what remains unresolved: a fallback is a debt marker, and it should be auditable.

## Voice and attribution

Natural-language content preserves attribution rather than manufacturing a neutral tone. Prefer active voice when the acting entity is known and relevant. Use `I` when a claim explicitly belongs to the author, especially for opinions, hypotheses, preferences, experiences and reflections. Use neutral wording when the statement describes the element independently of any perspective.

- `fact: Antoine tested the application with real requests.` The actor is known and materially relevant.
- `opinion: I find the resulting authoring experience unnecessarily exhausting.` The judgment belongs to the author and should not be disguised as a property of the world.
- `fact: Several classes of errors are validated only when a flow is published or executed.` Neutral wording is right: this describes platform behavior, not a person's action.
- Avoid `fact: The application was tested with real requests.` when the sources identify who tested it and that matters.

Do not use passive voice to sound formal. Conversely, do not force `I` into every claim: the graph is written from the author's perspective, but many statements concern systems, events and other people directly.

Rule of thumb:

- Is the acting entity known and relevant? Name it, active voice.
- Does this express my experience, judgment or interpretation? Use `I`.
- Does it describe the element independently of any actor? Neutral wording.

## Rating scales

Four reason-shaped fields, each an `is` value with a `why`. Only `complexity` is required.

### `complexity` (required)

How hard the element is to **explain**: `simple`, `natural`, `contextual`, `intertwined`.

Some relationships are harder to explain than the things they connect, which is why edges carry it too.

### `importance` (optional)

How much the element matters to the account: `minor`, `useful`, `major`, `central`.

Do not confuse "often written about in the sources" with "central". A journal over-represents whatever was frustrating on the day.

### `technicality` (optional)

How much technical background a reader needs, as a proportion of the understanding available to them:

| Value | Meaning |
| --- | --- |
| `none` | No part of understanding requires technical knowledge. |
| `some` | Most understanding requires none; some parts are conditioned by it. |
| `most` | Most understanding is conditioned by technical knowledge, but an accessible framing exists. |
| `all` | No part can be conveyed without technical grounding. |

`technicality` and `complexity` are independent axes and must not leak into each other. `complexity` asks how hard this is to explain; `technicality` asks how much background the reader needs. A discovered behavior can be trivial to state and useless to a non-technical reader; a business lifecycle can be intertwined to explain and perfectly accessible.

`all` should be rare. Reaching for it is usually a signal that the element is under-modeled rather than genuinely inaccessible: if no accessible framing exists yet, it has probably not been found. A function named "convert to integer" that refuses integers is a fully accessible framing of something that sounds maximally technical.

High technicality is an asset, not something to minimize. A presentation usually needs a small number of deliberately deep elements for the technical reader.

**Rate technicality only where it is useful.** Useful means: it is load-bearing for a depth decision, or it defies what the element's kind would lead you to assume. Defaults are predictable, so the informative ratings are the surprises.

- `finding` and `tool` skew high. Rate a `finding` that carries no technical prerequisite, because it is a gift for an accessible passage.
- `model`, `objective`, `problem`, `actor` skew low. Rate one that cannot be conveyed without grounding.
- `process`, `requirement`, `method` are genuinely mixed. Rate them.
- Leave it off where nothing turns on it. An `actor` node does not need a technicality rating.

Test: if removing the rating would not change any projection's binning, it was not useful.

### `source` (optional, repeatable)

Which source establishes the element, with a `why` pointing at the specific entries. Provide accurate sources. When date precision is unclear, use the smallest honest period rather than inventing precision.

## Choosing between keywords

### `finding` vs `constraint` vs `model`

Ask what kind of statement it is.

- *How does this actually behave?* → `finding`
- *What condition am I working under?* → `constraint`
- *Why is it like this?* → `model`

Worked example. *Saving a flow in the legacy designer removes an explicitly configured retry policy* is a finding. *Flows must be edited through tools that are not round-trip safe* is a constraint. *A visual designer is not a sufficient source of truth because the platform layers lifecycle semantics under a consumer interface* is a model.

A finding states behavior. Keep the appraisal of that behavior in `claim: opinion`, and the general reading in a `model`. This is what stops a corpus full of platform frustrations from turning the graph into a pamphlet.

### `finding` vs a claim

A finding earns a node when something else in the graph points at it: it explains an event, is verified by a check, is mitigated by a method, or constrains a product. Otherwise keep it as `claim: fact` on the relevant `tool`.

This is the guard against a pitfall catalogue. A corpus can easily contain a hundred discovered behaviors. When several illustrate the same underlying behavior, create one stable finding and attach a few examples rather than a node per occurrence.

### `requirement` vs `objective` vs `task`

- What was asked → `requirement`
- What is sought → `objective`
- What was done → `task`

An objective may evolve and receive contributions from many sources. A requirement is attributable to someone and answerable to verification. Do not create one node per user story: a requirement earns a node when several elements point at it, or when its interpretation was itself at stake.

### `problem` vs `constraint` vs `challenge`

- An unsatisfactory existing state that justifies intervention → `problem`
- A condition imposed from outside → `constraint`
- A difficulty that received or requires a deliberate response → `challenge`

`challenge` is the one at risk of becoming a dumping ground. Test: something in the graph should respond to it through `mitigates` or `anticipates`. If nothing responds, it is a constraint, or a claim on the affected element.

### `event` vs `task`

- A point of articulation the graph arrives at → `event`
- Work the graph traverses into → `task`

Duration does not decide this; `date` already carries duration. An event may span a period when what matters about that period happens at its boundaries: a two-month absence matters through the handover that opens it and the context loss that closes it, and nothing wants to traverse inside it. A task may be instantaneous.

Test: does the graph need to reach **into** it with `contains`, or **at** it with `explains`, `illustrates`, `anticipates` and `involves`?

When both readings are genuinely true, use two nodes: `task demo_preparation anticipates event june9_demo`.

### `process` vs `task`

Does it recur for every case that passes through the system? Then `process`. Performed once? Then `task`.

### `mitigates` vs `anticipates` vs `prevents`

- Had the difficulty already occurred? → `mitigates`
- Not yet? → `anticipates`
- Is it now impossible? → `prevents`

`mitigates` does not claim resolution, which is usually the honest reading: a lint rule does not stop an editor from removing a property, it makes the removal visible before publication. The target must be an identifiable difficulty. For an outcome, use `contributes`.

### `rejects` vs `replaces` vs `prevents`

- Was the target ever in place? → `replaces`
- Was it only ever a candidate, weighed and set aside? → `rejects`
- Is it causally blocked rather than declined? → `prevents`

Record the reasoning as `claim: counterfactual` on the `rejects` edge. Do not use it for every idea mentioned in passing: the alternative must have been assessed. A rejection can later be undone; record both edges with their dates.

### `verifies` vs `requires`

`verifies` asserts that a check exists and what it covers. `requires` is prerequisite only: the source cannot be understood, completed or validated without the target. For entailment or demand, use `explains`, `constrains` or `contributes`.

`verifies` says nothing about whether the check passed. Put outcomes in claims.

### `involves` vs `participates`

Intentionally not symmetric.

Use `involves` when the source inherently concerns the target: the target is a stakeholder, contributor, responsible party or otherwise structurally relevant. Use `participates` when the source actively takes part in the target, from the participant's perspective.

- `event june9_demo involves actor antoine`: Antoine is one of the people who define the event.
- `actor antoine participates event june9_demo`: Antoine took part in it.

The same situation may legitimately use both when they express different aspects. Many situations need only one: `project sponsorship involves actor secretariat_general` holds even though that body does not take part in implementation.

Rule of thumb: *who does this concern?* → `involves`. *What did this actor take part in?* → `participates`.

### `explains` vs `illustrates`

These connect the same kinds but encode opposite directions of reasoning. A phenomenon can illustrate an idea without explaining why the idea exists; an explanation can account for a phenomenon without being one of its manifestations.

- `constraint power_automate_limits explains project njflow`: the limitations account for why the tool was conceived.
- `event may13_incident illustrates constraint power_automate_limits`: the incident is a concrete manifestation.

Do not assign both to the same pair merely because they are strongly related.

Rule of thumb: *why did this happen or become relevant?* → `explains`. *what concrete case makes this visible?* → `illustrates`.

### `contains` vs `uses`

Composition versus dependency. A target may be essential without being a constituent part, and something contained may itself depend on external resources.

- `project sponsorship contains process request_analysis`
- `process request_analysis uses tool ai_builder`

Do not use `contains` to group merely related concepts. Do not use `uses` when the target is work or structure that belongs inside the source.

Rule of thumb: *is the target part of what the source is made of?* → `contains`. *does the source depend on something that stays external?* → `uses`.

### `claim: hypothesis` vs a `model` node

Both express uncertain interpretation; they differ in scope. Keep an uncertain explanation inside a node when it only qualifies that node. Create a `model` node when the interpretation connects several elements, supports several relations, or deserves independent reference.

- `tool power_automate` carrying `hypothesis: Missing-value semantics may be inherited from a highly dynamic internal runtime model.` This concerns the tool locally.
- `model layered_product_history` connects several tools, lifecycle semantics and documentation gaps into one explanation.

Do not promote every speculative sentence. Do not bury a recurring explanatory construction inside the node where it happened to be first expressed.

### `claim: fact` vs `claim: opinion`

`fact` is what the graph treats as established, because observed or sufficiently supported. It may include a reasonable inference. `opinion` is an attributable judgment, preference or position.

A statement can be critical and still factual when supported by observable behavior. It becomes an opinion when its meaning depends on the author's standards.

- `fact: Several classes of errors are validated only when a flow is published or executed.`
- `opinion: I find this authoring experience unnecessarily exhausting.`

Do not classify a statement as opinion merely because it is negative, and do not present a personal judgment as fact because it is strongly felt or often repeated.

### `actor` node vs incidental mention

An entity earns an `actor` node when its participation, stakeholder role, decisions, constraints or perspective are materially represented. Someone named only as incidental context stays in prose.

- `actor antoine` is justified: he specifies the need, tests the system, leads a demo, and appears across several elements.
- A colleague named once as the sender of a message does not need a node.

Rule of thumb: *would this entity support meaningful edges or repeated attribution?* → node. *is the name only useful inside this one statement?* → prose.

### node vs claim or prose

Create a node when a concept has stable identity: it can support several relations, recurs across sources, or deserves independent traversal and projection. Keep information in claims when it only describes, qualifies or contextualizes the current element.

- `constraint documentation_gap` deserves a node: it affects several projects, explains recurring reverse-engineering work, relates to generated documentation.
- The fact that one error message was vague belongs in a claim, unless that message becomes independently significant.

Do not create nodes because a noun phrase can be extracted from a sentence. Do not overload one node with a concept that has acquired its own relations.

Rule of thumb: *could I meaningfully navigate to this and connect it elsewhere?* → node. *does this only help explain the current element?* → claim or prose.

### claims within a node

Claims are semi-structured node internals: a way to break up what would otherwise be a paragraph of prose. They are not a query surface, and they carry no metadata of their own. Anything a projection needs to select or sort on belongs on the node.

Claims in a node should concern the same small set of subjects. If they are about **different subjects**, the node is doing two jobs and should be split. If they are about the **same subject from different angles**, keep them together, even when their depth varies: a node explained both accessibly and technically is normal and useful.

So claims may be freely technical. Prefer stating a mechanism before appraising it, since an appraisal with nothing to point at is usually a missing fact. Beyond that, do not agonize over it.

## Modeling patterns

### Periods are tasks, not a kind of their own

There is no `phase` kind, deliberately. The shape of a mission over time is represented by coarse `task` nodes with date ranges, nesting finer work through `contains`.

The activities that a planning would show — learning, exploration, skill building, prototyping, delivery, knowledge transfer — are all work at a coarse grain, and `task` admits any grain. A planning projection is then: coarse tasks with dates, `event` nodes as milestones, and `explains` or `constrains` edges carrying the difference between what was planned and what happened.

Two cases that look like periods but are not tasks:

- A stretch of time whose significance is entirely at its boundaries is an `event`, even if it spans months.
- A period during which the project was in a state that shaped the available work is a `constraint`. *The project is in requirements analysis, so no development work is available* is a condition, not an activity.

### Node keys: Avoid generic labels, favor diverging kind

`project sponsorship` and `product sponsorship` can both exist because kind differs.

`product application` is bad because it's not clear which application it is since node keys are global. There are no namespaces or nesting.

`product sponsorship` can explain it is a Power Apps application.

### Lifecycles are one node

A state machine is one `process` node. Its states, transitions and authority rules live in its `summary` and claims. Do not create a node per state: a request lifecycle with eight states is one node, not eight.

### Person versus role

Create separate `actor` nodes for a person and for a role or body only when both carry edges. A named business owner who expresses requirements and tests the system earns a node; a decision body with sovereign approval authority earns another. A role that appears only inside one process description does not, unless something points at it.

### Handovers

A transfer is ternary: what, from whom, to whom. Edges are binary, so a handover cannot be one edge.

Model it as an `event` for a single session, or a coarse `task` for a transfer period, that `involves` both the outgoing and incoming parties and `contains` the transferred object.

```
event knowledge_transfer
  involves actor me
  involves actor receiving_team
  contains project legal_highlights
```

### Alternatives that were weighed

Rejected candidates almost always already have a natural kind: a competing platform is a `tool`, a different access-control approach is a `method`, a tool that was never built is a `project`. There is no `option` kind, because it would create a second node for the same thing.

Model the choice as a `decision` with `rejects` edges to the candidates, and the reasoning as `claim: counterfactual` on each edge.

### Discovered behavior and its guard

The recurring shape of a technical corpus is: behavior discovered, response built, response enforced. It has a canonical encoding.

```
task experiments      produces  finding hidden_behavior
finding hidden_behavior explains event incident
tool lint             verifies  finding hidden_behavior
tool lint             mitigates finding hidden_behavior
finding hidden_behavior illustrates model why_this_platform_is_like_this
```

`verifies` and `mitigates` on the same pair are not redundant: the check detects the behavior, and detecting it is what reduces its cost. The behavior itself does not go away.

### Stable abstraction with a few examples

When many concrete cases illustrate the same idea, create one stable node and attach a few examples through `illustrates`. Resist reconstructing the final mental model too early: let recurring evidence gradually justify new nodes and abstractions, and let new information reshape an earlier, incomplete model.

Avoid going deep into implementation detail except where a detail illustrates a structural problem. The graph exists to explain the experience, not to reconstruct the complete technical tree.

## What stays out of the graph

Some distinctions are real and recurring but belong to a projection, a claim, or prose.

**Projection concepts.** Report chapters, presentation sections, SWOT quadrants, planning charts, STAR stages, competence referentials. These are query-time classifications and report-plan metadata, not kinds.

SWOT deserves a specific note, because it is the most tempting. Quadrant membership is not a property of a thing: it is a property of a *(thing, subject, valence)* tuple. One organizational change can be a threat to a team's mission, an opportunity for cost control, and a weakness in knowledge retention at the same time. Encoding it as a kind forces one reading and destroys the others, and duplicates a node that already exists as a `constraint`, `problem` or `event`. Keep one node per real thing, carry valence in `importance` and `claim: opinion`, and assign quadrants in the report plan.

The same argument covers a `strength` or `weakness` kind: a weakness of an organization is a `problem` or a `constraint`, with a better name and existing relations.

**STAR** is a traversal template. Situation draws on `problem`, `constraint` and `finding`; Task on `requirement` and `objective`; Action on `task`, `method` and `decision`; Result on `product` and the `verifies` edges that establish it.

**Claim-level.** Anticipated risk (`claim: hypothesis`, or a `challenge` when something responds to it). Estimation and effort. Individual user stories and acceptance criteria, on the `requirement` they refine. Individual pitfalls with no consumer, on the relevant `tool`. Valence and appraisal, always `claim: opinion` and never a kind.

**Emotional and motivational state** stays in claims on the element it qualifies. It is real and often important to the account, but it is local. The exception is when it became an explicit object of reflection with explanatory reach: realizing that progress was being mismeasured is a `learning`.

**Incidental detail** stays in claims where it contextualizes something, and in prose otherwise. Including apparently unrelated detail is fine and often valuable: the point is to represent the information, not only what seems relevant right now. It just rarely needs a node.
