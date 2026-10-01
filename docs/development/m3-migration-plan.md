# M3.1 migration plan (forward-only)

**Status:** Design freeze for M3.1. **Do not apply** this migration in this WI. M3.3 applies Phase/Discipline; M3.4 Deliverable; M3.5 WorkPackage. Expand → migrate → contract (ADR-002). Additive only.

## Goals

1. Add Operations tables without rewriting Platform Foundation schemas.
2. Preserve historical Discipline **identifier strings** on `document.documents.discipline_id`, `coordination.issues.responsible_discipline_id`, and `planning.tasks.responsible_discipline_id`.
3. No destructive rename/remove of existing data. No `gate.override`.
4. Tenant-binding triggers on every new table (same pattern as PF-1.3–1.6).
5. Operational rollback = restore backup / do not apply; not a reverse migration that drops history.

## Schema map

| Schema | Change | WI that applies |
| --- | --- | --- |
| `org` | `CREATE TABLE teams`, `team_memberships`, `disciplines` | M3.3 (catalog + Team subject) |
| `operations` | `CREATE SCHEMA operations`; `phases`, `deliverables`, `work_packages` | M3.3 / M3.4 / M3.5 |
| `project` | Relation comments only; no column drop | — |
| `document` / `coordination` / `planning` | **KEEP** existing string discipline columns | Never drop in M3 |
| `org.permission_definitions` | Additive seed upsert of M3.1 codes (already supported by `prisma/seed.ts`) | This WI (catalog in code); seed on next `prisma:seed` |

Prisma `datasource.schemas` gains `"operations"` when the first Operations migration lands — not in M3.1.

## Historical Discipline identifiers

Today those columns are free-form strings (e.g. integration tests use `"structure"`, `"architecture"`). M3 must:

1. `CREATE TABLE org.disciplines (id uuid, organization_id uuid, code text, name text, active boolean, sort_order int, …)`.
2. Unique index on `(organization_id, lower(code))`.
3. **Leave** existing `discipline_id` / `responsible_discipline_id` string columns in place.
4. Optionally **add** nullable uuid `discipline_catalog_id` later (expand), backfill by matching `lower(code)` to historical strings, then consider contract in a later milestone. M3 does **not** rewrite or delete the historical strings.
5. Seed catalog rows using those historical identifiers as `code` (see seed design) so new FKs can point at them without renaming old rows.

Forbidden in any M3 migration SQL:

- `DROP COLUMN discipline_id`
- `DROP COLUMN responsible_discipline_id`
- `RENAME COLUMN` on those historical identifier columns
- `UPDATE … SET discipline_id = NULL` as a data wipe
- Truncate of Document / Issue / Task

## Planned DDL (illustrative — not executed here)

```sql
-- M3.3+
CREATE SCHEMA IF NOT EXISTS operations;

CREATE TABLE org.disciplines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES org.organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX disciplines_org_code_ci ON org.disciplines (organization_id, lower(code));

CREATE TABLE org.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES org.organizations(id),
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org.team_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES org.teams(id),
  organization_membership_id uuid NOT NULL REFERENCES org.organization_memberships(id),
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, organization_membership_id)
);

CREATE TABLE operations.phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project.projects(id),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  sequence integer NOT NULL,
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  status text NOT NULL,
  created_by uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX phases_project_sequence_active
  ON operations.phases (project_id, sequence) WHERE archived_at IS NULL;

-- deliverables / work_packages follow the contract field tables;
-- partial unique indexes on lower(code) WHERE archived_at IS NULL;
-- CHECK (NOT (owner_project_membership_id IS NOT NULL AND owner_team_id IS NOT NULL));
```

Tenant-binding triggers: `NEW.organization_id` must equal the parent Project’s `organization_id` (same style as PF-1.3+). Team owner must share `organization_id`. User owner must reference an ACTIVE `project.project_memberships` row of that Project.

## Permission catalog

No DDL. `pnpm prisma:seed` upserts `PERMISSIONS` and additively inserts missing `role_permissions` for Organization-owned copies. M3.1 lands the codes in `@amber/shared` so the next seed is additive.

## Dry-run review checklist

- [ ] `prisma migrate diff` against this plan is create-only for new schemas/tables/indexes
- [ ] Existing discipline string columns remain
- [ ] No `gate.override` / `forceRelease` in SQL (`scripts/validate-migrations.ts`)
- [ ] `amber_app` still cannot UPDATE/DELETE `audit`
- [ ] Partial unique indexes encode “non-archived” uniqueness
- [ ] Rollback plan documented as restore, not DROP SCHEMA operations

## Rollback

Forward-only. If a later WI’s migration fails before merge to production: do not apply. If applied in a disposable local DB: reset the database (`prisma migrate reset`) — seeds are designed to be resettable. Production cloud apply is **not authorized** in M3.1.
