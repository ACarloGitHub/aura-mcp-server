# Wiki System

The LLM Wiki follows the Karpathy pattern for persistent structured knowledge.

## Structure

```
wiki/
├── index.md           # Catalog of all pages
├── log.md             # Append-only chronological log
├── summaries/         # One page per source
├── concepts/          # Concepts and frameworks
├── entities/          # People, tools, organizations
├── syntheses/         # Cross-cutting analysis
└── presentations/     # Marp slides (optional)
```

## Operations

### Ingest
1. User provides a raw source.
2. LLM creates a summary in `summaries/`.
3. LLM identifies concepts and entities.
4. Creates or updates pages in `concepts/` and `entities/`.
5. Adds cross-links bidirectionally.
6. Updates `index.md` and `log.md`.

### Query
1. LLM reads `index.md` to find relevant pages.
2. Reads identified pages.
3. Synthesizes response with citations and links.

### Lint
1. LLM reads all wiki pages.
2. Checks for orphans, obsolete claims, contradictions, broken links, incomplete sections, low confidence.
3. Fixes what is automatable.
4. Reports issues requiring human judgment.

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
