-- M3.7: additive Cross-Domain Traceability.
-- Planning refs on Task/Milestone; Document↔Deliverable join.
-- Does NOT rewrite M3.3–M3.6 tables destructively.
-- Does NOT change Document/Revision identity or published bytes.
-- Operational rollback = restore backup / do not apply.
-- Formal Exception remains the sole Gate bypass. Override permissions are forbidden.

-- ---------------------------------------------------------------------------
-- planning.tasks — optional delivery refs + schedule fields
-- ---------------------------------------------------------------------------

ALTER TABLE "planning"."tasks"
  ADD COLUMN IF NOT EXISTS "phase_id" UUID,
  ADD COLUMN IF NOT EXISTS "deliverable_id" UUID,
  ADD COLUMN IF NOT EXISTS "work_package_id" UUID,
  ADD COLUMN IF NOT EXISTS "planned_start_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "estimated_minutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "progress_percent" INTEGER;

ALTER TABLE "planning"."tasks"
  DROP CONSTRAINT IF EXISTS "tasks_progress_check";
ALTER TABLE "planning"."tasks"
  ADD CONSTRAINT "tasks_progress_check" CHECK (
    "progress_percent" IS NULL
    OR ("progress_percent" >= 0 AND "progress_percent" <= 100)
  );

ALTER TABLE "planning"."tasks"
  DROP CONSTRAINT IF EXISTS "tasks_estimated_minutes_check";
ALTER TABLE "planning"."tasks"
  ADD CONSTRAINT "tasks_estimated_minutes_check" CHECK (
    "estimated_minutes" IS NULL OR "estimated_minutes" >= 0
  );

CREATE INDEX IF NOT EXISTS "tasks_phase_id_idx" ON "planning"."tasks"("phase_id");
CREATE INDEX IF NOT EXISTS "tasks_deliverable_id_idx" ON "planning"."tasks"("deliverable_id");
CREATE INDEX IF NOT EXISTS "tasks_work_package_id_idx" ON "planning"."tasks"("work_package_id");

ALTER TABLE "planning"."tasks"
  DROP CONSTRAINT IF EXISTS "tasks_phase_id_fkey";
ALTER TABLE "planning"."tasks"
  ADD CONSTRAINT "tasks_phase_id_fkey"
  FOREIGN KEY ("phase_id") REFERENCES "operations"."phases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "planning"."tasks"
  DROP CONSTRAINT IF EXISTS "tasks_deliverable_id_fkey";
ALTER TABLE "planning"."tasks"
  ADD CONSTRAINT "tasks_deliverable_id_fkey"
  FOREIGN KEY ("deliverable_id") REFERENCES "operations"."deliverables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "planning"."tasks"
  DROP CONSTRAINT IF EXISTS "tasks_work_package_id_fkey";
ALTER TABLE "planning"."tasks"
  ADD CONSTRAINT "tasks_work_package_id_fkey"
  FOREIGN KEY ("work_package_id") REFERENCES "operations"."work_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- planning.milestones — optional Phase / Deliverable context
-- ---------------------------------------------------------------------------

ALTER TABLE "planning"."milestones"
  ADD COLUMN IF NOT EXISTS "phase_id" UUID,
  ADD COLUMN IF NOT EXISTS "deliverable_id" UUID;

CREATE INDEX IF NOT EXISTS "milestones_phase_id_idx" ON "planning"."milestones"("phase_id");
CREATE INDEX IF NOT EXISTS "milestones_deliverable_id_idx" ON "planning"."milestones"("deliverable_id");

ALTER TABLE "planning"."milestones"
  DROP CONSTRAINT IF EXISTS "milestones_phase_id_fkey";
ALTER TABLE "planning"."milestones"
  ADD CONSTRAINT "milestones_phase_id_fkey"
  FOREIGN KEY ("phase_id") REFERENCES "operations"."phases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "planning"."milestones"
  DROP CONSTRAINT IF EXISTS "milestones_deliverable_id_fkey";
ALTER TABLE "planning"."milestones"
  ADD CONSTRAINT "milestones_deliverable_id_fkey"
  FOREIGN KEY ("deliverable_id") REFERENCES "operations"."deliverables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- operations.deliverable_documents — tenant/project-bound evidence join
-- ---------------------------------------------------------------------------

CREATE TABLE "operations"."deliverable_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "deliverable_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverable_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deliverable_documents_deliverable_id_document_id_key"
  ON "operations"."deliverable_documents"("deliverable_id", "document_id");
CREATE INDEX "deliverable_documents_organization_id_project_id_idx"
  ON "operations"."deliverable_documents"("organization_id", "project_id");
CREATE INDEX "deliverable_documents_document_id_idx"
  ON "operations"."deliverable_documents"("document_id");

ALTER TABLE "operations"."deliverable_documents"
  ADD CONSTRAINT "deliverable_documents_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."deliverable_documents"
  ADD CONSTRAINT "deliverable_documents_project_org_fkey"
  FOREIGN KEY ("project_id", "organization_id")
  REFERENCES "project"."projects"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."deliverable_documents"
  ADD CONSTRAINT "deliverable_documents_deliverable_id_fkey"
  FOREIGN KEY ("deliverable_id") REFERENCES "operations"."deliverables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."deliverable_documents"
  ADD CONSTRAINT "deliverable_documents_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "document"."documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- tenant + chain consistency triggers (CREATE OR REPLACE existing Task/Milestone)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION planning.assert_same_tenant_task()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  issue record;
  milestone record;
  phase_org uuid;
  phase_project uuid;
  del_org uuid;
  del_project uuid;
  del_phase uuid;
  wp_org uuid;
  wp_project uuid;
  wp_phase uuid;
  wp_deliverable uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM project.projects p
    WHERE p.id = NEW.project_id
      AND p.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Task project/organization mismatch';
  END IF;
  IF NEW.issue_id IS NOT NULL THEN
    SELECT organization_id, project_id INTO issue
    FROM coordination.issues
    WHERE id = NEW.issue_id;
    IF issue IS NULL THEN
      RAISE EXCEPTION 'Task source Issue not found';
    END IF;
    IF issue.organization_id <> NEW.organization_id OR issue.project_id <> NEW.project_id THEN
      RAISE EXCEPTION 'Task tenant binding does not match Issue';
    END IF;
  END IF;
  IF NEW.milestone_id IS NOT NULL THEN
    SELECT organization_id, project_id INTO milestone
    FROM planning.milestones
    WHERE id = NEW.milestone_id;
    IF milestone IS NULL THEN
      RAISE EXCEPTION 'Task Milestone not found';
    END IF;
    IF milestone.organization_id <> NEW.organization_id OR milestone.project_id <> NEW.project_id THEN
      RAISE EXCEPTION 'Task tenant binding does not match Milestone';
    END IF;
  END IF;
  IF NEW.phase_id IS NOT NULL THEN
    SELECT organization_id, project_id INTO phase_org, phase_project
      FROM operations.phases WHERE id = NEW.phase_id;
    IF phase_org IS NULL OR phase_org <> NEW.organization_id OR phase_project <> NEW.project_id THEN
      RAISE EXCEPTION 'Task phase is not bound to the same Project';
    END IF;
  END IF;
  IF NEW.deliverable_id IS NOT NULL THEN
    SELECT organization_id, project_id, phase_id INTO del_org, del_project, del_phase
      FROM operations.deliverables WHERE id = NEW.deliverable_id;
    IF del_org IS NULL OR del_org <> NEW.organization_id OR del_project <> NEW.project_id THEN
      RAISE EXCEPTION 'Task deliverable is not bound to the same Project';
    END IF;
    IF NEW.phase_id IS NOT NULL AND del_phase <> NEW.phase_id THEN
      RAISE EXCEPTION 'Task deliverable is not bound to the same Phase';
    END IF;
  END IF;
  IF NEW.work_package_id IS NOT NULL THEN
    SELECT organization_id, project_id, phase_id, deliverable_id
      INTO wp_org, wp_project, wp_phase, wp_deliverable
      FROM operations.work_packages WHERE id = NEW.work_package_id;
    IF wp_org IS NULL OR wp_org <> NEW.organization_id OR wp_project <> NEW.project_id THEN
      RAISE EXCEPTION 'Task work package is not bound to the same Project';
    END IF;
    IF NEW.phase_id IS NOT NULL AND wp_phase <> NEW.phase_id THEN
      RAISE EXCEPTION 'Task work package is not bound to the same Phase';
    END IF;
    IF NEW.deliverable_id IS NOT NULL AND wp_deliverable IS NOT NULL AND wp_deliverable <> NEW.deliverable_id THEN
      RAISE EXCEPTION 'Task work package is not bound to the same Deliverable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION planning.assert_same_tenant_milestone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  phase_org uuid;
  phase_project uuid;
  del_org uuid;
  del_project uuid;
  del_phase uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM project.projects p
    WHERE p.id = NEW.project_id
      AND p.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Milestone project/organization mismatch';
  END IF;
  IF NEW.phase_id IS NOT NULL THEN
    SELECT organization_id, project_id INTO phase_org, phase_project
      FROM operations.phases WHERE id = NEW.phase_id;
    IF phase_org IS NULL OR phase_org <> NEW.organization_id OR phase_project <> NEW.project_id THEN
      RAISE EXCEPTION 'Milestone phase is not bound to the same Project';
    END IF;
  END IF;
  IF NEW.deliverable_id IS NOT NULL THEN
    SELECT organization_id, project_id, phase_id INTO del_org, del_project, del_phase
      FROM operations.deliverables WHERE id = NEW.deliverable_id;
    IF del_org IS NULL OR del_org <> NEW.organization_id OR del_project <> NEW.project_id THEN
      RAISE EXCEPTION 'Milestone deliverable is not bound to the same Project';
    END IF;
    IF NEW.phase_id IS NOT NULL AND del_phase <> NEW.phase_id THEN
      RAISE EXCEPTION 'Milestone deliverable is not bound to the same Phase';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION operations.assert_same_tenant_deliverable_document()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  del_org uuid;
  del_project uuid;
  doc_org uuid;
  doc_project uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM project.projects p
    WHERE p.id = NEW.project_id
      AND p.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'DeliverableDocument project/organization mismatch';
  END IF;
  SELECT organization_id, project_id INTO del_org, del_project
    FROM operations.deliverables WHERE id = NEW.deliverable_id;
  IF del_org IS NULL OR del_org <> NEW.organization_id OR del_project <> NEW.project_id THEN
    RAISE EXCEPTION 'DeliverableDocument deliverable is not bound to the same Project';
  END IF;
  SELECT organization_id, project_id INTO doc_org, doc_project
    FROM document.documents WHERE id = NEW.document_id;
  IF doc_org IS NULL OR doc_org <> NEW.organization_id OR doc_project <> NEW.project_id THEN
    RAISE EXCEPTION 'DeliverableDocument document is not bound to the same Project';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deliverable_documents_same_tenant ON "operations"."deliverable_documents";
CREATE TRIGGER deliverable_documents_same_tenant
  BEFORE INSERT OR UPDATE ON "operations"."deliverable_documents"
  FOR EACH ROW
  EXECUTE FUNCTION operations.assert_same_tenant_deliverable_document();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operations.deliverable_documents TO amber_app;
