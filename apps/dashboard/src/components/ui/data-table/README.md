# DataTable — note di progettazione e invarianti

Tabella condivisa (TanStack Table). Usata dalla vista Table dei content (`features/content-management`).
Questo file elenca le scelte **non ovvie** e il motivo: prima di cambiarne una, leggi il "Perché".
Ogni invariante ha un test di regressione in `data-table-layout.test.tsx`.

## Scheletro (dall'esterno all'interno)

```
DataTable (index.tsx)
├─ frame            rounded-md + border + overflow-hidden   ← UNICO proprietario del bordo esterno
│  └─ DataTableBody (components/data-table-body.tsx)
│     └─ ScrollArea                scroll orizzontale; verticale solo in modalità raggruppata
│        └─ <table>
│           ├─ <thead>  DataTableHeader  celle con sfondo proprio + separatori colonna
│           └─ <tbody>  DataTableRow | DataTableGroupRow | spacer virtuali | righe segnaposto
└─ DataTablePagination (components/data-table-pagination.tsx)   ← fuori dal frame
```

| File | Responsabilità (una sola) |
|------|---------------------------|
| `index.tsx` | compone frame + body + paginazione; calcola `selectedCount` |
| `hooks/use-data-table-state.ts` | stato TanStack (controllato o interno) → istanza `table` |
| `hooks/use-data-table-selection.ts` | selezione righe, focus da tastiera, scorciatoie |
| `components/data-table-body.tsx` | riempie il `<tbody>` nelle due modalità (paginata / raggruppata) |
| `components/data-table-row.tsx` | una riga dati: stile, click cella, menu contestuale |
| `styles.ts` | **tutte** le classi della griglia condivise tra header, righe e segnaposto |

## Invarianti — NON romperle

### 1. Il frame ritaglia, nessun altro disegna il bordo esterno
`index.tsx` ha `overflow-hidden rounded-md border`. Lo sfondo dell'header è rettangolare: senza
`overflow-hidden` sbordava dagli angoli arrotondati.
**Regola:** ciò che sta dentro il frame (sfondo header, hover/selezione riga) non disegna un bordo esterno suo.
*Test:* "draws the outer border on a clipping frame…".

### 2. Niente anelli/outline di focus sulle righe
Un `outline` sulla `<tr>` non segue il raggio degli angoli: sull'ultima riga il frame ne tagliava l'angolo.
Il focus da tastiera è mostrato con lo **sfondo** (`FOCUSED_ROW_CLASS` in `styles.ts`, stesso della riga
selezionata). Non reintrodurre bordi/outline/ring sulla riga: uno sfondo non può essere "tagliato male".

### 3. L'altezza della tabella non cambia tra le pagine
In paginazione server-side `data` contiene **solo la pagina corrente**. Il totale per decidere il padding
deve venire da `totalRows` (totale su tutte le pagine), mai da `data.length`: sull'ultima pagina
`data.length < pageSize` e il padding non scattava, la tabella si accorciava e i pulsanti saltavano.
Le righe mancanti sono righe segnaposto (`PlaceholderRows`): stesse linee delle righe reali, `aria-hidden`,
nessun hover. Non c'è `minHeight` sullo scroll area: lo stesso effetto lo danno i segnaposto.
Un dataset più piccolo di una pagina **non** viene riempito. *Test:* "pads a short last page…", "does not pad…".

### 4. Il footer è `React.memo`: ciò che mostra deve arrivare come prop
`table` è un riferimento **stabile**: `table.getState()` letto dentro il footer non ne causa il re-render.
Per questo `DataTablePagination` riceve `pageIndex`, `pageCount` e `selectedCount` come prop da `index.tsx`.
Se aggiungi al footer un dato che dipende dallo stato della tabella, **passalo come prop**, non leggerlo da `table`.
*Test:* "repaints the page counter when Next is pressed", "re-enables Previous…".

### 5. Le classi della griglia vivono solo in `styles.ts`
`ROW_SEPARATOR_CLASS`, `COLUMN_SEPARATOR_CLASS`, `FOCUSED_ROW_CLASS`. Header, righe e segnaposto le
importano: così non possono andare fuori sincrono. Per cambiare colore/spessore delle linee si modifica
solo quel file. Il bordo inferiore di riga lo applica già `TableRow` (`border-b`); l'ultima riga non ha
bordo (`TableBody`), lo disegna il frame.

## Modalità raggruppata (grouping attivo)
Paginazione disattivata (`pageSize` = infinito), righe virtualizzate con `@tanstack/react-virtual`:
il `<tbody>` contiene due righe-spacer (`VirtualSpacerRow`) che sostituiscono le righe fuori schermo.
L'altezza è limitata da `VIRTUAL_CONTAINER_HEIGHT` e lo scroll è quello dello `ScrollArea`.

## Prestazioni
- `DataTableRow` e `DataTablePagination` sono `React.memo`: passare loro prop stabili (callback con
  `useCallback`, insiemi con `useMemo`); una prop nuova a ogni render annulla il memo.
- Il totale righe del footer attraversa tutte le righe: è calcolato solo se `selectedCount > 0`.
- Il virtualizer è sempre istanziato ma con `count: 0` fuori dalla modalità raggruppata (costo nullo).
