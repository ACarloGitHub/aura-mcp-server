# Planner Protocol

The planner allows the agent to create structured, phased programs or projects that the model checks off step by step, or to pose questions to the user, have them select an answer, and proceed accordingly.

## Plan Structure

A plan is a markdown file in `./plans/` with the following structure:

```markdown
---
title: "Plan Title"
created: YYYY-MM-DD
status: active | paused | completed | cancelled
---

# Plan: [Title]

## Objective

[One-sentence goal.]

## Phases

### Phase 1: [Name]
- [ ] Task 1
- [ ] Task 2
- [ ] Question for user: [What should I do about X?]
  - Option A: [Description]
  - Option B: [Description]

### Phase 2: [Name]
- [ ] Task 1
- [ ] Task 2

## Notes

[Agent notes during execution.]
```

## Rules

1. **One active plan at a time.** The agent focuses on the active plan.
2. **User questions are blocking.** When the plan reaches a user question, execution pauses until the user responds.
3. **Check off as you go.** The agent marks tasks complete `[x]` as they are finished.
4. **Update status.** Mark the plan `completed` when all phases are done, or `cancelled` if abandoned.
5. **Keep it concise.** Plans should fit on one screen. Break large projects into multiple plans.

## Commands

- **"Create plan: [title]"** — Start a new plan.
- **"Show plan"** — Display the current active plan.
- **"Next step"** — Execute the next uncompleted task or question.
- **"Answer: [A/B/...]"** — Respond to a blocking question.
- **"Cancel plan"** — Abandon the current plan.

## Example

```markdown
---
title: "Setup Development Environment"
created: 2026-04-21
status: active
---

# Plan: Setup Development Environment

## Objective

Install and configure Node.js, Git, and VS Code.

## Phases

### Phase 1: Node.js
- [x] Check current Node version
- [ ] Install Node 20 LTS
- [ ] Verify installation

### Phase 2: Git
- [ ] Install Git
- [ ] Configure user.name and user.email
- [ ] Question for user: Which Git hosting service do you use?
  - Option A: GitHub
  - Option B: GitLab
  - Option C: Other (please specify)

### Phase 3: VS Code
- [ ] Install VS Code
- [ ] Install recommended extensions
```