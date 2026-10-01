# M3 RC1 — manual focus / accessibility review

LOCAL ONLY. Not an Exit Gate. Complements automated `@axe-core/playwright` on the Local RC suite (`web/e2e/local-rc/a11y.spec.ts`) at **1440×900** and **1180×820**.

Reviewed surfaces: authenticated shell (`/projects`) and M3 operational routes `/overview`, `/structure`, `/deliverables`, `/work-packages` (inspectors included).

## Tab order

1. Skip link “Ir para o conteúdo” (`web/components/shell/AppShell.tsx`) is first in the shell DOM.
2. Sidebar organization switcher (`label` + `select#org-switcher`) then Global / Project nav links (`Sidebar`).
3. Header breadcrumbs, project switcher, disabled search, Sair.
4. Main (`#main-content`): page heading, filters/actions, table/list rows, inspector when open.
5. Coming-later nav items are not in the tab order (`span aria-disabled`, not links).

Automated check: skip link focus in `a11y.spec.ts` and `golden-path.spec.ts`.

## Visible focus

`:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px }` in `web/app/globals.css`. Skip link moves on-screen when focused (`.skip-link:focus { top: 12px }`).

## Focus return

`useInspectorEscape` (`web/lib/use-inspector-escape.ts`) records `document.activeElement` when an inspector opens and restores it after Escape / effect cleanup. Wired on Structure, Entregas, and Pacotes inspectors.

## Escape / overlay

Inspectors are `role="dialog"` `aria-modal="true"` with a backdrop button “Fechar inspetor”. Escape calls the same close path as Fechar. Playwright: `Escape closes inspector` in `a11y.spec.ts`.

## Skip link

Single skip link per shell, href `#main-content`, named “Ir para o conteúdo”.

## Accessible names

- Nav: `aria-label="Navegação do aplicativo"`, breadcrumbs `aria-label="Trilha de navegação"`.
- Project/org switchers have `<label class="sr-only">` plus `aria-label` on the project select.
- Overlay close control: `aria-label="Fechar inspetor"`.
- Status pills include a textual label (`workPackageStatusLabel` / `deliverableStatusLabel` / `phaseStatusLabel`), not color alone.
- Coming-later items include `sr-only` “Indisponível neste marco”.

## Non-color status

Pills combine background token **and** visible Portuguese/English status text. Header Global vs Ativo uses named badges. BLOCKED shows `blockedReason` text beside the pill on linked packages.

## Reduced motion

`@media (prefers-reduced-motion: reduce)` in `globals.css` collapses animation/transition durations. The shell does not ship decorative motion; this is a fail-safe.

## Hit areas

Primary `.btn` / inputs use `--input-height: 36px` (≥ 24px WCAG 2.2 target). Nav items `--nav-item-height: 36px`. Text buttons in inspectors are denser; they remain text-named controls next to 36px actions.

## Overflow / clipping at 1180×820

`@media (max-width: 1180px)` drops a deliverables column, full-width inspector, single-column hub. `@media (max-width: 1280px)` hides header search and role text rather than clipping. Sidebar stays 260px (Shell M2.1); the main column scrolls.

## State screenshots (Playwright)

Captured under this directory (`state-*-desktop-1440.png` / `narrow-1180.png` after Local RC):

| State | How |
| --- | --- |
| loading | delayed `/hub` route → `StateScreen` “Carregando” |
| recoverable error | `/hub` 500 → “Não foi possível carregar” |
| initial/filtered empty | team-only “Nenhum projeto”; Entregas `?status=DELIVERED` |
| no-permission | Org A coordinator on Org B project → “Acesso negado” |
| archived / inactive / read-only | viewer inspector: mutation buttons omitted; archived banner exists in markup (`data-state="inactive"`) when an archived row is present |

## Automated axe

Zero **serious** / **critical** required. Contrast floors applied: `--text-muted` `#4b5563` on white; `--text-sidebar-muted` `#9ca3af` on `#0f1115`; primary `.btn` uses `--btn-bg` `#92400e` with white label (amber-600 `#d97706` failed 4.5:1). If a `moderate`/`minor` finding remains, it is dumped to `axe-accepted-*.json`.

## Out of scope

Cloud URL, M3.9, claiming Bruno homologated.
