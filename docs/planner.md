# Planner

Create and execute structured, phased plans.

## Commands

- `planner create` — Start a new plan.
- `planner read` — Display a plan.
- `planner list` — List all plans.
- `planner update` — Update a plan.
- `planner delete` — Delete a plan.
- `planner next` — Execute next step or answer question.

## Plan Format

```markdown
---
title: "Plan Title"
created: YYYY-MM-DD
status: active | paused | completed | cancelled
---

# Plan: Title

## Objective

One-sentence goal.

## Phases

### Phase 1: Name
- [ ] Task 1
- [ ] Task 2
- [ ] Question for user: What should I do about X?
  - Option A: Description
  - Option B: Description

## Notes

Agent notes during execution.
```

## Rules

1. One active plan at a time.
2. User questions block execution until answered.
3. Mark tasks `[x]` as completed.
4. Update status accordingly.
5. Keep plans concise.
