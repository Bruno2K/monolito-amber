# M3.8 Local RC evidence

Screenshots from Playwright against the **real** local stack (API + Postgres), viewports **1440×900** (`desktop-1440`) and **1180×820** (`narrow-1180`).

Regenerate:

```bash
pnpm local-rc:e2e
```

PNGs are written here by `web/e2e/local-rc/helpers.ts` (`capture()`). HTML/trace output stays in gitignored `test-results/`.

## Expected files (after a green local-rc run)

Happy path:

- `golden-projects-desktop-1440.png` / `golden-projects-narrow-1180.png`
- `golden-hub-desktop-1440.png` / `golden-hub-narrow-1180.png`
- `golden-structure-desktop-1440.png` / `golden-structure-narrow-1180.png`
- `golden-deliverable-context-desktop-1440.png` / `golden-deliverable-context-narrow-1180.png`
- `golden-work-package-context-desktop-1440.png` / `golden-work-package-context-narrow-1180.png`
- `golden-logout-desktop-1440.png` / `golden-logout-narrow-1180.png`
- `a11y-landmarks-desktop-1440.png` / `a11y-landmarks-narrow-1180.png`

Negatives:

- `negative-wrong-org-*.png`
- `negative-revoked-*.png`
- `negative-missing-perms-*.png`
- `negative-external-*.png`
- `negative-team-only-*.png`
- `negative-session-*.png`
- `negative-hidden-counts-*.png`
- `negative-removed-*.png`

Keyboard / landmarks: `web/e2e/local-rc/golden-path.spec.ts` (“keyboard landmarks and skip link”). Automated axe is not in this harness; this is the a11y evidence the current Playwright pack allows.

LOCAL ONLY. Not Exit Gate evidence by itself.
