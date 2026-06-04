Fix the top 3 React Doctor issues in beech-cms on this pass ÔÇö leave the rest for a follow-up.

1. WARN Accessibility: Redundant ARIA role (├ù1)
   Screen reader users gain nothing from this `role` because `<nav>` already acts as a `navigation`, so remove it.
   Curl with no cache & follow the canonical fix and false positive check recipe before fixing: https://www.react.doctor/docs/rules/react-doctor/no-redundant-roles
   - src/components/ui/pagination.tsx:21
2. WARN Accessibility: Anchor has no content (├ù1)
   Blind users can't follow this link because screen readers announce nothing, so add visible text, `aria-label`, or `aria-labelledby`.
   Curl with no cache & follow the canonical fix and false positive check recipe before fixing: https://www.react.doctor/docs/rules/react-doctor/anchor-has-content
   - src/components/ui/pagination.tsx:63
3. WARN Maintainability: Non-component export in component file (├ù8)
   Fast Refresh stops working when a file exports non-components.
   Curl with no cache & follow the canonical fix and false positive check recipe before fixing: https://www.react.doctor/docs/rules/react-doctor/only-export-components
   - src/components/ui/timezone-select.tsx:9
   - src/components/ui/currency-select.tsx:4
   - src/components/ui/button.tsx:68
   - +4 more files

Full results for all 668 issues (diagnostics.json + a .txt per rule): C:\Users\flavi\AppData\Local\Temp\react-doctor-4f4ab9e8-8b90-4f82-852a-029e5505f055

Read each file and fix the root cause ÔÇö don't suppress or silence the rule.

Verify against the real thing, don't assume: confirm each change matches the canonical fix recipe you fetched for that rule, then re-run `npx react-doctor@latest --verbose` and check the issue is actually gone against the real tool before moving on.

Teach me as you go: for every issue you touch, explain it in plain language (no jargon) ÔÇö what the problem is, why it's a problem, and how serious it is in human terms. Describe the real-world impact and severity concretely (e.g. "this crashes the page for users on Safari" vs. "this is a minor cleanup with no user impact") so I understand why it matters, not just what changed.

Then work through the rest from the full results above.