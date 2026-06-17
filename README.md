# Infograph

Structure information, experiences and their relationships in a factual, human-writable, language-agnostic graph: the infograph.

Query the infograph with restrictions to produce simplified representations, which can be used to make

- reports
- writeups
- presentations

Think of it like a Venn diagram. The set of graph elements yielded by the query represents the active presentation surface. It is a subset of all graph elements.

Edges that cross the boundary between active and inactive nodes is become "handles" for Q/A, feedback or discussions, and can be represented as such in artifacts. The speaker knows inactive content, and can dive into it on demand.

## Infograph schema

```yaml
nodes:
  - id: sponsorship-reliability
    type: realization
    title: Fiabilisation du processus Sponsorship
    summary: >
      Le projet a progressivement évolué vers des enjeux
      de fiabilité et de compréhension des règles de calcul.
    complexity: medium
    importance: high
    useful_for:
      - visite
      - soutenance
      - rapport
    hooks:
      - règles de calcul
      - cas limites
      - évolution du périmètre
    oral:
      - expliquer le changement progressif du projet
      - montrer un exemple de comportement inattendu
relations:
  - from: sponsorship-reliability
    to: amount-calculation
    type: depends_on
  - from: sponsorship-reliability
    to: evolving-requirements
    type: caused_by
```
