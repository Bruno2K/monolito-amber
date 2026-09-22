-- PF-1.5: Planning / Tasks / Milestones.
-- Additive only. No Gate / Formal Exception tables.
-- Issue ≠ Task. Completing a Task does not resolve an Issue or achieve a Milestone.

CREATE SCHEMA IF NOT EXISTS "planning";

-- ---------------------------------------------------------------------------
-- milestones (created first so tasks can FK)
-- Stored status is explicit only: PLANNED | ACHIEVED | CANCELLED.
-- AT_RISK / MISSED are derived on read (ADR-016).
-- ---------------------------------------------------------------------------

CREATE TABLE "planning"."milestones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "target_date" TIMESTAMP(3),
    "achieved_by_user_id" UUID,
    "achieved_at" TIMESTAMP(3),
    "cancelled_by_user_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "milestones_status_check" CHECK ("status" IN ('PLANNED', 'ACHIEVED', 'CANCELLED')),
    CONSTRAINT "milestones_title_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "milestones_version_check" CHECK ("version" >= 1),
    CONSTRAINT "milestones_achieved_check" CHECK (
      ("status" <> 'ACHIEVED')
      OR ("achieved_by_user_id" IS NOT NULL AND "achieved_at" IS NOT NULL)
    ),
    CONSTRAINT "milestones_cancelled_check" CHECK (
      ("status" <> 'CANCELLED')
      OR ("cancelled_by_user_id" IS NOT NULL AND "cancelled_at" IS NOT NULL)
    )
);

CREATE INDEX "milestones_organization_id_project_id_idx" ON "planning"."milestones"("organization_id", "project_id");

ALTER TABLE "planning"."milestones"
  ADD CONSTRAINT "milestones_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

CREATE TABLE "planning"."tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "issue_id" UUID,
    "milestone_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT,
    "responsible_discipline_id" TEXT,
    "assignee_user_id" UUID,
    "due_date" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "blocked_reason" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tasks_status_check" CHECK ("status" IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED')),
    CONSTRAINT "tasks_priority_check" CHECK ("priority" IS NULL OR "priority" IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    CONSTRAINT "tasks_title_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "tasks_version_check" CHECK ("version" >= 1),
    CONSTRAINT "tasks_blocked_reason_check" CHECK (
      ("status" <> 'BLOCKED' AND ("blocked_reason" IS NULL OR length(trim("blocked_reason")) = 0))
      OR
      ("status" = 'BLOCKED' AND "blocked_reason" IS NOT NULL AND length(trim("blocked_reason")) > 0)
    ),
    CONSTRAINT "tasks_completed_check" CHECK (
      ("status" <> 'DONE')
      OR ("completed_at" IS NOT NULL)
    )
);

CREATE INDEX "tasks_organization_id_project_id_idx" ON "planning"."tasks"("organization_id", "project_id");
CREATE INDEX "tasks_issue_id_idx" ON "planning"."tasks"("issue_id");
CREATE INDEX "tasks_milestone_id_idx" ON "planning"."tasks"("milestone_id");

ALTER TABLE "planning"."tasks"
  ADD CONSTRAINT "tasks_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "planning"."tasks"
  ADD CONSTRAINT "tasks_issue_id_fkey"
  FOREIGN KEY ("issue_id") REFERENCES "coordination"."issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "planning"."tasks"
  ADD CONSTRAINT "tasks_milestone_id_fkey"
  FOREIGN KEY ("milestone_id") REFERENCES "planning"."milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- task_dependencies — finish-to-start only
-- ---------------------------------------------------------------------------

CREATE TABLE "planning"."task_dependencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "predecessor_task_id" UUID NOT NULL,
    "successor_task_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FINISH_TO_START',
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_dependencies_type_check" CHECK ("type" = 'FINISH_TO_START'),
    CONSTRAINT "task_dependencies_not_self_check" CHECK ("predecessor_task_id" <> "successor_task_id")
);

CREATE UNIQUE INDEX "task_dependencies_predecessor_task_id_successor_task_id_key"
  ON "planning"."task_dependencies"("predecessor_task_id", "successor_task_id");
CREATE INDEX "task_dependencies_organization_id_project_id_idx"
  ON "planning"."task_dependencies"("organization_id", "project_id");
CREATE INDEX "task_dependencies_successor_task_id_idx"
  ON "planning"."task_dependencies"("successor_task_id");

ALTER TABLE "planning"."task_dependencies"
  ADD CONSTRAINT "task_dependencies_predecessor_task_id_fkey"
  FOREIGN KEY ("predecessor_task_id") REFERENCES "planning"."tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "planning"."task_dependencies"
  ADD CONSTRAINT "task_dependencies_successor_task_id_fkey"
  FOREIGN KEY ("successor_task_id") REFERENCES "planning"."tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- tenant binding — never trust client org/project ids
-- Cycle checks stay in the application and only walk same-Project edges.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION planning.assert_same_tenant_milestone()
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
    RAISE EXCEPTION 'Milestone project/organization mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER milestones_same_tenant
  BEFORE INSERT OR UPDATE ON planning.milestones
  FOR EACH ROW
  EXECUTE FUNCTION planning.assert_same_tenant_milestone();

CREATE OR REPLACE FUNCTION planning.assert_same_tenant_task()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  issue record;
  milestone record;
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
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_same_tenant
  BEFORE INSERT OR UPDATE ON planning.tasks
  FOR EACH ROW
  EXECUTE FUNCTION planning.assert_same_tenant_task();

CREATE OR REPLACE FUNCTION planning.assert_same_tenant_dependency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  pred record;
  succ record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM project.projects p
    WHERE p.id = NEW.project_id
      AND p.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Task dependency project/organization mismatch';
  END IF;
  SELECT organization_id, project_id INTO pred
  FROM planning.tasks
  WHERE id = NEW.predecessor_task_id;
  SELECT organization_id, project_id INTO succ
  FROM planning.tasks
  WHERE id = NEW.successor_task_id;
  IF pred IS NULL OR succ IS NULL THEN
    RAISE EXCEPTION 'Task dependency endpoint not found';
  END IF;
  IF pred.organization_id <> NEW.organization_id
     OR pred.project_id <> NEW.project_id
     OR succ.organization_id <> NEW.organization_id
     OR succ.project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'Task dependency tenant binding does not match both Tasks';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_dependencies_same_tenant
  BEFORE INSERT OR UPDATE ON planning.task_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION planning.assert_same_tenant_dependency();

-- Planning never mutates coordination.issues status or document current revision.

GRANT USAGE ON SCHEMA planning TO amber_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA planning TO amber_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA planning GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO amber_app;
