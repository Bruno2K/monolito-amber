# M4.8 UI evidence

Viewports: **1440×900** (`desktop-1440`) and **1180×820** (`narrow-1180`).

## Committed files

Mock Playwright (`web/e2e/m4-8-evidence.spec.ts`) commits the core viewports on the tip. Local RC (`web/e2e/local-rc/m4-8-*.spec.ts`) regenerates the same filenames against the real API and adds `gantt-date-*` plus AuthZ search/viewer captures.

| File | State |
| --- | --- |
| `list-1440x900.png` / `list-1180x820.png` | Lista with seed Tasks |
| `list-filtered-1440x900.png` / `list-filtered-1180x820.png` | Filtered Lista (Local RC) |
| `kanban-1440x900.png` / `kanban-1180x820.png` | Kanban projection |
| `gantt-1440x900.png` / `gantt-1180x820.png` | Gantt projection (mock + Local RC overview) |
| `gantt-date-1440x900.png` / `gantt-date-1180x820.png` | Date edit after golden path (Local RC) |
| `marcos-1440x900.png` / `marcos-1180x820.png` | Marcos KPI / list |
| `marcos-risk-1440x900.png` / `marcos-risk-1180x820.png` | Milestone risk inspector (Local RC) |
| `inspector-assigned-1440x900.png` / `inspector-assigned-1180x820.png` | Assigned + started Task (Local RC) |
| `inspector-start-block-1440x900.png` / `inspector-start-block-1180x820.png` | FS start block (Local RC) |
| `deliverable-refs-1440x900.png` / `deliverable-refs-1180x820.png` | Deliverable inspector Task/Marco refs (Local RC) |
| `authz-forbidden-1440x900.png` / `authz-forbidden-1180x820.png` | Cross-project deny (Local RC) |
| `authz-search-empty-1440x900.png` / `authz-search-empty-1180x820.png` | Hidden search empty (Local RC) |
| `authz-viewer-preview-1440x900.png` / `authz-viewer-preview-1180x820.png` | Viewer linked preview (Local RC) |

Regenerate mock captures: `pnpm --filter @amber/web test:e2e -- web/e2e/m4-8-evidence.spec.ts`  
Regenerate Local RC captures: `pnpm local-rc:e2e`

LOCAL ONLY. Not Exit Gate / homologation by itself.
