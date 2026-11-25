## 2026-11-25 — KeyModelDocs.md (REWORK_PLAN, from stage 03 review)

The plan excludes `docs/.vitepress/theme` (SECTION 7, and the drift census says "clean"). It is not clean.

`docs/.vitepress/theme/components/LlmPromptNode.vue:56` is the default text of `<LlmPromptNode>`, the copyable prompt readers paste into AI assistants. It says "…with baseUrl and apiKey." `apiKey` was removed, so code generated from that prompt throws `apiKey was removed: pass <keyName> to <factory>` at client construction.

The census grepped for the legacy key names, not for `apiKey`. The new fact-check section 6 does not catch it either: it scans only `docs/**/*.md` and `CHANGELOG.md`.

Requested change to the plan:
1. Lift the theme exclusion for that line and replace it with "baseUrl and publishableKey (browser) or secretKey (server)".
2. Decide whether section 6 should also scan `docs/.vitepress/theme/**/*.vue`. If yes, add a unit test for it.

The rest of the sprint passed review and needs no change.
