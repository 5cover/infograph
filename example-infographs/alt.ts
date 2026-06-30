import { defineInfograph } from '../source/input'
import { BaseDomain } from '../source/types'

const domain = {
    source: {
        journal: null,
        'user stories': null,
        documentation: null,
        common: {
            desc: 'factual information',
        },
    },
    kind: {
        project: {
            desc: 'A named mission, initiative or structured work area.\nApprenticeship work is organized around missions, not only isolated tasks.\nExample: Sponsorship.\n',
        },
        task: {
            desc: 'A concrete task, implementation effort, investigation or sub-part of a project.\nLets the graph represent actual work without creating one project per task.\nExample: amount calculation reconstruction, view bug fixes, workflow updates.\n',
        },
        product: {
            desc: 'An user-facing artifact: presentation, application, site Separates work from its outputs.\nUseful when explaining what was actually delivered.\n',
        },
        tool: {
            desc: 'A technical platform, software, framework or environment used in the work.\nTracks the technical environment.\nExample: Power Automate, SharePoint, LeanKit, Jira, Confluence.\n',
        },
        constraint: {
            desc: 'A limitation, pressure, rule, instability or external condition that shapes the work.\nThe journal contains many cases where the important fact is not what was done, but what made it difficult or shaped the available choices.\nExample: short handover, runtime errors, support restrictions, changing scope.\n',
        },
        event: {
            desc: 'A dated or period-bound occurrence that changed the situation.\nSome nodes are important because they happened at a specific time. Example: return from leave, demo on June 9, abandonment of a tool direction.\n',
        },
        decision: {
            desc: 'A choice, explicit or implicit, that changed direction or reduced uncertainty.\nDecisions explain why the work followed one path instead of another.\nExample: abandoning Confluence, returning to LeanKit, not implementing NJflow.\n',
        },
        learning: {
            desc: 'A skill, realization, progression axis or change in judgment.\nEvidence of progression. Example: moving from implementation to reliability reasoning.\n',
        },
        actor: {
            desc: 'A person, team, support group or institution involved in the situation.\nSome constraints and decisions are organizational. Keeping actors explicit avoids hiding social/project context in prose.\nExample: IUT, support team, Indian team, project owner, Mahmoud, Fabrice.\n',
        },
        jargon: {
            desc: 'A domain-specific term.\nExample: cumulated amount\n',
        },
        process: {
            desc: 'An executable recipe for actions actors with visibility rules over time.\nExample: request analysis\n',
        },
        '-': {
            desc: 'Free-form fallback for information that does not fit the graph cleanly yet. Prevents schema pressure. If something is important but hard to model, it can enter the graph first and be structured later.',
        },
    },
    verb: {
        contains: {
            desc: 'The source includes the target as a sub-part.\nBasic structure relation. Analogy: UML composition. The target is only relevant within the source.\nExample: Sponsorship contains amount calculation work.\n',
        },
        uses: {
            desc: 'The source uses the target as a tool, platform, method or resource.\nEssential for technical environment projections. Analogy: UML agregation.\nExample: Sponsorship uses Power Automate.\n',
        },
        produces: {
            desc: 'The source creates, modifies or results in the target.\nConnects work to concrete outputs.\nExample: work item produces demo artifact.\n',
        },
        requires: {
            desc: 'Understanding, completing or validating the source requires the target.\nCaptures hidden depth. These edges often become discussion openings when outside the active surface.\n',
        },
        explains: {
            desc: 'The source explains, triggers or makes the target more likely.\nCaptures chronology and causality without writing a full narrative.\n',
        },
        illustrates: {
            desc: 'The source is an example of the target.\nLets concrete events support broader claims. Example: handover pressure illustrates autonomy growth.\n',
        },
        constrains: {
            desc: 'The source limits, shapes, pressures or hinders the target.\nThe journal repeatedly describes work shaped by tool limits, support constraints, planning pressure and changing scope.\n',
        },
        prevents: {
            desc: 'Useful for representing tradeoffs. Example: limited available team capacity prevents additional staffing.\nThe source prevents the target\n',
        },
        replaces: {
            desc: 'The source takes the place of the target.\nUseful for project direction changes.\nExample: LeanKit replaces Jira in the chosen workflow direction.\n',
        },
        '-': {
            desc: 'Weak fallback relation when a connection matters but is not yet precise.\nPrevents premature modeling. Better to store an imperfect relation than to lose the connection.\n',
        },
    },
}

export default defineInfograph({
    info: {
        title: 'Alternance 2ème partie',
        context: 'ENGIE apprenticeship',
        author: 'me',
    },
    domain,
    nodes: {
        project: {
            sponsorship: {
                info: {
                    title: 'Sponsorship',
                    summary:
                        'Business project involving sponsorship-related workflows, follow-up, data handling and automation.',
                    fact: [
                        'The project became one of the main active missions of the apprenticeship.',
                        'The project evolved over time instead of remaining a fixed implementation task.',
                    ],
                    period: {
                        from: new Date(2025, 12, 1),
                        to: new Date(2026, 7, 18),
                    },
                    importance: 'central',
                    complexity: 'contained',
                    source: 'journal',
                    tag: ['sponsorship', 'business workflow', 'automation'],
                },
                uses: {
                    tool: {
                        power_automate: {
                            with: {
                                complexity: 'contained',
                                fact: 'Power Automate was used to implement automation aspects of Sponsorship.',
                            },
                        },
                        sharepoint: {
                            with: {
                                complexity: 'simple',
                                fact: ['SharePoint was part of the project environment.'],
                            },
                        },
                    },
                },
                contains: {
                    product: {
                        application: {
                            with: {
                                fact: 'Having an application was not initially part of the need.',
                            },
                            info: {
                                title: 'Application',
                                summary: 'The application serves as a front-end for the product.',
                                fact: [
                                    'Since it was added, SharePoint is fully treated as a database layer',
                                    'Having a dedicated front-end helped simplify',
                                ],
                            },
                            uses: {
                                power_apps: null,
                            },
                        },
                    },
                    process: {
                        amount_calculation: {
                            with: {
                                complexity: 'contextual',
                                fact: 'Sponsorship reliability depended partly on understanding amount calculation behavior.',
                            },
                            info: {
                                title: 'Amount calculation',
                                summary:
                                    'Business calculation logic that required reconstruction, understanding and reliable handling.',
                                importance: 'central',
                                complexity: 'intertwined',
                                source: ['journal', 'user stories'],
                                fact: [
                                    'The calculation logic was difficult to understand without sufficient context.',
                                    'A short handover was not enough to fully absorb the calculation behavior.',
                                    'Reliability depended on understanding edge cases and implicit rules.',
                                ],
                                period: {
                                    from: '2026-05',
                                    to: '2026-07',
                                },
                                tag: ['calculation', 'business-rules', 'reliability', 'edge-cases'],
                            },
                            requires: {
                                reliability_focus: {
                                    with: {
                                        complexity: 'contextual',
                                        fact: 'Calculation complexity contributed to the need for a stronger reliability focus.',
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        power_automate: {
            kind: 'tool',
            title: 'Power Automate',
            summary:
                'Main automation platform used in the project, with significant practical constraints around reliability, debugging and maintainability.',
            importance: 'central',
            complexity: 'contextual',
            source: 'journal',
            fact: [
                'Power Automate was central to the implementation work.',
                'The platform introduced recurring reliability and maintainability concerns.',
                'Some issues were difficult to prevent because errors often appeared at runtime.',
            ],
            period: {
                from: '2025-12',
                to: '2026-07',
            },
            tag: ['power automate', 'low-code', 'reliability', 'runtime-errors'],
            requires: {
                reliability_focus: {
                    with: {
                        complexity: 'contained',
                        fact: 'Power Automate constraints made reliability and maintainability more important.',
                    },
                },
            },
        },
        sharepoint: {
            kind: 'tool',
            title: 'SharePoint',
            summary:
                'Data and collaboration platform used as part of the business workflow and automation environment.',
            importance: 'major',
            complexity: 'contained',
            source: 'journal',
            fact: [
                'SharePoint was part of the technical environment.',
                'The structure of stored data affected automation behavior.',
            ],
            period: {
                from: '2025-12',
                to: '2026-07',
            },
            tag: ['sharepoint', 'data', 'collaboration'],
        },
        evolving_scope: {
            kind: 'constraint',
            title: 'Evolving project scope',
            summary:
                'The project changed over time, which affected planning, understanding and implementation priorities.',
            importance: 'central',
            complexity: 'contextual',
            source: 'journal',
            fact: [
                'The project did not remain stable from its initial framing.',
                'New expectations and constraints appeared as the work progressed.',
                'The evolution of the project increased the need for context rebuilding.',
            ],
            period: {
                from: '2025-12',
                to: '2026-07',
            },
            tag: ['scope', 'planning', 'project management'],
            explains: {
                handover_pressure: {
                    with: {
                        complexity: 'contained',
                        fact: 'A changing project made short handover harder.',
                    },
                },
            },
            constrains: {
                sponsorship: {
                    with: {
                        complexity: 'contained',
                        fact: 'The evolving scope affected how the Sponsorship work had to be understood and presented.',
                    },
                },
            },
        },
        reliability_focus: {
            kind: 'realization',
            title: 'Reliability focus',
            summary:
                'The work shifted from simply making automations work to making them understandable, maintainable and reliable.',
            importance: 'central',
            complexity: 'intertwined',
            source: 'journal',
            fact: [
                'A working automation was not sufficient by itself.',
                'The project required attention to maintainability, traceability and edge cases.',
                'This became a major learning axis of the apprenticeship.',
            ],
            period: {
                from: '2026-04',
                to: '2026-07',
            },
            tag: ['reliability', 'maintainability', 'learning', 'automation'],
            requires: {
                autonomy_growth: {
                    with: {
                        complexity: 'contained',
                        fact: 'Working on reliability required more independent judgment.',
                    },
                },
            },
        },
        handover_pressure: {
            kind: 'event',
            title: 'Handover under time pressure',
            summary: 'A short handover period made it difficult to reconstruct the full context of an evolved project.',
            importance: 'major',
            complexity: 'contextual',
            source: 'journal',
            fact: [
                'A limited handover period was not enough to fully understand the evolved project.',
                'The situation increased the need to reconstruct context from existing artifacts and behavior.',
            ],
            period: {
                from: '2026-06',
                to: '2026-06',
            },
            tag: ['handover', 'context', 'planning'],
            illustrates: {
                autonomy_growth: {
                    with: {
                        complexity: 'contained',
                        fact: 'The handover situation illustrates the need to reconstruct context autonomously.',
                    },
                },
            },
        },
        autonomy_growth: {
            kind: 'learning',
            title: 'Autonomy growth',
            summary:
                'Progression from executing tasks toward reconstructing context, identifying risks, and reasoning about reliability.',
            importance: 'central',
            complexity: 'contained',
            source: 'journal',
            fact: [
                'The apprenticeship required increasing autonomy over time.',
                'Autonomy involved understanding unclear systems, not only implementing requested changes.',
                'The work developed stronger judgment around complexity and reliability.',
            ],
            period: {
                from: '2026-01',
                to: '2026-07',
            },
            tag: ['autonomy', 'learning', 'progression'],
        },
    },
    edges: {
        'autonomy_growth - handover_pressure': {
            fact: 'These two nodes are related somehow',
        },
    },
})
