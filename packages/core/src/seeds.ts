/**
 * Seed Registry: configurazione degli schemi di contenuto.
 * In v0.4.0 ogni Seed genera una tabella `content_{slug}` con colonne reali.
 * `branch.alias` è il nome della colonna SQL.
 */
import type { Seed } from './types.js'

/** Articolo: contenuto editoriale con richtext, immagine e SEO */
export const ARTICOLO_SEED: Seed = {
  slug: 'articoli',
  label: 'Articolo',
  labelPlural: 'Articoli',
  displayNameAlias: 'title',
  allowPublicRead: true,
  allowDrafts: true,
  branches: [
    { alias: 'title', label: 'Titolo', type: 'text' },
    { alias: 'publishedAt', label: 'Data pubblicazione', type: 'date' },
    { alias: 'coverImage', label: 'Immagine copertina', type: 'file' },
    { alias: 'tags', label: 'Tag', type: 'json', options: ['cms', 'tutorial', 'release', 'annuncio', 'guida', 'news', 'aggiornamento'] },
    { alias: 'body', label: 'Corpo articolo', type: 'richtext' },
    { alias: 'metaTitle', label: 'Meta titolo (SEO)', type: 'text' },
    { alias: 'metaDescription', label: 'Meta descrizione (SEO)', type: 'text' },
  ],
}

/** Prodotto: scheda prodotto e-commerce con richtext, galleria e SEO */
export const PRODOTTO_SEED: Seed = {
  slug: 'prodotti',
  label: 'Prodotto',
  labelPlural: 'Prodotti',
  displayNameAlias: 'name',
  allowPublicRead: true,
  branches: [
    { alias: 'name', label: 'Nome', type: 'text' },
    { alias: 'price', label: 'Prezzo (€)', type: 'number' },
    { alias: 'stock', label: 'Quantità disponibile', type: 'number' },
    { alias: 'active', label: 'In vendita', type: 'boolean' },
    { alias: 'coverImage', label: 'Immagine principale', type: 'file' },
    { alias: 'images', label: 'Galleria immagini', type: 'file', multiple: true, format: 'asset-list' },
    { alias: 'description', label: 'Descrizione', type: 'richtext' },
    { alias: 'metaTitle', label: 'Meta titolo (SEO)', type: 'text' },
    { alias: 'metaDescription', label: 'Meta descrizione (SEO)', type: 'text' },
  ],
}

/** Membro del team: profilo con foto e link social */
export const TEAM_SEED: Seed = {
  slug: 'team',
  label: 'Membro',
  labelPlural: 'Team',
  displayNameAlias: 'name',
  allowPublicRead: true,
  branches: [
    { alias: 'name', label: 'Nome', type: 'text' },
    { alias: 'role', label: 'Ruolo', type: 'text' },
    { alias: 'bio', label: 'Bio breve', type: 'text' },
    { alias: 'photo', label: 'Foto', type: 'file' },
    { alias: 'linkedIn', label: 'URL LinkedIn', type: 'text' },
    { alias: 'active', label: 'Visibile', type: 'boolean' },
    { alias: 'metaTitle', label: 'Meta titolo (SEO)', type: 'text' },
    { alias: 'metaDescription', label: 'Meta descrizione (SEO)', type: 'text' },
  ],
}

/** Testimonianza: recensione cliente con valutazione e foto */
export const TESTIMONIANZA_SEED: Seed = {
  slug: 'testimonianze',
  label: 'Testimonianza',
  labelPlural: 'Testimonianze',
  displayNameAlias: 'author',
  allowPublicRead: true,
  branches: [
    { alias: 'author', label: 'Autore', type: 'text' },
    { alias: 'company', label: 'Azienda', type: 'text' },
    { alias: 'quote', label: 'Citazione', type: 'text' },
    { alias: 'rating', label: 'Valutazione (1-5)', type: 'number' },
    { alias: 'date', label: 'Data', type: 'date' },
    { alias: 'photo', label: 'Foto autore', type: 'file' },
    { alias: 'active', label: 'Pubblica', type: 'boolean' },
    { alias: 'metaTitle', label: 'Meta titolo (SEO)', type: 'text' },
    { alias: 'metaDescription', label: 'Meta descrizione (SEO)', type: 'text' },
  ],
}

/** Pagina: pagina statica con richtext, immagine hero e SEO */
export const PAGINA_SEED: Seed = {
  slug: 'pagine',
  label: 'Pagina',
  labelPlural: 'Pagine',
  displayNameAlias: 'title',
  allowPublicRead: true,
  allowDrafts: true,
  branches: [
    { alias: 'title', label: 'Titolo', type: 'text' },
    { alias: 'coverImage', label: 'Immagine hero', type: 'file' },
    { alias: 'body', label: 'Contenuto', type: 'richtext' },
    { alias: 'metaTitle', label: 'Meta titolo (SEO)', type: 'text' },
    { alias: 'metaDescription', label: 'Meta descrizione (SEO)', type: 'text' },
  ],
}

/**
 * Cliente: dimostra tutte le assi di Branch.policies.
 *
 * email        → visibility:masked, search:false, public:false
 * passwordHash → privacy:hash, visibility:hidden, search/filter/sort/public: false
 * phone        → visibility:masked, filter:false, public:false
 * internalNote → visibility:hidden, search:false, public:false
 * registeredAt → public:false (data interna, non esposta)
 */
export const CLIENTE_SEED: Seed = {
  slug: 'clienti',
  label: 'Cliente',
  labelPlural: 'Clienti',
  displayNameAlias: 'name',
  allowPublicRead: true,
  branches: [
    { alias: 'name', label: 'Nome', type: 'text' },
    {
      alias: 'email',
      label: 'Email',
      type: 'text',
      policies: { visibility: 'masked', search: false, public: false },
    },
    {
      alias: 'passwordHash',
      label: 'Password (hash)',
      type: 'text',
      policies: { privacy: 'hash', visibility: 'hidden', search: false, filter: false, sort: false, public: false },
    },
    {
      alias: 'tier',
      label: 'Piano',
      type: 'text',
      options: ['free', 'starter', 'pro', 'enterprise'],
    },
    {
      alias: 'phone',
      label: 'Telefono',
      type: 'text',
      policies: { visibility: 'masked', filter: false, public: false },
    },
    {
      alias: 'internalNote',
      label: 'Note interne',
      type: 'text',
      policies: { visibility: 'hidden', search: false, public: false },
    },
    {
      alias: 'registeredAt',
      label: 'Data iscrizione',
      type: 'date',
      policies: { public: false },
    },
    { alias: 'active', label: 'Attivo', type: 'boolean' },
  ],
}

/**
 * TODO: Rimuovere al termine dei test del testsite
 * Messaggio di contatto: per form contatti esterni
 */
export const MESSAGGI_SEED: Seed = {
  slug: 'messaggi',
  label: 'Messaggio',
  labelPlural: 'Messaggi',
  displayNameAlias: 'name',
  allowPublicPost: true,
  allowPublicEdit: true,
  branches: [
    { alias: 'name', label: 'Nome mittente', type: 'text', requiredOnCreate: true },
    { alias: 'email', label: 'Email mittente', type: 'text', requiredOnCreate: true },
    { alias: 'subject', label: 'Oggetto', type: 'text', requiredOnCreate: true },
    { alias: 'message', label: 'Messaggio', type: 'richtext', requiredOnCreate: true },
    { alias: 'read', label: 'Letto', type: 'boolean' },
  ],
}

/** Registro: slug -> Seed */
export const SEED_REGISTRY: Record<string, Seed> = {
  articoli: ARTICOLO_SEED,
  prodotti: PRODOTTO_SEED,
  team: TEAM_SEED,
  testimonianze: TESTIMONIANZA_SEED,
  pagine: PAGINA_SEED,
  clienti: CLIENTE_SEED,
  messaggi: MESSAGGI_SEED,
}

/** Ritorna il Seed per lo slug dato, o null se non esiste. */
export function getSeed(slug: string): Seed | null {
  return SEED_REGISTRY[slug] ?? null
}
