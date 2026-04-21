/**
 * Seed Registry: configurazione degli schemi di contenuto.
 * Ogni slug (es. 'articoli', 'prodotti') mappa a un Seed con la definizione dei campi.
 *
 * Convenzioni ID branch: prefisso per seed (art_*, prd_*, tm_*, tes_*, pag_*)
 * per evitare collisioni nei dati JSON salvati in D1.
 */
import type { Seed } from './types'

/** Articolo: contenuto editoriale con richtext, immagine e SEO */
export const ARTICOLO_SEED: Seed = {
  slug: 'articoli',
  label: 'Articolo',
  labelPlural: 'Articoli',
  displayNameAlias: 'title',
  allowPublicRead: true,
  branches: [
    { id: 'art_01', alias: 'title', label: 'Titolo', type: 'text' },
    { id: 'art_02', alias: 'publishedAt', label: 'Data pubblicazione', type: 'date' },
    { id: 'art_03', alias: 'coverImage', label: 'Immagine copertina', type: 'file' },
    { id: 'art_04', alias: 'tags', label: 'Tag', type: 'json', options: ['cms', 'tutorial', 'release', 'annuncio', 'guida', 'news', 'aggiornamento'] },
    { id: 'art_05', alias: 'body', label: 'Corpo articolo', type: 'richtext' },
    { id: 'art_06', alias: 'metaTitle', label: 'Meta titolo (SEO)', type: 'text' },
    { id: 'art_07', alias: 'metaDescription', label: 'Meta descrizione (SEO)', type: 'text' },
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
    { id: 'prd_01', alias: 'name', label: 'Nome', type: 'text' },
    { id: 'prd_02', alias: 'price', label: 'Prezzo (€)', type: 'number' },
    { id: 'prd_03', alias: 'stock', label: 'Quantità disponibile', type: 'number' },
    { id: 'prd_04', alias: 'active', label: 'In vendita', type: 'boolean' },
    { id: 'prd_05', alias: 'coverImage', label: 'Immagine principale', type: 'file' },
    {
      id: 'prd_06',
      alias: 'images',
      label: 'Galleria immagini',
      type: 'file',
      multiple: true,
      format: 'asset-list',
    },
    { id: 'prd_07', alias: 'description', label: 'Descrizione', type: 'richtext' },
    { id: 'prd_08', alias: 'metaTitle', label: 'Meta titolo (SEO)', type: 'text' },
    { id: 'prd_09', alias: 'metaDescription', label: 'Meta descrizione (SEO)', type: 'text' },
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
    { id: 'tm_01', alias: 'name', label: 'Nome', type: 'text' },
    { id: 'tm_02', alias: 'role', label: 'Ruolo', type: 'text' },
    { id: 'tm_03', alias: 'bio', label: 'Bio breve', type: 'text' },
    { id: 'tm_04', alias: 'photo', label: 'Foto', type: 'file' },
    { id: 'tm_05', alias: 'linkedIn', label: 'URL LinkedIn', type: 'text' },
    { id: 'tm_06', alias: 'active', label: 'Visibile', type: 'boolean' },
    { id: 'tm_07', alias: 'metaTitle', label: 'Meta titolo (SEO)', type: 'text' },
    { id: 'tm_08', alias: 'metaDescription', label: 'Meta descrizione (SEO)', type: 'text' },
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
    { id: 'tes_01', alias: 'author', label: 'Autore', type: 'text' },
    { id: 'tes_02', alias: 'company', label: 'Azienda', type: 'text' },
    { id: 'tes_03', alias: 'quote', label: 'Citazione', type: 'text' },
    { id: 'tes_04', alias: 'rating', label: 'Valutazione (1-5)', type: 'number' },
    { id: 'tes_05', alias: 'date', label: 'Data', type: 'date' },
    { id: 'tes_06', alias: 'photo', label: 'Foto autore', type: 'file' },
    { id: 'tes_07', alias: 'active', label: 'Pubblica', type: 'boolean' },
    { id: 'tes_08', alias: 'metaTitle', label: 'Meta titolo (SEO)', type: 'text' },
    { id: 'tes_09', alias: 'metaDescription', label: 'Meta descrizione (SEO)', type: 'text' },
  ],
}

/** Pagina: pagina statica con richtext, immagine hero e SEO */
export const PAGINA_SEED: Seed = {
  slug: 'pagine',
  label: 'Pagina',
  labelPlural: 'Pagine',
  displayNameAlias: 'title',
  allowPublicRead: true,
  branches: [
    { id: 'pag_01', alias: 'title', label: 'Titolo', type: 'text' },
    { id: 'pag_02', alias: 'coverImage', label: 'Immagine hero', type: 'file' },
    { id: 'pag_03', alias: 'body', label: 'Contenuto', type: 'richtext' },
    { id: 'pag_04', alias: 'metaTitle', label: 'Meta titolo (SEO)', type: 'text' },
    { id: 'pag_05', alias: 'metaDescription', label: 'Meta descrizione (SEO)', type: 'text' },
  ],
}

/**
 * Cliente: dimostra tutte le assi di Branch.policies.
 *
 * Mappa delle policy usate:
 *  clt_02 email        → visibility:masked, search:false, public:false
 *  clt_03 passwordHash → privacy:hash, visibility:hidden, search/filter/sort/public: false
 *  clt_05 phone        → visibility:masked, filter:false, public:false
 *  clt_06 internalNote → visibility:hidden, search:false, public:false
 *  clt_07 registeredAt → public:false  (data interna, non esposta)
 */
export const CLIENTE_SEED: Seed = {
  slug: 'clienti',
  label: 'Cliente',
  labelPlural: 'Clienti',
  displayNameAlias: 'name',
  allowPublicRead: true,
  branches: [
    { id: 'clt_01', alias: 'name', label: 'Nome', type: 'text' },
    {
      id: 'clt_02',
      alias: 'email',
      label: 'Email',
      type: 'text',
      policies: { visibility: 'masked', search: false, public: false },
    },
    {
      id: 'clt_03',
      alias: 'passwordHash',
      label: 'Password (hash)',
      type: 'text',
      policies: { privacy: 'hash', visibility: 'hidden', search: false, filter: false, sort: false, public: false },
    },
    {
      id: 'clt_04',
      alias: 'tier',
      label: 'Piano',
      type: 'text',
      options: ['free', 'starter', 'pro', 'enterprise'],
    },
    {
      id: 'clt_05',
      alias: 'phone',
      label: 'Telefono',
      type: 'text',
      policies: { visibility: 'masked', filter: false, public: false },
    },
    {
      id: 'clt_06',
      alias: 'internalNote',
      label: 'Note interne',
      type: 'text',
      policies: { visibility: 'hidden', search: false, public: false },
    },
    {
      id: 'clt_07',
      alias: 'registeredAt',
      label: 'Data iscrizione',
      type: 'date',
      policies: { public: false },
    },
    { id: 'clt_08', alias: 'active', label: 'Attivo', type: 'boolean' },
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
    { id: 'msg_01', alias: 'name', label: 'Nome mittente', type: 'text', requiredOnCreate: true },
    { id: 'msg_02', alias: 'email', label: 'Email mittente', type: 'text', requiredOnCreate: true },
    { id: 'msg_03', alias: 'subject', label: 'Oggetto', type: 'text', requiredOnCreate: true },
    { id: 'msg_04', alias: 'message', label: 'Messaggio', type: 'richtext', requiredOnCreate: true },
    { id: 'msg_05', alias: 'read', label: 'Letto', type: 'boolean' },
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

/**
 * Restituisce il Seed per lo slug dato, o null se non esiste.
 */
export function getSeed(slug: string): Seed | null {
  return SEED_REGISTRY[slug] ?? null
}
