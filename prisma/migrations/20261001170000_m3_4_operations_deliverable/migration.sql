-- M3.4: operations.deliverables + operations.work_packages (schema for the
-- delivery rule). Additive only. Does not rewrite M3.3 Phase/Discipline.
-- WorkPackage CRUD APIs are M3.5 — this table exists so DELIVERED can inspect
-- still-linked WPs; zero linked WPs allows deliver in this WI.
-- Operational rollback = restore backup / do not apply.

-- ---------------------------------------------------------------------------
-- operations.deliverables
-- ---------------------------------------------------------------------------

CREATE TABLE "operations"."deliverables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "phase_id" UUID NOT NULL,
    "discipline_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "owner_project_membership_id" UUID,
    "owner_team_id" UUID,
    "planned_start_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "progress_percent" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "deliverables_status_check" CHECK (
      "status" IN ('PLANNED', 'IN_PROGRESS', 'IN_REVIEW', 'APPROVED', 'DELIVERED', 'CANCELLED')
    ),
    CONSTRAINT "deliverables_code_check" CHECK (length(trim("code")) > 0),
    CONSTRAINT "deliverables_title_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "deliverables_version_check" CHECK ("version" >= 1),
    CONSTRAINT "deliverables_progress_check" CHECK (
      "progress_percent" IS NULL
      OR ("progress_percent" >= 0 AND "progress_percent" <= 100)
    ),
    CONSTRAINT "deliverables_owner_xor_check" CHECK (
      NOT ("owner_project_membership_id" IS NOT NULL AND "owner_team_id" IS NOT NULL)
    ),
    CONSTRAINT "deliverables_planned_due_check" CHECK (
      "planned_start_at" IS NULL
      OR "due_at" IS NULL
      OR "planned_start_at" <= "due_at"
    )
);

CREATE INDEX "deliverables_organization_id_project_id_idx"
  ON "operations"."deliverables"("organization_id", "project_id");
CREATE INDEX "deliverables_phase_id_idx"
  ON "operations"."deliverables"("phase_id");
CREATE INDEX "deliverables_discipline_id_idx"
  ON "operations"."deliverables"("discipline_id");
CREATE INDEX "deliverables_owner_project_membership_id_idx"
  ON "operations"."deliverables"("owner_project_membership_id");
CREATE INDEX "deliverables_owner_team_id_idx"
  ON "operations"."deliverables"("owner_team_id");
CREATE UNIQUE INDEX "deliverables_project_code_active"
  ON "operations"."deliverables" ("project_id", lower("code"))
  WHERE "archived_at" IS NULL;

ALTER TABLE "operations"."deliverables"
  ADD CONSTRAINT "deliverables_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."deliverables"
  ADD CONSTRAINT "deliverables_project_org_fkey"
  FOREIGN KEY ("project_id", "organization_id")
  REFERENCES "project"."projects"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."deliverables"
  ADD CONSTRAINT "deliverables_phase_id_fkey"
  FOREIGN KEY ("phase_id") REFERENCES "operations"."phases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."deliverables"
  ADD CONSTRAINT "deliverables_discipline_id_fkey"
  FOREIGN KEY ("discipline_id") REFERENCES "org"."disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."deliverables"
  ADD CONSTRAINT "deliverables_owner_project_membership_id_fkey"
  FOREIGN KEY ("owner_project_membership_id") REFERENCES "project"."project_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."deliverables"
  ADD CONSTRAINT "deliverables_owner_team_id_fkey"
  FOREIGN KEY ("owner_team_id") REFERENCES "org"."teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- operations.work_packages (schema only — no Nest CRUD in M3.4)
-- ---------------------------------------------------------------------------

CREATE TABLE "operations"."work_packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "phase_id" UUID NOT NULL,
    "deliverable_id" UUID,
    "discipline_id" UUID,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "blocked_reason" TEXT,
    "owner_project_membership_id" UUID,
    "owner_team_id" UUID,
    "planned_start_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_packages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "work_packages_status_check" CHECK (
      "status" IN ('PLANNED', 'ACTIVE', 'BLOCKED', 'DONE', 'CANCELLED')
    ),
    CONSTRAINT "work_packages_title_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "work_packages_version_check" CHECK ("version" >= 1),
    CONSTRAINT "work_packages_owner_xor_check" CHECK (
      NOT ("owner_project_membership_id" IS NOT NULL AND "owner_team_id" IS NOT NULL)
    ),
    CONSTRAINT "work_packages_blocked_reason_check" CHECK (
      ("status" = 'BLOCKED' AND length(trim(coalesce("blocked_reason", ''))) > 0)
      OR ("status" <> 'BLOCKED')
    )
);

CREATE INDEX "work_packages_organization_id_project_id_idx"
  ON "operations"."work_packages"("organization_id", "project_id");
CREATE INDEX "work_packages_phase_id_idx"
  ON "operations"."work_packages"("phase_id");
CREATE INDEX "work_packages_deliverable_id_idx"
  ON "operations"."work_packages"("deliverable_id");
CREATE INDEX "work_packages_discipline_id_idx"
  ON "operations"."work_packages"("discipline_id");
CREATE UNIQUE INDEX "work_packages_project_code_active"
  ON "operations"."work_packages" ("project_id", lower("code"))
  WHERE "archived_at" IS NULL AND "code" IS NOT NULL;

ALTER TABLE "operations"."work_packages"
  ADD CONSTRAINT "work_packages_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."work_packages"
  ADD CONSTRAINT "work_packages_project_org_fkey"
  FOREIGN KEY ("project_id", "organization_id")
  REFERENCES "project"."projects"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."work_packages"
  ADD CONSTRAINT "work_packages_phase_id_fkey"
  FOREIGN KEY ("phase_id") REFERENCES "operations"."phases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."work_packages"
  ADD CONSTRAINT "work_packages_deliverable_id_fkey"
  FOREIGN KEY ("deliverable_id") REFERENCES "operations"."deliverables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."work_packages"
  ADD CONSTRAINT "work_packages_discipline_id_fkey"
  FOREIGN KEY ("discipline_id") REFERENCES "org"."disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."work_packages"
  ADD CONSTRAINT "work_packages_owner_project_membership_id_fkey"
  FOREIGN KEY ("owner_project_membership_id") REFERENCES "project"."project_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."work_packages"
  ADD CONSTRAINT "work_packages_owner_team_id_fkey"
  FOREIGN KEY ("owner_team_id") REFERENCES "org"."teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- tenant binding — never trust client org/project ids
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION operations.assert_same_tenant_deliverable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  phase_org uuid;
  phase_project uuid;
  disc_org uuid;
  team_org uuid;
  membership_project uuid;
  membership_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM project.projects p
    WHERE p.id = NEW.project_id
      AND p.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Deliverable project/organization mismatch';
  END IF;

  SELECT organization_id, project_id INTO phase_org, phase_project
    FROM operations.phases WHERE id = NEW.phase_id;
  IF phase_org IS NULL OR phase_org <> NEW.organization_id OR phase_project <> NEW.project_id THEN
    RAISE EXCEPTION 'Deliverable phase is not bound to the same Project';
  END IF;

  SELECT organization_id INTO disc_org FROM org.disciplines WHERE id = NEW.discipline_id;
  IF disc_org IS NULL OR disc_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Deliverable discipline is not bound to the same Organization';
  END IF;

  IF NEW.owner_project_membership_id IS NOT NULL THEN
    SELECT project_id, status INTO membership_project, membership_status
      FROM project.project_memberships WHERE id = NEW.owner_project_membership_id;
    IF membership_project IS NULL OR membership_project <> NEW.project_id THEN
      RAISE EXCEPTION 'Deliverable user owner is not a ProjectMembership of this Project';
    END IF;
    IF membership_status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'User owner requires an ACTIVE ProjectMembership';
    END IF;
  END IF;

  IF NEW.owner_team_id IS NOT NULL THEN
    SELECT organization_id INTO team_org FROM org.teams WHERE id = NEW.owner_team_id;
    IF team_org IS NULL OR team_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'Deliverable Team owner is not in the same Organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER deliverables_same_tenant
  BEFORE INSERT OR UPDATE ON operations.deliverables
  FOR EACH ROW
  EXECUTE FUNCTION operations.assert_same_tenant_deliverable();

CREATE OR REPLACE FUNCTION operations.assert_same_tenant_work_package()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  phase_org uuid;
  phase_project uuid;
  disc_org uuid;
  del_org uuid;
  del_project uuid;
  team_org uuid;
  membership_project uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM project.projects p
    WHERE p.id = NEW.project_id
      AND p.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'WorkPackage project/organization mismatch';
  END IF;

  SELECT organization_id, project_id INTO phase_org, phase_project
    FROM operations.phases WHERE id = NEW.phase_id;
  IF phase_org IS NULL OR phase_org <> NEW.organization_id OR phase_project <> NEW.project_id THEN
    RAISE EXCEPTION 'WorkPackage phase is not bound to the same Project';
  END IF;

  IF NEW.discipline_id IS NOT NULL THEN
    SELECT organization_id INTO disc_org FROM org.disciplines WHERE id = NEW.discipline_id;
    IF disc_org IS NULL OR disc_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'WorkPackage discipline is not bound to the same Organization';
    END IF;
  END IF;

  IF NEW.deliverable_id IS NOT NULL THEN
    SELECT organization_id, project_id INTO del_org, del_project
      FROM operations.deliverables WHERE id = NEW.deliverable_id;
    IF del_org IS NULL OR del_org <> NEW.organization_id OR del_project <> NEW.project_id THEN
      RAISE EXCEPTION 'WorkPackage deliverable is not bound to the same Project';
    END IF;
  END IF;

  IF NEW.owner_project_membership_id IS NOT NULL THEN
    SELECT project_id INTO membership_project
      FROM project.project_memberships WHERE id = NEW.owner_project_membership_id;
    IF membership_project IS NULL OR membership_project <> NEW.project_id THEN
      RAISE EXCEPTION 'WorkPackage user owner is not a ProjectMembership of this Project';
    END IF;
  END IF;

  IF NEW.owner_team_id IS NOT NULL THEN
    SELECT organization_id INTO team_org FROM org.teams WHERE id = NEW.owner_team_id;
    IF team_org IS NULL OR team_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'WorkPackage Team owner is not in the same Organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER work_packages_same_tenant
  BEFORE INSERT OR UPDATE ON operations.work_packages
  FOR EACH ROW
  EXECUTE FUNCTION operations.assert_same_tenant_work_package();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operations.deliverables TO amber_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operations.work_packages TO amber_app;
