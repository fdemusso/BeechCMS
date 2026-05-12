/**
 * Backward-compat barrel.
 *
 * New code should import directly from `./shared`. Existing callers of
 * `@/components/ui/minimal-tiptap/utils` continue to work unchanged.
 */
export * from "./shared"
