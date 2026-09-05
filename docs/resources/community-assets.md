---
title: Community Assets & Starters
description: Official branding assets, frontend starter kits, UI components, and community extensions for BeechCMS.
---

# Community Assets & Starters

Welcome to the BeechCMS resource hub. Here you will find official brand logos, frontend starter templates, UI components, and community developer tooling to accelerate your BeechCMS projects.

---

## Brand Assets & Logos

BeechCMS brand marks and visual assets are free to use in your applications, documentation, and blog posts.

| Asset | Format | Preview / Link | Description |
| :--- | :---: | :--- | :--- |
| **Beech Logo Mark** | SVG | `/images/BeechLogo.svg` | The iconic BeechCMS leaf favicon and icon mark. |
| **Beech Wordmark (Light Mode)** | SVG | `/images/LightBeech.svg` | Full dark-text logo designed for light backgrounds. |
| **Beech Wordmark (Dark Mode)** | SVG | `/images/DarkBeech.svg` | Full light-text logo designed for dark backgrounds. |

### Color Palette & Design Tokens

BeechCMS uses a calming botanical design palette:

- **Emerald Forest (Primary)**: `#10b981` (Accent: `#059669`)
- **Deep Slate (Background Dark)**: `#090d16`
- **Parchment Surface (Background Light)**: `#f8fafc`
- **Text Headings**: `font-serif` (Lora) paired with `Geist` / `Inter` body typography.

---

## Frontend Starter Kits

Kickstart your frontend application with ready-to-deploy reference templates pre-configured with `@beechcms/client` and `@beechcms/forms-react`:

### 1. Astro Starter
- **Stack**: Astro 4 + Tailwind CSS + BeechCMS Client SDK
- **Features**: Islands architecture, SSG build-time rendering with on-demand edge ISR, zero client-side JavaScript by default.
- **Use Case**: High-performance marketing sites, blogs, and documentation portals.

### 2. Next.js App Router Starter
- **Stack**: Next.js 14 (App Router) + React Server Components + BeechCMS Forms React
- **Features**: Streaming SSR, Server Actions for dynamic queries, zero-waterfall content rendering.
- **Use Case**: Complex web applications, e-commerce storefronts, and customer portals.

### 3. Remix & React Router Starter
- **Stack**: Remix / React Router v7 + Cloudflare Pages
- **Features**: Edge runtime loaders, nested routing, optimistic UI mutations.
- **Use Case**: Dynamic interactive web applications with real-time editorial previews.

---

## UI Kits & Component Libraries

Integrate BeechCMS field types and form builders into your existing design systems:

### `@beechcms/forms-react`
- Full-featured dynamic form builder with invisible anti-bot defenses (Time-Trap + Honeypot).
- Headless hooks (`useBeechForm`) for complete design control with Tailwind CSS and Shadcn UI.
- [Read the Forms SDK Guide](/features/forms).

### `@beechcms/widget-sdk`
- Build custom visual field editors in the BeechCMS Dashboard.
- Secure iframe isolation with bidirectional RPC communication.
- [Read the Custom Widgets Guide](/build/custom-widgets).

---

## Community & Contributing

BeechCMS is built in the open with an active community of developers and designers.

- **GitHub Repository**: [github.com/flaviodemusso/BeechCMS](https://github.com/flaviodemusso/BeechCMS)
- **Report Issues**: Submit bug reports and feature requests via GitHub Issues.
- **Pull Requests**: We welcome contributions! Review our contribution guidelines and code style before opening PRs.
