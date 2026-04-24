# LLM Wiki Architecture

Based on Andrej Karpathy's pattern. Each wiki is an artifact maintained by the LLM, with the human curating sources and directing queries.

## Structure

```
wiki/
├── index.md           # Catalog
├── log.md             # Append-only log
├── summaries/         # Source summaries
├── concepts/          # Concepts
├── entities/          # People, tools, orgs
├── syntheses/         # Cross-cutting analysis
└── presentations/     # Optional Marp slides
```

## Page Types

| Type | Required Sections |
|------|-------------------|
| summary | Key Points, Relevant Concepts, Source Metadata |
| concept | Definition, How It Works, Key Parameters, When To Use, Risks, Related Concepts, Sources |
| entity | Overview, Characteristics, Common Strategies, Related Entities |
| synthesis | Comparison, Analysis, Recommendations, Pages Compared |

## Frontmatter

```yaml
---
title: "Page Title"
type: concept | entity | summary | synthesis
tags: [tag1, tag2]
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: ["raw/filename.txt"]
confidence: high | medium | low
---
```

## Core Rules

1. Raw is immutable.
2. LLM writes, human reads and directs.
3. Index and Log always updated.
4. Prefer updating over creating duplicates.
5. Explicit confidence levels.
6. One page per concept.
7. Plain English, define jargon.
8. ISO 8601 dates.

## Workflow

1. Collect sources in `raw/`.
2. Ingest — LLM processes and updates wiki.
3. Explore with Obsidian (graph view, search).
4. Query — LLM responds from wiki with citations.
5. Lint periodically — health check and maintenance.
6. Review syntheses — archive new insights.
