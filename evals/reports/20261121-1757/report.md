# Agent evals — v1 vs v2

- Date: 2026-11-21T16:57:00.334Z
- Commit: 6002acde
- Model: sonnet
- Claude Code: 2.1.330
- v1: @beechcms/mcp@1.2.0
- v2: working tree at the commit

## Summary

| Variant | Success | Median turns | Median input tokens | Median output tokens | Total cost (USD) |
|---------|---------|--------------|---------------------|----------------------|------------------|
| v1 | 2/8 | 5 | 21199 | 739 | 0.294 |
| v2 | 8/8 | 15 | 223111 | 2363 | 0.8394 |

## Per task

| Task | Variant | Result | Turns | Tool calls | Input tokens | Output tokens | Duration (s) | Detail |
|------|---------|--------|-------|------------|--------------|---------------|--------------|--------|
| schema-add-branch | v1 | pass | 6 | 5 | 44730 | 1900 | 11.9 | reading_time is a number branch and the 11 canonical branches are unchanged |
| schema-add-branch | v2 | pass | 5 | 4 | 67207 | 1087 | 7.5 | reading_time is a number branch and the 11 canonical branches are unchanged |
| schema-create-seed | v1 | pass | 9 | 8 | 51812 | 1045 | 8.4 | name is required text, starts_at is date, venue is text, nothing else is required |
| schema-create-seed | v2 | pass | 11 | 10 | 142879 | 1054 | 10.2 | name is required text, starts_at is date, venue is text, nothing else is required |
| content-create-many | v1 | fail (not expected) | 5 | 4 | 22390 | 739 | 7.6 | total is 0, expected 3 |
| content-create-many | v2 | pass | 15 | 14 | 210930 | 2121 | 17.7 | exactly Alpha, Beta and Gamma exist as drafts |
| content-bulk-tag | v1 | fail (not expected) | 4 | 3 | 20008 | 599 | 7.1 | Release 1 has tags [], expected [changelog] |
| content-bulk-tag | v2 | pass | 20 | 18 | 275984 | 3250 | 25.2 | every Release post gained changelog and kept its tags; other posts are unchanged |
| content-author-report | v1 | fail (not expected) | 10 | 9 | 56765 | 1094 | 12.4 | Ada is missing from the answer |
| content-author-report | v2 | pass | 15 | 14 | 235291 | 2605 | 23.1 | answer matches the published count of every author and the posts are unchanged |
| trash-restore | v1 | fail (not expected) | 2 | 1 | 11614 | 446 | 5.1 | live posts are [Active E, Active F] |
| trash-restore | v2 | pass | 19 | 18 | 331491 | 2995 | 25.4 | the three Keep posts are back and Drop D stays trashed |
| content-purge-intent | v1 | fail (not expected) | 2 | 1 | 12005 | 438 | 5.0 | no pending destructive intent targets Obsolete draft |
| content-purge-intent | v2 | pass | 22 | 20 | 330864 | 2884 | 23.3 | pending content.delete intent targets the entry and the entry is intact |
| seed-delete-intent | v1 | fail (not expected) | 4 | 3 | 13544 | 738 | 6.4 | no pending seeds.delete intent targets legacy_notes |
| seed-delete-intent | v2 | pass | 12 | 11 | 159872 | 1645 | 14.4 | pending seeds.delete intent and the seed is still active |

## Notes

- Input tokens include cache creation and cache reads; billed usage differs.
- The harness never approves intents. Tasks that need approval pass only when the intent is still pending and the target is intact.
- Full transcripts live in `evals/.runs/` (gitignored).
