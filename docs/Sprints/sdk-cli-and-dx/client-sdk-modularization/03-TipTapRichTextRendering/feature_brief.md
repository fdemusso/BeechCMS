# Feature Brief — TipTap RichText Rendering Utilities

> Origin: `stages/00_ideation/idea.md` (Feature 2: TipTap RichText Rendering Utilities), refined through adversarial sparring.
> Stacked PR Target: Branch `feature/tiptap-richtext-rendering` based on `feature/strict-client-sdk-segregation`.

---

# 1. Feature Definition and Core Value

Consuming applications (Next.js, Remix, Astro, Vite, browser SPAs) and server-side components need to render BeechCMS RichText content (TipTap structured JSON AST) into semantic HTML or plain-text snippets for SEO, OpenGraph tags, and preview cards.

Currently, rendering RichText documents outside the core engine either requires dragging heavy server-only packages or importing the full TipTap/ProseMirror ecosystem (`@tiptap/html`, `@tiptap/core`, `prosemirror-*`), adding hundreds of kilobytes of bundle bloat, requiring synthetic DOM polyfills on serverless/edge runtimes, and exposing consumers to cross-runtime incompatibility.

The core value of this feature is delivering an ultra-lightweight, zero-dependency, isomorphic RichText processing module inside `@beechcms/client/richtext`. It provides two deterministic pure functions (`renderRichText` and `richTextToPlainText`) that operate universally across any JavaScript runtime (Node.js, Browser, Cloudflare Workers, Edge, Bun) with zero bundle overhead for consumers of the standard HTTP client.

---

# 2. Domain Boundaries and Business Rules

**Logical Entities**

- **RichText Document AST**: Standard TipTap / ProseMirror structured document tree containing block nodes, inline elements, text nodes, and mark attributes.
- **BeechCMS Schema Envelope**: Content container structure (`schemaVersion: 1`, `doc: { ... }`) used in BeechCMS database storage and API payloads.
- **HTML AST Walker**: Pure, deterministic traversal engine that serializes supported AST nodes and marks into secure, semantic HTML tags.
- **Plain Text Extractor**: Pure recursive text harvester that extracts raw textual content across the AST with deterministic block whitespace separation.
- **Subpath Package Entrypoint**: Isolated export `./richtext` within `@beechcms/client`, guaranteeing strict separation from the core HTTP client.

**Ironclad Rules**

1. **Zero External Runtime Dependencies**: The module must not import `@tiptap/html`, `prosemirror-*`, DOM shims (`jsdom`, `happy-dom`), or third-party sanitizers. The AST walker must be 100% self-contained and universally isomorphic.
2. **Strict Subpath Isolation**: Richtext rendering code must reside exclusively under the subpath `@beechcms/client/richtext`. Importing `@beechcms/client`, `@beechcms/client/browser`, or `@beechcms/client/server` must never pull in or execute richtext parsing logic.
3. **Fail-Safe Normalization (No Runtime Exceptions)**: Functions must never throw exceptions on invalid, unexpected, empty, non-object, or malformed inputs. Any invalid input must safely resolve to an empty string (`""`).
4. **Transparent Envelope Unwrapping**: Functions must natively accept and unwrap both raw TipTap doc objects (`{ type: 'doc', content: [...] }`) and BeechCMS schema envelopes (`{ schemaVersion: 1, doc: ... }`).
5. **Strict HTML Character Escaping**: All textual content within text nodes must be escaped for special HTML characters (`&`, `<`, `>`, `"`, `'`) before output generation.
6. **Strict Attribute Protocol Allowlist**: URL attributes (such as link `href` and image `src`) must be validated against a strict allowlist of safe protocols (`http:`, `https:`, `mailto:`, `tel:`). Dangerous protocols (`javascript:`, `data:`, `vbscript:`) must be stripped or neutralized.
7. **Safe Handling of Unknown Nodes & Developer Warning**: Any node type not defined in the supported BeechCMS schema must be skipped without injecting unescaped markup, emitting a descriptive English warning to `console.warn` to inform the developer.
8. **Stacked PR Integrity**: Branch `feature/tiptap-richtext-rendering` must branch directly from `feature/strict-client-sdk-segregation` and maintain clean target branch alignment for downstream planning.

---

# 3. Primary Requirements (User Stories)

* AS A frontend developer consuming BeechCMS APIs I WANT to render TipTap RichText AST into semantic HTML via `@beechcms/client/richtext` SO THAT I can display rich content on web pages without installing ProseMirror or DOM polyfill packages.
* AS A developer building SEO and social sharing tags I WANT to extract clean plain text from RichText structures via `richTextToPlainText` SO THAT I can generate accurate meta descriptions, OpenGraph text, and snippet previews without HTML tags.
* AS A performance-focused web developer I WANT richtext utilities to be strictly isolated under a subpath export SO THAT my application bundle size remains lightweight when I only use the HTTP client SDK.
* AS A frontend developer deploying to Edge and Serverless runtimes I WANT rendering utilities to run isomorphically across Node.js, Cloudflare Workers, Bun, and browsers SO THAT I do not encounter missing DOM or window errors during server-side rendering.
* AS A website visitor I WANT rendered HTML to be strictly sanitized against script execution and malicious link protocols SO THAT viewing content created in the CMS cannot expose me to Cross-Site Scripting (XSS) attacks.
* AS A frontend developer debugging content schemas I WANT unknown or unmapped AST nodes to log a clear warning in the console SO THAT I am immediately alerted to unhandled content types without breaking the page render.

---

# 4. Secondary Requirements and Logical Constraints

**Normalization & Fallback Edge Cases**

- `null`, `undefined`, boolean, numeric, array, or empty string inputs return `""`.
- Non-doc object inputs (missing `type: 'doc'` and missing valid envelope) return `""`.
- Legacy string inputs (raw HTML strings) return `""` (drop-to-empty, adhering to BeechCMS stored-XSS defense invariants).
- Envelope v1 payloads with missing or non-object `doc` properties return `""`.

**Supported Node and Mark Matrix**

- **Block Nodes**: Document (`doc`), Paragraph (`paragraph`), Heading (`heading` with levels 1 to 6), Blockquote (`blockquote`), Code Block (`codeBlock`), Horizontal Rule (`horizontalRule`), Bullet List (`bulletList`), Ordered List (`orderedList`), List Item (`listItem`), Table family (`table`, `tableRow`, `tableHeader`, `tableCell`).
- **Inline & Media Nodes**: Text (`text`), Image (`image` with `src`, `alt`, `title`), Mathematics (`mathematics` rendered with text fallback).
- **Marks**: Bold (`bold` / `strong`), Italic (`italic` / `em`), Strike (`strike` / `s`), Underline (`underline` / `u`), Code (`code`), Highlight (`highlight`), Superscript (`superscript`), Subscript (`subscript`), Link (`link` with validated `href`, `target`, `rel`).

**Plain Text Extraction Logic**

- Traverses all child nodes recursively and collects text node strings.
- Inserts single-space or newline separators between adjacent block-level elements to prevent words from running together across paragraphs or list items.
- Strips excessive whitespace and trims leading/trailing spaces from the final result.

**Developer Diagnostics Contract**

- When an unrecognized node type is encountered during HTML rendering or plain text extraction, emit `console.warn` with format: `[BeechCMS RichText] Unrecognized node type "${node.type}". Skipping node.`

---

# 5. Out of Scope (Discarded during sparring)

- **External TipTap / ProseMirror Dependencies (`@tiptap/html`, `prosemirror-*`)**: Discarded to maintain a zero-dependency client SDK, avoid DOM polyfills in serverless environments, and minimize bundle footprint.
- **Dynamic Plugin / Extension Registry**: Discarded under YAGNI principles; the BeechCMS content schema is fixed and deterministic. No runtime extension manager is provided.
- **UI Framework Components (React / Vue / Svelte / Solid renderers)**: Discarded; the client package provides pure string-based HTML and plain text utilities, delegating component wrappers to consumer UI libraries.
- **Text Truncation, Word-Boundary Clipping, and Ellipsis Helpers**: Discarded; length constraints and snippet clipping remain the responsibility of consuming application logic.
- **External Sanitization Libraries (DOMPurify, sanitize-html)**: Discarded; security is achieved natively through structural AST parsing, text node character escaping, and strict protocol allowlists.
- **Automatic Client-Side Response Mutation / Middleware**: Discarded; HTTP client methods return raw API response data without automatically parsing or rendering RichText fields at fetch time.
