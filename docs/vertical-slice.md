# Vertical Slice Architecture in una Web App React Serverless

Una guida completa all'organizzazione del codice, struttura delle cartelle, naming convention e regole di mantenibilità per applicazioni React con backend serverless (AWS Lambda / Vercel Functions / Cloudflare Workers).

***

## 1. Cos'è la Vertical Slice Architecture

La Vertical Slice Architecture (VSA) organizza il codice **per feature**, non per layer tecnico. Ogni "slice" è un taglio verticale dell'applicazione che attraversa tutti i livelli — UI, logica di business, accesso ai dati — e li raggruppa in un unico posto coeso.

**Confronto con l'approccio tradizionale a layer:**

| Criterio | Layer-Based | Vertical Slice |
|---|---|---|
| Organizzazione | Per tipo tecnico (components, services, hooks) | Per dominio di business (auth, checkout, dashboard) |
| Navigazione codebase | Saltare tra N cartelle per capire 1 feature | Tutto in 1 cartella |
| Modifica di una feature | Tocca file in molte cartelle | Tocca file in 1 cartella |
| Eliminare una feature | Caccia al tesoro in tutto il progetto | Cancella 1 cartella |
| Onboarding | Richiede capire tutta l\'architettura | Basta capire 1 slice |
| Scalabilità del team | Conflitti di merge frequenti | Team ownership chiara per feature |

### Principio fondamentale

> *"Vertical coupling dentro uno slice, zero coupling tra slice diversi."*

Ogni feature si comporta come un **mini-applicativo autonomo**: ha i propri componenti, hook, API calls, tipi TypeScript e costanti. La comunicazione tra feature avviene solo attraverso interfacce pubbliche ben definite.

***

## 2. Struttura delle Cartelle

### Struttura di alto livello

```
my-app/
├── app/                         # Routing layer (Next.js App Router o Vite Router)
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx         # Entry point → importa da features/auth
│   │   └── register/
│   │       └── page.tsx
│   ├── dashboard/
│   │   └── page.tsx
│   ├── products/
│   │   ├── page.tsx
│   │   └── [productId]/
│   │       └── page.tsx
│   └── layout.tsx
│
├── features/                    # ← CUORE DELL'ARCHITETTURA
│   ├── auth/
│   ├── products/
│   ├── cart/
│   ├── checkout/
│   └── dashboard/
│
├── shared/                      # Codice condiviso tra features
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── types/
│   └── config/
│
├── api/                         # Serverless functions
│   ├── auth/
│   ├── products/
│   ├── cart/
│   └── checkout/
│
└── public/
```

### Struttura interna di una Feature

Ogni feature segue la stessa struttura interna consistente:

```
features/
└── products/
    ├── index.ts                 # Public API della feature (barrel export)
    │
    ├── components/              # Componenti UI solo di questa feature
    │   ├── ProductCard.tsx
    │   ├── ProductList.tsx
    │   ├── ProductFilters.tsx
    │   └── ProductCard.test.tsx
    │
    ├── hooks/                   # Hook React locali alla feature
    │   ├── useProducts.ts
    │   ├── useProductFilters.ts
    │   └── useProducts.test.ts
    │
    ├── api/                     # Client-side API calls (fetch verso serverless)
    │   ├── products.api.ts
    │   └── products.api.test.ts
    │
    ├── types/                   # Tipi TypeScript specifici
    │   └── product.types.ts
    │
    ├── store/                   # Stato locale (Zustand slice / React context)
    │   └── products.store.ts
    │
    ├── utils/                   # Utility pure specifiche della feature
    │   └── product.utils.ts
    │
    └── consts/                  # Costanti e enum locali
        └── product.consts.ts
```

### Struttura delle Serverless Functions

Il backend serverless **specchia la struttura delle features** frontend:

```
api/
└── products/
    ├── index.ts                 # Handler GET /api/products (list)
    ├── [id].ts                  # Handler GET/PUT/DELETE /api/products/:id
    ├── create.ts                # Handler POST /api/products
    │
    ├── handlers/                # Logica di business del handler
    │   ├── getProducts.handler.ts
    │   ├── createProduct.handler.ts
    │   └── deleteProduct.handler.ts
    │
    ├── validators/              # Validazione input (Zod)
    │   └── product.schema.ts
    │
    ├── repository/              # Accesso dati (DB, external API)
    │   └── product.repository.ts
    │
    └── types/                   # Tipi condivisi con il frontend (via shared/)
        └── product-api.types.ts
```

***

## 3. Naming Convention dei File

Un sistema di naming consistente riduce l\'ambiguità e rende la codebase leggibile senza aprire i file.

### Regole generali

| Categoria | Pattern | Esempio |
|---|---|---|
| Componente React | `PascalCase.tsx` | `ProductCard.tsx` |
| Hook custom | `use[Name].ts` | `useProducts.ts` |
| API client | `[name].api.ts` | `products.api.ts` |
| Store / State | `[name].store.ts` | `products.store.ts` |
| Tipi TypeScript | `[name].types.ts` | `product.types.ts` |
| Validatori (Zod) | `[name].schema.ts` | `product.schema.ts` |
| Utility pure | `[name].utils.ts` | `product.utils.ts` |
| Costanti | `[name].consts.ts` | `product.consts.ts` |
| Handler serverless | `[action][Entity].handler.ts` | `createProduct.handler.ts` |
| Repository | `[entity].repository.ts` | `product.repository.ts` |
| Test | `[filename].test.ts(x)` | `ProductCard.test.tsx` |
| Barrel export | `index.ts` | `index.ts` |

### Nomenclatura delle cartelle

- Tutte le cartelle in **kebab-case**: `product-reviews/`, `user-settings/`
- I nomi delle feature devono riflettere il **dominio di business**, non la tecnica: `checkout/` non `payment-form/`, `auth/` non `login-logout/`

***

## 4. Il Pattern `index.ts` — Public API della Feature

Il file `index.ts` di ogni feature è il **contratto pubblico** della slice. Solo ciò che viene esportato da questo file può essere importato da altre parti dell\'app (routing layer o shared).

```typescript
// features/products/index.ts

// Esporta solo i punti di accesso pubblici
export { ProductList } from './components/ProductList';
export { ProductCard } from './components/ProductCard';
export { useProducts } from './hooks/useProducts';
export type { Product, ProductFilters } from './types/product.types';

// NON esportare internals come utils, consts, repository
```

**Regola d\'oro:** se un file non appare nell\'`index.ts`, è un **dettaglio implementativo privato** della feature e non deve mai essere importato dall\'esterno.

***

## 5. Dependency Rules — Le Regole di Dipendenza

Queste regole sono **non negoziabili** per mantenere l\'isolamento tra slice:

```
┌─────────────────────────────────────────┐
│           ROUTING LAYER (app/)          │ ← può importare da: features/, shared/
├─────────────────────────────────────────┤
│            FEATURES LAYER               │ ← può importare da: shared/
│  ┌──────────┐  ┌──────────┐  ┌───────┐ │    NON può importare da: altre features!
│  │  auth/   │  │products/ │  │ cart/ │ │
│  └──────────┘  └──────────┘  └───────┘ │
├─────────────────────────────────────────┤
│            SHARED LAYER                 │ ← NON importa da nulla interno
│  components/ | hooks/ | lib/ | types/  │
└─────────────────────────────────────────┘
```

### Regole specifiche

1. **Routing → Features, Shared** ✅ Le pagine importano componenti e hook dalle features
2. **Features → Shared** ✅ Le features usano componenti e utility condivisi
3. **Shared → nulla di interno** ✅ Lo shared layer è la fondazione, non ha dipendenze interne
4. **Features → altre Features** ❌ **VIETATO** — causa tight coupling
5. **Features → Routing** ❌ **VIETATO** — inversione della dipendenza

### Come gestire la comunicazione tra features

Se due feature devono comunicare, esistono tre pattern accettabili:

**Pattern 1 — Promuovi a shared:**
Se `cart/` e `products/` condividono un tipo `ProductSummary`, spostalo in `shared/types/`.

**Pattern 2 — Event-driven con store globale:**
```typescript
// features/products/hooks/useProducts.ts
const { addToCart } = useCartStore(); // stato globale in shared/store
```

**Pattern 3 — Callback prop drilling attraverso il routing layer:**
La pagina in `app/` funge da orchestratore e passa callback verso feature indipendenti.

***

## 6. Struttura delle Serverless Functions

In un\'architettura serverless React (Vercel, AWS Lambda, Cloudflare Workers), ogni handler segue il pattern **Thin Handler + Handler Logic + Repository**:

```typescript
// api/products/index.ts — Handler principale (Thin)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getProductsHandler } from './handlers/getProducts.handler';
import { createProductHandler } from './handlers/createProduct.handler';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return getProductsHandler(req, res);
  if (req.method === 'POST') return createProductHandler(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}
```

```typescript
// api/products/handlers/getProducts.handler.ts — Logica di business
import { productRepository } from '../repository/product.repository';
import { ProductFiltersSchema } from '../validators/product.schema';

export async function getProductsHandler(req, res) {
  const parsed = ProductFiltersSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error });

  const products = await productRepository.findAll(parsed.data);
  return res.status(200).json({ data: products });
}
```

```typescript
// api/products/repository/product.repository.ts — Accesso dati
import { db } from '@/shared/lib/db'; // client DB in shared

export const productRepository = {
  async findAll(filters: ProductFilters) {
    return db.products.findMany({ where: filters });
  },
  async findById(id: string) {
    return db.products.findUnique({ where: { id } });
  },
};
```

***

## 7. Shared Layer — Cosa ci va

Lo `shared/` layer deve contenere **solo codice genuinamente riutilizzato** da almeno 2 feature diverse. La regola pratica: prima metti il codice nella feature. Promuovi a `shared/` solo quando lo usi una seconda volta.

```
shared/
├── components/           # Componenti UI generici (Button, Modal, Input, Table)
│   ├── Button.tsx
│   ├── Modal.tsx
│   └── DataTable.tsx
│
├── hooks/                # Hook generici (useDebounce, useLocalStorage, useFetch)
│   ├── useDebounce.ts
│   └── useIntersectionObserver.ts
│
├── lib/                  # Configurazione librerie terze (axios, db client, i18n)
│   ├── api-client.ts
│   ├── db.ts
│   └── queryClient.ts
│
├── types/                # Tipi condivisi tra feature (User, Pagination, ApiResponse)
│   ├── api.types.ts
│   └── common.types.ts
│
├── config/               # Configurazione app-wide (feature flags, env)
│   └── env.ts
│
└── store/                # Stato globale condiviso (auth session, theme)
    ├── auth.store.ts
    └── ui.store.ts
```

***

## 8. Regole di Mantenibilità

### Regola 1 — La Feature deve essere deletable

Una feature ben isolata può essere **eliminata cancellando la sua cartella** senza rompere il resto dell\'app. Se eliminarla causa errori in altre feature, hai un problema di accoppiamento.

### Regola 2 — Niente cross-feature imports diretti

Configura ESLint per forzare questa regola:

```json
// .eslintrc.json
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [{
        "group": ["../*/features/*"],
        "message": "Non importare da altre features direttamente. Usa shared/ o il routing layer."
      }]
    }]
  }
}
```

### Regola 3 — Il barrel export `index.ts` è il contratto

Mai importare da percorsi interni di una feature. Solo dall\'`index.ts`:

```typescript
// CORRETTO
import { ProductCard } from '@/features/products';

// SBAGLIATO — import interno privato
import { ProductCard } from '@/features/products/components/ProductCard';
```

### Regola 4 — Duplicazione > accoppiamento errato

Se una piccola utility (es. `formatPrice`) è usata in `products/` e `cart/`, è accettabile duplicarla temporaneamente piuttosto che creare una dipendenza diretta tra feature. Promuovi a `shared/utils/` quando sei certo sia davvero condivisa.

### Regola 5 — I file di test vivono accanto al codice

I test sono **co-locati** con il file che testano, non in una cartella `__tests__/` separata:

```
features/products/
├── components/
│   ├── ProductCard.tsx
│   └── ProductCard.test.tsx   ← test accanto al componente
├── hooks/
│   ├── useProducts.ts
│   └── useProducts.test.ts    ← test accanto all\'hook
```

### Regola 6 — Screaming Architecture

Leggendo la struttura delle cartelle devi poter capire **cosa fa l\'applicazione**, non com\'è fatta tecnicamente. `features/checkout/`, `features/auth/`, `features/analytics/` sono nomi di dominio, non nomi tecnici.

***

## 9. Esempio Completo: Feature `auth`

```
features/
└── auth/
    ├── index.ts
    │
    ├── components/
    │   ├── LoginForm.tsx
    │   ├── LoginForm.test.tsx
    │   ├── RegisterForm.tsx
    │   └── AuthGuard.tsx          # HOC o wrapper per route protette
    │
    ├── hooks/
    │   ├── useAuth.ts             # Hook principale (login, logout, session)
    │   ├── useAuth.test.ts
    │   └── useAuthForm.ts         # Hook per gestire form state
    │
    ├── api/
    │   └── auth.api.ts            # fetch verso /api/auth/*
    │
    ├── store/
    │   └── auth.store.ts          # Zustand store: { user, token, isAuthenticated }
    │
    ├── types/
    │   └── auth.types.ts          # User, LoginPayload, AuthToken
    │
    ├── validators/
    │   └── auth.schema.ts         # Zod schema per login/register form
    │
    └── consts/
        └── auth.consts.ts         # TOKEN_KEY, ROUTES.LOGIN, etc.
```

```typescript
// features/auth/index.ts — Public API
export { LoginForm } from './components/LoginForm';
export { RegisterForm } from './components/RegisterForm';
export { AuthGuard } from './components/AuthGuard';
export { useAuth } from './hooks/useAuth';
export type { User, AuthToken } from './types/auth.types';
// NON esportare: store internals, validators, api client
```

```typescript
// app/(auth)/login/page.tsx — Routing layer usa la public API
import { LoginForm } from '@/features/auth';

export default function LoginPage() {
  return (
    <main>
      <LoginForm />
    </main>
  );
}
```

***

## 10. Integrazione con React Query (TanStack Query)

In un\'architettura serverless React, TanStack Query è lo stack ideale per gestire lo stato server:

```typescript
// features/products/hooks/useProducts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi } from '../api/products.api';
import type { ProductFilters } from '../types/product.types';

// Query keys come costanti tipizzate
export const PRODUCTS_QUERY_KEYS = {
  all: [\'products\'] as const,
  filtered: (filters: ProductFilters) => [\'products\', \'list\', filters] as const,
  detail: (id: string) => [\'products\', \'detail\', id] as const,
};

export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: PRODUCTS_QUERY_KEYS.filtered(filters),
    queryFn: () => productsApi.getAll(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: productsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEYS.all });
    },
  });
}
```

```typescript
// features/products/api/products.api.ts
import { apiClient } from \'@/shared/lib/api-client\';
import type { Product, ProductFilters, CreateProductDto } from \'../types/product.types\';

export const productsApi = {
  getAll: (filters: ProductFilters) =>
    apiClient.get<Product[]>(\'/api/products\', { params: filters }),

  getById: (id: string) =>
    apiClient.get<Product>(`/api/products/${id}`),

  create: (payload: CreateProductDto) =>
    apiClient.post<Product>(\'/api/products\', payload),

  update: (id: string, payload: Partial<CreateProductDto>) =>
    apiClient.put<Product>(`/api/products/${id}`, payload),

  delete: (id: string) =>
    apiClient.delete(`/api/products/${id}`),
};
```

***

## 11. Checklist di Qualità per ogni Feature

Prima di considerare una feature "completa", verifica queste condizioni:

### Struttura
- [ ] La feature ha un `index.ts` con public API esplicita
- [ ] Tutti i file seguono le naming convention definite
- [ ] I test sono co-locati accanto ai file che testano
- [ ] La feature ha la propria cartella `types/` con interfacce TypeScript

### Isolamento
- [ ] Nessun import diretto da altre features (`@/features/altra-feature/...`)
- [ ] Solo `shared/` e librerie esterne nelle dipendenze
- [ ] La feature può essere cancellata senza rompere altre feature

### Backend Serverless
- [ ] Ogni handler è thin (< 20 righe): delega a handler file dedicati
- [ ] Validazione input con Zod schema prima di entrare nella business logic
- [ ] Repository pattern per separare l\'accesso dati dalla logica
- [ ] Tipi condivisi frontend/backend in `shared/types/` o via schema Zod con `.infer<>`

### Qualità del codice
- [ ] ESLint configurato con la regola `no-restricted-imports` per cross-feature imports
- [ ] Query keys TanStack Query come costanti tipizzate nel hook file
- [ ] Nessun stato server in Zustand/Redux: usa React Query per cache dei dati remoti
- [ ] Stato globale UI in `shared/store/` solo se genuinamente condiviso

***

## 12. Quando NON usare Vertical Slice

La VSA non è la soluzione giusta per tutti i contesti:

- **Progetti molto piccoli** (< 5 feature, team di 1-2 persone): la struttura piatta è più veloce
- **Component library pura**: usa Atomic Design, non VSA
- **Proof of concept / hackathon**: la velocità supera la struttura; refactoring in seguito
- **Quando il team è nuovissimo**: introducila gradualmente, non tutto in una volta

La VSA brilla quando il progetto cresce oltre le 10 feature, il team supera le 3 persone, e la manutenzione a lungo termine è una priorità.

***

## 13. Applicazione a Beech CMS (monorepo)

Questa sezione adatta i principi delle sezioni precedenti al repository **Beech CMS**, senza sostituire la mappa tecnica completa: la fonte di verità resta [SYSTEM_MAP.md](SYSTEM_MAP.md).

### Dove vivono le feature

- **Dashboard (Vite + React)**: le nuove feature verticali vanno sotto `apps/dashboard/src/features/<nome-feature>/` (es. `richtext-editor/`), con **`index.ts` come public API** (vedi §4).
- **Shared nel dashboard**: componenti generici shadcn/radix, utilità e client HTTP sotto `apps/dashboard/src/components/ui/`, `apps/dashboard/src/lib/`, ecc. — equivalente pratico dello `shared/` descritto in §7.
- **Condiviso tra API e dashboard**: tipi, Seed, validazione e Botanical Engine in `packages/core` (`@beechcms/core`). **Non** duplicare logica di dominio nel slice: import da `@beechcms/core` come da SYSTEM_MAP.

### Regole di dipendenza (Beech)

1. **Routing / pages** (`apps/dashboard/src/pages/`, `App.tsx`): possono importare da `@/features/...` (public API) e da `@/components`, `@/lib`, `@beechcms/core`.
2. **Feature** (`apps/dashboard/src/features/*`): possono importare da `@beechcms/core`, `@/components`, `@/lib`, `@/hooks` condivisi; **non** importare da un’altra cartella `features/*` (stesso principio del §5).
3. **Field Renderers**: il registry (`apps/dashboard/src/components/fields/registry.ts`) resta il punto di aggancio schema-driven. Un campo complesso (es. richtext) può essere implementato nello slice e **esposto** come un solo componente dal `index.ts` della feature; il file sottile in `components/fields/edit/` re-esporta o wrappa quel componente senza duplicare logica.

### Media e API

- Upload file: solo **`POST /api/upload`** dal client (vedi SYSTEM_MAP e [media-engine.md](media-engine.md)). Il codice nello slice usa il client API del dashboard, non accesso diretto a R2.

### Documenti collegati

- Sprint editor: [Sprints/tiptap-elevation.md](Sprints/tiptap-elevation.md).
- Piano operativo (gap, priorità P0/P1, refactor slice) è tracciato nel file di piano Cursor del workspace (stesso contenuto sintetico richiamato da questo documento quando si lavora all’editor).

### Checklist rapida per una nuova slice in Beech

- [ ] Cartella `apps/dashboard/src/features/<nome>/` con `index.ts` che esporta solo l’API pubblica.
- [ ] Nessun import da `features/<altra-feature>/...`.
- [ ] Test co-locati (`*.test.ts` / `*.test.tsx`) accanto ai sorgenti.
- [ ] Se la feature tocca tipi o validazione condivisi, estendere `@beechcms/core` invece di copiare tipi nel slice.