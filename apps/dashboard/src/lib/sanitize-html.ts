// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Sanitizes HTML content before passing it to dangerouslySetInnerHTML.
 * Removes script tags, iframe/embed tags, inline event handlers (on*), and javascript: URIs.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ""
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")

  const dangerousTags = ["script", "iframe", "object", "embed", "link", "style", "meta", "base"]
  for (const tag of dangerousTags) {
    const elements = doc.querySelectorAll(tag)
    elements.forEach((el) => el.remove())
  }

  const allElements = doc.body.querySelectorAll("*")
  allElements.forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith("on")) {
        el.removeAttribute(attr.name)
      } else if (
        (attr.name === "href" || attr.name === "src") &&
        attr.value.trim().toLowerCase().startsWith("javascript:")
      ) {
        el.removeAttribute(attr.name)
      }
    }
  })

  return doc.body.innerHTML
}
