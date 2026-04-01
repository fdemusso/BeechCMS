# 🌳 Beech CMS

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat&logo=opensourceinitiative&logoColor=white) **NOT IMPLEMENTED**
![TypeScript](https://img.shields.io/badge/TypeScript-%233178C6.svg?style=flat&logo=typescript&logoColor=white)
![Turborepo](https://img.shields.io/badge/Turborepo-%23EF4444.svg?style=flat&logo=turborepo&logoColor=white)

> A modern, *schema‑driven* Content Management System built on a hybrid SQL/JSON architecture, designed for edge deployment on Cloudflare.

> If you are an AI agent, you can directly read the system map at [SYSTEM_MAP.md](./docs/SYSTEM_MAP.md).

---

## 👁️ Project Overview (Why Beech CMS?)

**Beech CMS** was created to solve a common problem in CMS development: breaking frontend data when a database field is renamed.

To address this, I designed the **Botanical Engine**, a translation layer that decouples public *aliases* used by the API from immutable internal *IDs* stored in the database. This lets developers evolve data schemas without costly or risky SQL migrations.

If you are a **recruiter or hiring manager**, this project demonstrates my ability to:

- Design **complex software architectures** (Monorepo, Registry Pattern for UI).
- Manage **security** (JWT authentication with refresh tokens and rotation).
- Build **modern full‑stack solutions** (React, Cloudflare Workers, D1, R2).

![Beech CMS Dashboard screenshot](assets/screenshot.png) *(Add a GIF or screenshot of the UI here!)*

---

## ✨ Core Features

- 🧠 **Botanical Engine:** Dynamic translation between API aliases and immutable DB IDs. Rename fields without breaking existing JSON.
- 🗄️ **Hybrid SQL/JSON Content Engine:** Leverages the stability of SQL (Cloudflare D1) for queries and the flexibility of JSON for dynamic content payloads.
- 🔒 **Secure Authentication:** Hybrid JWT flow with in‑memory Access Token and httpOnly Refresh Token, protected against XSS and CSRF. Integrated rate limiting.
- ☁️ **Integrated Media Engine:** Native file upload and delivery via Cloudflare R2 (S3‑compatible API).
- 🎨 **Schema‑Driven UI (Field Renderers):** React dashboard that dynamically renders tables, forms, and Kanban views using a robust *Registry Pattern*.

## 🛠️ Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, Vite
- **Backend:** Node.js, Cloudflare Workers
- **Database & Storage:** Cloudflare D1 (SQLite Edge), Cloudflare R2 (Object Storage)
- **Architecture:** Turborepo (Monorepo), npm workspaces

---

## 🚀 Quick Start (For Developers)

Want to try Beech CMS locally? The setup takes under 5 minutes.

### Prerequisites
- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed to emulate the Cloudflare environment.

### Installation
1. **Clone the repository:**
   ```bash
   git clone https://github.com/fdemusso/BeechCMS.git
   cd beech-cms
   ```
2. **Install monorepo dependencies:**
   ```bash
   npm install
   ```
3. **Configure environment variables (for R2 uploads):**
   ```bash
   cp apps/api/.dev.vars.example apps/api/.dev.vars
   # Fill in your Cloudflare R2 credentials
   ```
4. **Start the development environment:**
   ```bash
   npm run dev
   ```
   *This runs both the API (Cloudflare Worker) and the Dashboard in parallel.*

---

## 📚 Technical Documentation (Deep Dive)

For contributors and team members, detailed architecture of each module is documented below. The project is organized as a Turborepo monorepo:

| Document | Description |
| -------- | ----------- |
| [Monorepo Architecture](./docs/monorepo.md) | Turborepo layout, `@beech/core`, workspaces |
| [Botanical Engine](./docs/botanical-engine.md) | Alias ↔ internal ID translation (Seed, Branch) |
| [Content Engine](./docs/content-engine.md) | Schema‑driven CRUD + server‑side query (search/sort/filters/pagination) and dynamic facets |
| [Field Renderers](./docs/field-renderers.md) | Registry Pattern for UI display/edit of fields |
| [Media Engine](./docs/media-engine.md) | Upload to Cloudflare R2, S3‑compatible API |
| [Authentication](./docs/auth.md) | JWT, refresh token, login, rate limiting |
| [Dashboard Components](./docs/dashboard-components.md) | ContentToolbar + DataTable: server‑driven filters/sort/search/pagination |
| [Field Types Action Plan](./docs/field-types-action-plan.md) | Technical implementation plan for field types |
| [Field Types Roadmap](./docs/field-types-roadmap.md) | Roadmap of field types (WordPress‑killer) |

---

## 🤝 Contributing

We welcome contributions! If you want to help build the **“WordPress killer”** for the serverless era, open an issue or submit a Pull Request. Please read the [Monorepo Architecture](./docs/monorepo.md) first to understand the package layout.

## 📄 License

This project is released under the MIT license. See the `LICENSE` file for details. **NOT YET IMPLEMENTED**

---

**👨‍💻 Created by [Flavio De Musso](https://github.com/fdemusso)**  
*If you’re a recruiter and want to learn more about my software development approach, feel free to [contact me via Gmail](mailto:demusso1617@gmail.com).*
