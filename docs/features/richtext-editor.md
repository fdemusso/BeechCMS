---
title: TipTap Rich Text Engine
description: Structured JSON rich text editing, inline media uploads, orphaned asset cleanup, and sanitization in BeechCMS.
---

# TipTap Rich Text Engine

BeechCMS ships with a modern, extensible rich text editor built on top of [TipTap](https://tiptap.dev/) and ProseMirror. Rather than storing brittle raw HTML or markdown strings that break between layout changes, the editor produces clean, portable **Structured JSON Abstract Syntax Trees (AST)**.

This enables frontend applications in React, Next.js, Vue, Astro, or mobile apps to render rich content with complete design system autonomy.

<p align="center">
  <img src="/images/richtext-architecture-pipeline.svg" alt="BeechCMS TipTap Rich Text & Structured AST Architecture" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

---

## Key Capabilities

- **Structured JSON AST Output**: Eliminates parsing ambiguity. Content is serialized as typed ProseMirror JSON nodes and marks.
- **Direct-to-R2 Inline Media Uploads**: Paste or drag images directly into the editing canvas. Images are uploaded immediately via presigned URLs and inserted seamlessly.
- **Orphaned Media Auto-Cleanup**: If an editor uploads an image during a session but later removes it or cancels editing, BeechCMS automatically tracks session uploads and cleans up unreferenced media files from Cloudflare R2 on unmount.
- **XSS Sanitization & Hardening**: Dangerous tags, executable JavaScript schemas (`javascript:`), and malformed markup are stripped both on client input and on server ingestion during Botanical Seed validation.
- **Formatting & Formatting Marks**: Headings (H1-H6), blockquotes, code blocks with syntax highlighting, bullet/ordered lists, tables, horizontal rules, links, and text formatting (bold, italic, strikethrough, inline code).

---

## Defining Rich Text in Seeds

To add a rich text field to a Botanical Seed, define a branch with `type: 'richtext'`:

```typescript
import { defineSeed } from '@beechcms/core'

export const ArticleSeed = defineSeed({
  slug: 'articles',
  name: 'Articles',
  branches: [
    { alias: 'title', type: 'text', required: true },
    {
      alias: 'body',
      type: 'richtext', // [!code highlight]
      required: true,
      description: 'Main article content'
    }
  ]
})
```

---

## JSON AST Format

The stored data structure looks like this:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 2 },
      "content": [
        { "type": "text", "text": "Edge CMS Architecture" }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "BeechCMS runs entirely at the edge on " },
        {
          "type": "text",
          "marks": [{ "type": "bold" }],
          "text": "Cloudflare Workers and D1"
        },
        { "type": "text", "text": "." }
      ]
    },
    {
      "type": "image",
      "attrs": {
        "src": "/api/media/1717000000-a1b2-diagram.webp",
        "alt": "Architecture diagram"
      }
    }
  ]
}
```

---

## Rendering in Frontend Frameworks

### React / Next.js

You can render the JSON tree using `@tiptap/react` or a lightweight custom recursive renderer:

```tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'

export function RichTextRenderer({ content }: { content: any }) {
  const editor = useEditor({
    editable: false,
    content: content,
    extensions: [StarterKit, Image],
  })

  return <EditorContent editor={editor} className="prose prose-neutral max-w-none" />
}
```

### Headless / Astro / Vue / HTML Export

If your frontend consumes static HTML, BeechCMS provides utility helpers in `@beechcms/core` to compile the AST to sanitized HTML during build time:

```typescript
import { renderRichTextToHtml } from '@beechcms/core'

const html = renderRichTextToHtml(article.body)
```

---

## Security & Sanitization

To protect consumer frontends from Cross-Site Scripting (XSS):
1. **Server Validation**: The Botanical Engine executes `validateAndSanitizeSeedPayload` on every write operation.
2. **Dangerous Content Rejection**: Payloads containing disallowed script attributes (`onload`, `onerror`) or raw script tags trigger `422 content-dangerous-content`.
3. **Link URL Whitelisting**: Links in rich text nodes are strictly verified against allowed protocols (`http`, `https`, `mailto`, `tel`).
