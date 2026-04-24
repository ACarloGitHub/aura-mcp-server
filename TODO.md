# TODO — Next Session

## Files to Review

- [ ] `src/tools/exec.ts` — check for personal data, external dependencies
- [ ] `src/tools/read.ts` — check for personal data, external dependencies
- [ ] `src/tools/write.ts` — check for personal data, external dependencies
- [ ] `src/tools/webSearch.ts` — check for personal data, external dependencies
- [ ] `src/tools/wiki.ts` — check for personal data, external dependencies
- [ ] `src/tools/planner.ts` — check for personal data, external dependencies
- [ ] `src/tools/compact.ts` — check for personal data, external dependencies
- [ ] `src/utils/helpers.ts` — check for personal data, external dependencies
- [ ] `src/index.ts` — check for personal data, external dependencies
- [ ] `package.json` — check dependencies, remove any personal scripts
- [ ] `tsconfig.json` — check for personal paths
- [ ] `README.md` — review for personal data, update with final instructions
- [ ] `COMPACT.md` — review for personal data
- [ ] `PLANNER.md` — review for personal data
- [ ] `TOOLS.md` — review for personal data
- [ ] `llm-wiki-plan.md` — review for personal data
- [ ] `docs/` folder — review all docs for personal data
- [ ] `wiki-template/` — review for personal data
- [ ] `.gitignore` — check for completeness

## LM Studio Integration

- [ ] Verify if LM Studio can auto-load a system prompt from file
- [ ] Document how the user should configure the System Prompt in LM Studio
- [ ] Consider creating a LM Studio preset file (if applicable)

## Testing

- [ ] Rebuild the project (`npm run build`)
- [ ] Test the server starts correctly
- [ ] Verify no personal data leaks in any output

## Before Publishing

- [ ] Final check: `grep -ri "personal\\|private\\|secret" --exclude-dir=node_modules --exclude-dir=.git`
- [ ] Commit and push to GitHub (when explicitly instructed)
