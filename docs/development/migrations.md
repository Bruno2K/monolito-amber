# Migrations

- Tool: Prisma Migrate. Versioned SQL under `prisma/migrations`.
- Never edit production schema by hand.
- Breaking changes: expand → migrate → contract.
- The initial migration creates module schemas, foundation tables, and role `amber_app` with INSERT+SELECT (no UPDATE/DELETE) on `audit`.
- Seed (`pnpm prisma:seed`) writes the 0.2A catalog and Role templates only.
- PF-1.1 adds `authentication_identities`, MFA recovery/challenge tables, invitation→organization FK, and session security metadata. Prefer expand-then-contract; do not silently redesign unrelated modules.

```bash
pnpm prisma:generate
pnpm prisma migrate dev --name <name>   # local
pnpm prisma:migrate                     # deploy
pnpm prisma:validate
```
