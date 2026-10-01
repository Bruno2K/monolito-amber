# M2.10 — Correction Loop 1 (trimmed)

**Status:** R-01 + R-02 **FIXED**. Zero residual BLOCKER / IMPORTANT / MINOR for those findings.  
**F-04** remains **OPEN OPTIONAL** (OK).  
**Engineer does not claim Exit Gate PASS.** Ready for Independent Reviewer re-review only.

Source: Independent Reviewer REQUEST_CHANGES on tip `1c9b67ce8ffa9b7b0892d71d9d798fd662819da3` ([PR comment](https://github.com/Bruno2K/monolito-amber/pull/28#issuecomment-5925030296)). Figma fixes already in `fkE9SwcNlQG7m0HvcGQBw9` page `04 — Telas`. This file is docs/evidence sync only.

## Metrics (product set)

Top-level frames `/^M2\.[2-9]\b/` — excludes documentary `321:15725` / `321:15738` / `321:15755`.

| Metric | After RC1 |
| --- | ---: |
| Frames M2.2–M2.9 | **86** |
| ON_CLICK→NAVIGATE | **257** |
| Broken / orphans / same-node / whole-frame / overlapping multi-dest | **0** |
| Interactive hotspots h&lt;34 | **0** (was 18) |

Inventory chrome on `304:15021`: **257 / 86** (was 167 / 78). No NAVIGATE add/remove.

## R-01 FIXED — hit targets ≥34px

- Calendar Ação INSTANCE Small→Medium (h=32→36): `261:8145`, `261:8176`, `261:8254`, `261:8285`, `261:8339`, `261:8370`, `262:8457`, `262:8459`
- Chip / Badge: `292:13980` 28→34; `292:14143` 22→34
- TEXT reactions moved to parents ≥34: `288:10827`, `288:10820`, `288:11591`, `290:12556`, `290:13038`, `290:14304`, `290:14334`
- New hit wrap `325:15730` (1100×34) for Issues subtitle; TEXT `290:13192` non-interactive
- A11y register `304:15969` / frame `304:15831` claim now matches under34Count=0

## R-02 FIXED — Inventory chrome

| Node | After |
| --- | --- |
| `304:15131` | Audit: **257** ON_CLICK→NAVIGATE · 0 broken destinations |
| `304:15219` | **86** product frames + Shell M2.1 |

Documentary boards already 86/257 — unchanged and still excluded from product counts.

## Residual

| ID | Status |
| --- | --- |
| R-01 MINOR | **FIXED** |
| R-02 MINOR | **FIXED** |
| F-04 OPTIONAL | **OPEN OK** |
| BLOCKER / IMPORTANT | none |
