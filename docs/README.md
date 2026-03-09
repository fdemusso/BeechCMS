# 🌳 Beech CMS 

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat&logo=opensourceinitiative&logoColor=white) NON IMPLEMENTATA
![TypeScript](https://img.shields.io/badge/TypeScript-%233178C6.svg?style=flat&logo=typescript&logoColor=white)
![Turborepo](https://img.shields.io/badge/Turborepo-%23EF4444.svg?style=flat&logo=turborepo&logoColor=white)

> Un Content Management System moderno, *schema-driven* e basato su un'architettura ibrida SQL/JSON, progettato per il deployment edge su Cloudflare.

---

## 👁️ Panoramica del Progetto (Perché Beech CMS?)
**Beech CMS** nasce per risolvere un problema comune nello sviluppo di CMS: la rottura dei dati lato frontend quando si rinomina un campo nel database. 

Per risolvere questo problema, ho progettato il **Botanical Engine**, un layer di traduzione che disaccoppia gli *alias* pubblici utilizzati dalle API dagli *ID interni immutabili* salvati nel database. Questo permette agli sviluppatori di far evolvere gli schemi dei dati senza dover ricorrere a complesse e rischiose migrazioni SQL.

Se sei un **recruiter o un hiring manager**, questo progetto dimostra la mia capacità di:
* Progettare **architetture software complesse** (Monorepo, Pattern Registry per la UI).
* Gestire la **sicurezza** (Autenticazione JWT con Refresh Token e rotazione).
* Costruire **soluzioni full-stack** moderne e performanti (React, Cloudflare Workers, D1, R2).

![Screenshot della Dashboard di Beech CMS](assets/screenshot.png) *(Nota: Aggiungi qui una GIF o uno screen della tua UI!)*

---

## ✨ Funzionalità Principali (Key Features)
* 🧠 **Botanical Engine:** Traduzione dinamica tra Alias (Frontend) e ID Immutabili (DB). Rinomina i campi senza rompere i vecchi JSON.
* 🗄️ **Motore Ibrido SQL/JSON (Content Engine):** Sfrutta la stabilità di SQL (Cloudflare D1) per le query e la flessibilità del JSON per i payload dinamici dei contenuti.
* 🔒 **Autenticazione Sicura:** Flusso JWT ibrido con Access Token (memoria) e Refresh Token (httpOnly cookie) protetti da attacchi XSS e CSRF. Rate limiting integrato.
* ☁️ **Media Engine integrato:** Upload e distribuzione dei file nativa tramite Cloudflare R2 (API S3-compatibile).
* 🎨 **UI Schema-Driven (Field Renderers):** Dashboard React che renderizza dinamicamente tabelle, form e viste Kanban utilizzando un robusto *Registry Pattern*.

## 🛠️ Tech Stack
* **Frontend:** React, TypeScript, Tailwind CSS, Vite
* **Backend:** Node.js, Cloudflare Workers
* **Database & Storage:** Cloudflare D1 (SQLite Edge), Cloudflare R2 (Object Storage)
* **Architettura:** Turborepo (Monorepo), npm workspaces

---

## 🚀 Quick Start (Per gli Sviluppatori)

Vuoi provare Beech CMS in locale? Il setup richiede meno di 5 minuti.

### Prerequisiti
* Node.js 18+
* [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installato per emulare l'ambiente Cloudflare.

### Installazione
1. **Clona il repository:**
   ```bash
   git clone https://github.com/fdemusso/BeechCMS.git
   cd beech-cms
   ```
2. **Installa le dipendenze del monorepo:**
   ```bash
   npm install
   ```
3. **Configura le variabili d'ambiente (per l'upload R2):**
   ```bash
   cp apps/api/.dev.vars.example apps/api/.dev.vars
   # Compila con le tue credenziali Cloudflare R2
   ```
4. **Avvia l'ambiente di sviluppo:**
   ```bash
   npm run dev
   ```
   *Questo avvierà in parallelo sia l'API (Cloudflare Worker) che la Dashboard.*

---

## 📚 Documentazione Tecnica (Deep Dive)

Per i contributor e i membri del team, l'architettura dettagliata di ogni modulo è documentata qui sotto. L'infrastruttura si divide in un monorepo gestito tramite Turborepo:

| Documento | Descrizione |
| ------ | ------ |
| [Architettura Monorepo](./docs/monorepo.md) | Struttura Turborepo, `@beech/core`, workspace |
| [Botanical Engine](./docs/botanical-engine.md) | Layer di traduzione alias ↔ ID interni (Seed, Branch) |
| [Content Engine](./docs/content-engine.md) | CRUD schema-driven, architettura ibrida SQL/JSON |
| [Field Renderers](./docs/field-renderers.md) | Registry Pattern per display/edit campi nella UI |
| [Media Engine](./docs/media-engine.md) | Upload su Cloudflare R2, API S3-compatibile |
| [Autenticazione](./docs/auth.md) | JWT, refresh token, login, rate limiting |
| [Field types action plan](./docs/field-types-action-plan.md) | Piano d'azione tecnico per i campi |
| [Field types roadmap](./docs/field-types-roadmap.md) | Roadmap dei tipi di campo (WordPress killer) |

## 🤝 Contribuire
Siamo aperti a contributi! Se vuoi aiutare a costruire il "WordPress killer" per l'era serverless, apri una issue o invia una Pull Request. Assicurati di leggere prima l'[Architettura Monorepo](./docs/monorepo.md) per capire la struttura dei pacchetti.

## 📄 Licenza
Questo progetto è distribuito sotto licenza MIT. Vedi il file `LICENSE` per maggiori informazioni. [NON ANCORA IMPLEMENTATA]

---
**👨‍💻 Creato da [Flavio De Musso](https://github.com/fdemusso)**
*Se sei un recruiter e vuoi saperne di più sul mio approccio allo sviluppo software, [contattami su Gmail](mailto:demusso1617@gmail.com).*
