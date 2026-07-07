# Planner (v3.0)

The planner manages phased plans stored as markdown files under `plans/` in the workspace. A plan is a checklist of tasks; some tasks are blocking questions that require user input.

## Plan format

```markdown
---
title: My plan
status: active
---

# My plan

- [ ] First task description
- [ ] Second task description
- [ ] Sub-step for task two
- [ ] Question: Which approach for X? — A, B, or C?
- Option A: ...
- Option B: ...
- Option C: ...
- [ ] Last task
```

- `- [ ] task` — pending task (becomes `- [x]` once completed).
- `- [ ] Question: ...` — blocking question; the following lines are options (`- Option A: ...` ... `- Option ...: ...`).

`status: active` in the frontmatter; `planner(action=next)` flips it to `completed` once the last task is done.

## Actions

The `planner` tool exposes seven actions:

| Action | Args | Behaviour |
|---|---|---|
| `create` | `name`, `content` | Writes `plans/<name>.md`. |
| `read` | `name` | Returns plan content. Wrapped with `[INSTRUCTION: ...]` that says "do NOT repeat; summarize in 1-2 sentences". |
| `list` | — | Lists plan file names. |
| `update` | `name`, `content` | Overwrites plan body. |
| `delete` | `name` | Removes the plan file. |
| `next` | `name`, optional `answer` | Marks the first unchecked task complete; if the next pending line is a blocking question, either prompts the user (no answer) or records the answer and proceeds. |
| `status` | `name` | Concise progress report. `structuredContent` carries `{ name, total, completed, remaining, percentage, blockingQuestion }`. |

## `action=next` algorithm

1. Find the first unchecked task (`- [ ]` not starting with `Question`).
2. If found: mark it complete (`- [x]`), return what was done and the next task.
3. Else, find a blocking question (`- [ ] Question: ...`).
4. If the question exists:
   - With `answer`: mark `- [x] Answered question: ...` and record the answer; advance.
   - Without `answer`: prompt the user with the question verbatim.
5. Else: flip `status: active` → `status: completed` and celebrate.

## Result wrapping

All actions return `[INSTRUCTION: ...]` prefixes. The wording for the verbose ones (`next`, `status`) emphasises short replies (`"Reply with ONE sentence"`, `"do NOT list all tasks"`).

## Practical recipes

**Start a project.**

```json
planner(action="create", name="migrate-db", content="---\ntitle: Migrate DB\nstatus: active\n---\n\n- [ ] Inventory existing schemas\n- [ ] Draft new schema\n- [ ] Write migration scripts\n- [ ] Test on staging\n- [ ] Question: deploy window — weekend, weekday evening, other?\n- Option A: weekend\n- Option B: weekday evening\n- Option C: other\n- [ ] Production deploy")
```

**Walk the plan.**

```
planner(action="next", name="migrate-db")
→ marks first task complete, returns next task
```

```
planner(action="next", name="migrate-db", answer="weekend")
→ records the answer, advances
```

**Quick status check.**

```
planner(action="status", name="migrate-db")
→ structuredContent: { name, total, completed, remaining, percentage, blockingQuestion }
```

## See also

- [wiki.md](wiki.md) for the structured knowledge base.
- [compaction.md](compaction.md) for memory hygiene.
- [architecture.md](architecture.md).
