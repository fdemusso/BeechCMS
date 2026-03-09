# Field types roadmap – WordPress killer

Tipi di campo da integrare in Beech CMS per il posizionamento **sito statico + contenuti dinamici** (form contatti, gallerie, pagine/articoli). Non inclusi: formule (orientate a CRM/gestionale).

---

## Set core (da implementare)

| Tipo | Uso tipico |
|------|-------------|
| **text** | Titoli, descrizioni, nome, messaggio form |
| **number** | Prezzi, quantità, ordinamento |
| **checkbox** | Pubblicato, in evidenza, “Mostra in homepage” |
| **date** / **datetime** | Data pubblicazione, evento, range “dal–al” |
| **select** | Layout, categoria, stato (scelta singola) |
| **multi-select** | Categorie, destinatari |
| **tag** | Tag con colore (es. progetti) |
| **url** | Link pulsante, link esterno, sito |
| **email** | Contatto, autore, form |
| **phone** | Contatto, form |
| **file** / **media** | Immagini, PDF, download, galleria (singolo o multiplo) |
| **relation** | “Questa pagina usa questa galleria”, post → categoria (relazione leggera) |
| **place** | Indirizzo, “Dove siamo”, evento |
| **json** | Blocchi custom, metadati (già presente) |
| **richtext** | Corpo articolo, pagina (grassetto, link, liste). Tipo dedicato con `format: plain \| markdown \| html`. Essenziale per un CMS. |
| **slug** | Identificatore URL (es. `/blog/mio-articolo`). Validazione + auto-generazione da titolo. Essenziale per URL puliti. |

---

## Opzionali (nice-to-have)

| Tipo | Uso | Nota |
|------|-----|------|
| **color** | Brand, badge, tema (hex) | Può essere `text` con validazione; tipo dedicato migliora UX. |

---

## Esclusi (fuori scope)

- **Formule** – orientate a CRM/gestionale (Frappe, Airtable); non necessarie per sito statico + dinamico serverless.
- **Created/updated time** – coperti dai campi di sistema `created_at` / `updated_at` sulla riga.

---

## Riferimenti

- [Botanical Engine](botanical-engine.md) – Branch, Seed, tipi attuali (`text`, `number`, `boolean`, `json`, `date`).
- [Content Engine](content-engine.md) – CRUD e storage `content_entries`.
- [Field Renderers](field-renderers.md) – Registry Pattern per display/edit campi nella dashboard.
