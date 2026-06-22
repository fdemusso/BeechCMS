# React Doctor Triage & Fix Workflow

To find and fix React issues that truly affect the codebase, use the triage loop.

## Command Options
1. **Automated script**:
   - `node scripts/react-doctor-loop.mjs` (scans changed files against base branch)
   - `node scripts/react-doctor-loop.mjs --full` (scans the whole codebase)
2. **Interactive Agent Prompt**:
   `"Run the react-doctor local triage playbook. Fetch rules from https://www.react.doctor/prompts/react-doctor-agent.md, run the scan, filter out false positives using .react-doctor/false-positives.md, fetch specific fix prompts from react.doctor/prompts/rules, apply fixes, typecheck via pnpm run build, and revert files that break compilation."`

## Triage Rules & Guidelines
- **Token Optimization**: Be extremely concise. Avoid explaining theory. Output code changes and brief status logs only.
- **Codebase Navigation**: Use `graphify` CLI commands to navigate relationships. Do not read large reports or run broad greps.
- **Filter**: Check `.react-doctor/false-positives.md` before making any changes.
- **Triage Priority**: Address errors first, check types/compilation, revert on failure. Address warnings second in batches.
- **Validation**: Every modification MUST pass `pnpm run build` (`tsc -b`) and tests.
- **No speculative edits**: Do not rewrite React code unless there is a clear rule instruction and a typecheck validation.
