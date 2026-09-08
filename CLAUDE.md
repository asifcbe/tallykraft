# TallyKraft — Claude Code Context

## Project overview
TallyKraft is a PWA accounting / invoicing app for small businesses (India-focused). Built with React 19 + Vite + MUI v7. Firebase for auth + cloud sync; IndexedDB for local-first storage. Subscription gating per-business. Deployed on Vercel.

## Tech stack
- **Framework**: React 19, React Router v7
- **UI**: MUI v7 + Emotion, Lucide React icons, Recharts
- **Build**: Vite 7, vite-plugin-pwa
- **Backend**: Firebase v12 (auth + Firestore)
- **Storage**: IndexedDB (local-first via `src/indexedDB.js` + `src/db.js`)
- **Print**: react-to-print
- **Other**: xlsx (import/export), i18n (multi-language)

## Commands
```bash
npm run dev      # dev server
npm run build    # production build (always run to verify zero errors before reporting done)
npm run lint     # eslint
npm run preview  # preview built dist
```

## Brand & theme
- Multi-theme system — light / dark + color variants (indigo, teal, etc.). Theme switcher in Settings.
- Active theme created via `createAppTheme(themeName, mode)` in `src/theme.jsx`
- **Default / primary color**: Indigo — `#4f46e5` (light), `#6366f1` (lighter)
- Theme tokens: `primary`, `primaryRgb`, `borderColor`, `borderStrong`, `focusRing`, `background`
- Component overrides in `src/theme.jsx` follow DigitZebra polish: tight backgrounds, primary-tinted hover/action, TableRow hover `#fafafa`, alert muted tones

## Key files
| File | Purpose |
|------|---------|
| `src/theme.jsx` | MUI theme factory — `createAppTheme(name, mode)` |
| `src/ThemeContext.jsx` | Theme switcher — persists choice in localStorage |
| `src/Layout.jsx` | App shell: sidebar nav + top bar |
| `src/Dashboard.jsx` | Dashboard — MetricCard KPIs, area chart, activity feed |
| `src/Sales.jsx` | Sales + purchases invoices. Split payment UI in summary sidebar. |
| `src/PaymentEntry.jsx` | Cash/Bank/UPI payment recording |
| `src/Expenses.jsx` | Expense entry with payment mode |
| `src/DataContext.jsx` | Central data layer (getItems / addItem / updateItem / deleteItem) |
| `src/db.js` | IndexedDB read/write |
| `src/BusinessContext.jsx` | Multi-business switcher; exposes `currentBusiness`, `openingCash`, `openingBank` |
| `src/AuthContext.jsx` | Firebase auth |
| `src/SubscriptionContext.jsx` | Per-business subscription gating (trial / basic / pro / admin_granted) |
| `src/Admin.jsx` | Admin panel — paginated user list (50/page) + subscription management |
| `src/cashUtils.js` | `computeCashInHand`, `computeBankBalance`, `paymentModeSplit` helpers |
| `src/Settings.jsx` | Business profile, opening cash + bank balance, theme, language |
| `src/i18n/I18nContext.jsx` | i18n (strings in `src/i18n/strings.js`) |

## Architecture notes
- **Data flow**: all reads/writes go through `DataContext`. No direct IndexedDB calls from pages.
- **Multi-business**: `BusinessContext` scopes all data by `businessId`. Every record has a `businessId` field.
- **Subscription gating**: `SubscriptionContext` gates features per-business. States: `trial`, `subscribed`, `expired`, `admin_granted`.
- **Admin pagination**: `Admin.jsx` loads `userConfig` documents 50 at a time using `getDocs` + `startAfter` cursor — never `onSnapshot` the whole collection.
- **Print**: hidden off-DOM invoice template rendered into a `ref`, fired via `useReactToPrint`.
- **PWA**: service worker via vite-plugin-pwa.

## Cash & bank balance tracking
- `cashUtils.js` exports `computeCashInHand` and `computeBankBalance`.
- Cash in hand: only `paymentMode === "Cash"` transactions count. Expenses with no mode default to Cash.
- Bank balance: `isDigital(mode)` transactions count — Bank, Cheque, NEFT, RTGS, UPI, Card.
- Opening balances set per-business in Settings (`openingCash`, `openingBank`), surfaced via `BusinessContext`.
- `cashEntries` store manual adjustments: types `in`/`out` (cash book) and `bank_in`/`bank_out` (bank book).

## Split payment
- Sales.jsx summary sidebar has a Payment Mode toggle: Cash / Bank / UPI / Split.
- Split mode shows two amount fields (Cash portion + Bank/UPI portion).
- Stored on the transaction as `paymentMode: "Split"` + `paymentSplit: { cash, bank, bankMode }`.
- For POS / cash-and-carry sales, split portions are also recorded as separate `PaymentIn` payment records so `computeBankBalance` and `computeCashInHand` both see the correct split.

## Styling conventions
- Use `alpha(color, opacity)` from MUI — never hardcode rgba strings for primary colors.
- Border radius tokens: `tokens.radius.sm` / `.md` / `.lg` defined locally in each page via a `tokens` object.
- No dark mode hacks in individual files — all dark mode handled in `createAppTheme`.
- No comments in JSX unless the WHY is non-obvious.
