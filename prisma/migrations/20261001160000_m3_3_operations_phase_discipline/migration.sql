-- M3.3: Organization Discipline/Team catalogs + operations.phases.
-- Additive only. Does not move Project/Task/Document/Issue/Gate ownership.
-- Historical Document/Issue/Task discipline identifier strings are KEPT.
-- Deliverable / WorkPackage tables are M3.4 / M3.5.
-- Operational rollback = restore backup / do not apply. Not DROP SCHEMA operations.

CREATE SCHEMA IF NOT EXISTS "operations";

-- Composite FK target: Phase.organization_id must match Project.organization_id.
CREATE UNIQUE INDEX IF NOT EXISTS "projects_id_organization_id_key"
  ON "project"."projects" ("id", "organization_id");

-- ---------------------------------------------------------------------------
-- org.disciplines — Organization-owned catalog (not Project access)
-- ---------------------------------------------------------------------------

CREATE TABLE "org"."disciplines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "sort_order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disciplines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "disciplines_code_check" CHECK (length(trim("code")) > 0),
    CONSTRAINT "disciplines_name_check" CHECK (length(trim("name")) > 0)
);

CREATE INDEX "disciplines_organization_id_idx" ON "org"."disciplines"("organization_id");
CREATE UNIQUE INDEX "disciplines_org_code_ci" ON "org"."disciplines" ("organization_id", lower("code"));

ALTER TABLE "org"."disciplines"
  ADD CONSTRAINT "disciplines_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "org"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- org.teams / team_memberships — Team is not Project access
-- ---------------------------------------------------------------------------

CREATE TABLE "org"."teams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "teams_name_check" CHECK (length(trim("name")) > 0),
    CONSTRAINT "teams_version_check" CHECK ("version" >= 1)
);

CREATE INDEX "teams_organization_id_idx" ON "org"."teams"("organization_id");
CREATE UNIQUE INDEX "teams_org_name_active_ci"
  ON "org"."teams" ("organization_id", lower("name"))
  WHERE "archived_at" IS NULL;

ALTER TABLE "org"."teams"
  ADD CONSTRAINT "teams_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "org"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "org"."team_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "team_id" UUID NOT NULL,
    "organization_membership_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "team_memberships_status_check" CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'REMOVED')),
    CONSTRAINT "team_memberships_team_id_organization_membership_id_key" UNIQUE ("team_id", "organization_membership_id")
);

CREATE INDEX "team_memberships_organization_membership_id_idx"
  ON "org"."team_memberships"("organization_membership_id");

ALTER TABLE "org"."team_memberships"
  ADD CONSTRAINT "team_memberships_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "org"."teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "org"."team_memberships"
  ADD CONSTRAINT "team_memberships_organization_membership_id_fkey"
  FOREIGN KEY ("organization_membership_id") REFERENCES "org"."organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- operations.phases
-- ---------------------------------------------------------------------------

CREATE TABLE "operations"."phases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sequence" INTEGER NOT NULL,
    "planned_start_at" TIMESTAMP(3),
    "planned_end_at" TIMESTAMP(3),
    "actual_start_at" TIMESTAMP(3),
    "actual_end_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "phases_status_check" CHECK ("status" IN ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT "phases_name_check" CHECK (length(trim("name")) > 0),
    CONSTRAINT "phases_version_check" CHECK ("version" >= 1),
    CONSTRAINT "phases_planned_dates_check" CHECK (
      "planned_start_at" IS NULL
      OR "planned_end_at" IS NULL
      OR "planned_start_at" <= "planned_end_at"
    ),
    CONSTRAINT "phases_actual_dates_check" CHECK (
      "actual_start_at" IS NULL
      OR "actual_end_at" IS NULL
      OR "actual_start_at" <= "actual_end_at"
    )
);

CREATE INDEX "phases_organization_id_project_id_idx"
  ON "operations"."phases"("organization_id", "project_id");
CREATE INDEX "phases_project_id_sequence_idx"
  ON "operations"."phases"("project_id", "sequence");
CREATE UNIQUE INDEX "phases_project_sequence_active"
  ON "operations"."phases" ("project_id", "sequence")
  WHERE "archived_at" IS NULL;

ALTER TABLE "operations"."phases"
  ADD CONSTRAINT "phases_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."phases"
  ADD CONSTRAINT "phases_project_org_fkey"
  FOREIGN KEY ("project_id", "organization_id")
  REFERENCES "project"."projects"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- tenant binding — never trust client org/project ids
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION org.assert_same_tenant_discipline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM org.organizations o WHERE o.id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Discipline organization not found';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER disciplines_same_tenant
  BEFORE INSERT OR UPDATE ON org.disciplines
  FOR EACH ROW
  EXECUTE FUNCTION org.assert_same_tenant_discipline();

CREATE OR REPLACE FUNCTION org.assert_same_tenant_team()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM org.organizations o WHERE o.id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Team organization not found';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER teams_same_tenant
  BEFORE INSERT OR UPDATE ON org.teams
  FOR EACH ROW
  EXECUTE FUNCTION org.assert_same_tenant_team();

CREATE OR REPLACE FUNCTION org.assert_same_tenant_team_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  team_org uuid;
  membership_org uuid;
BEGIN
  SELECT organization_id INTO team_org FROM org.teams WHERE id = NEW.team_id;
  SELECT organization_id INTO membership_org
    FROM org.organization_memberships WHERE id = NEW.organization_membership_id;
  IF team_org IS NULL OR membership_org IS NULL THEN
    RAISE EXCEPTION 'Team membership endpoint not found';
  END IF;
  IF team_org <> membership_org THEN
    RAISE EXCEPTION 'Team membership Organization mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER team_memberships_same_tenant
  BEFORE INSERT OR UPDATE ON org.team_memberships
  FOR EACH ROW
  EXECUTE FUNCTION org.assert_same_tenant_team_membership();

CREATE OR REPLACE FUNCTION operations.assert_same_tenant_phase()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM project.projects p
    WHERE p.id = NEW.project_id
      AND p.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Phase project/organization mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER phases_same_tenant
  BEFORE INSERT OR UPDATE ON operations.phases
  FOR EACH ROW
  EXECUTE FUNCTION operations.assert_same_tenant_phase();

-- Historical identifier strings on document.documents.discipline_id,
-- coordination.issues.responsible_discipline_id, and
-- planning.tasks.responsible_discipline_id are intentionally unchanged.

GRANT USAGE ON SCHEMA operations TO amber_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA operations TO amber_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA operations GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO amber_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE org.disciplines TO amber_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE org.teams TO amber_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE org.team_memberships TO amber_app;
