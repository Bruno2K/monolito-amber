-- PF-1.4: Coordination / Impact Analysis Foundation.
-- Additive only. No Task / Milestone / Gate / Formal Exception tables.
-- Auto-create of Impact Analysis is PENDING_ANALYSIS only (unique change_key).

CREATE SCHEMA IF NOT EXISTS "coordination";

-- ---------------------------------------------------------------------------
-- impact_analyses
-- ---------------------------------------------------------------------------

CREATE TABLE "coordination"."impact_analyses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "source_revision_id" UUID NOT NULL,
    "previous_revision_id" UUID,
    "change_key" TEXT NOT NULL,
    "source_outbox_message_id" UUID,
    "correlation_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_ANALYSIS',
    "affected_context" TEXT,
    "assessed_by_user_id" UUID,
    "assessed_at" TIMESTAMP(3),
    "assessment_result" TEXT,
    "assessment_rationale" TEXT,
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impact_analyses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "impact_analyses_status_check" CHECK ("status" IN ('PENDING_ANALYSIS', 'IMPACTED', 'NOT_IMPACTED', 'RESOLVED')),
    CONSTRAINT "impact_analyses_assessment_check" CHECK (
      ("status" = 'PENDING_ANALYSIS' AND "assessment_result" IS NULL AND "assessed_by_user_id" IS NULL AND "assessed_at" IS NULL)
      OR
      ("status" IN ('IMPACTED', 'NOT_IMPACTED', 'RESOLVED')
        AND "assessment_result" IN ('IMPACTED', 'NOT_IMPACTED')
        AND "assessed_by_user_id" IS NOT NULL
        AND "assessed_at" IS NOT NULL
        AND "assessment_rationale" IS NOT NULL
        AND length(trim("assessment_rationale")) > 0)
    ),
    CONSTRAINT "impact_analyses_resolved_check" CHECK (
      ("status" <> 'RESOLVED')
      OR ("resolved_by_user_id" IS NOT NULL AND "resolved_at" IS NOT NULL)
    ),
    CONSTRAINT "impact_analyses_version_check" CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX "impact_analyses_change_key_key" ON "coordination"."impact_analyses"("change_key");
CREATE INDEX "impact_analyses_organization_id_project_id_idx" ON "coordination"."impact_analyses"("organization_id", "project_id");
CREATE INDEX "impact_analyses_document_id_source_revision_id_idx" ON "coordination"."impact_analyses"("document_id", "source_revision_id");

ALTER TABLE "coordination"."impact_analyses"
  ADD CONSTRAINT "impact_analyses_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- issues
-- ---------------------------------------------------------------------------

CREATE TABLE "coordination"."issues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "impact_analysis_id" UUID,
    "origin" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "severity" TEXT,
    "priority" TEXT,
    "responsible_discipline_id" TEXT,
    "assignee_user_id" UUID,
    "due_date" TIMESTAMP(3),
    "created_by_user_id" UUID NOT NULL,
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "closed_by_user_id" UUID,
    "closed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "issues_origin_check" CHECK ("origin" IN ('IMPACT', 'MANUAL')),
    CONSTRAINT "issues_origin_impact_check" CHECK (
      ("origin" = 'IMPACT' AND "impact_analysis_id" IS NOT NULL)
      OR
      ("origin" = 'MANUAL' AND "impact_analysis_id" IS NULL)
    ),
    CONSTRAINT "issues_status_check" CHECK ("status" IN (
      'OPEN', 'IN_ANALYSIS', 'IN_PROGRESS', 'READY_FOR_REVIEW',
      'RESOLVED', 'CLOSED', 'REJECTED', 'CANCELLED', 'REOPENED'
    )),
    CONSTRAINT "issues_severity_check" CHECK ("severity" IS NULL OR "severity" IN ('LOW', 'MEDIUM', 'HIGH', 'BLOCKER')),
    CONSTRAINT "issues_priority_check" CHECK ("priority" IS NULL OR "priority" IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    CONSTRAINT "issues_title_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "issues_version_check" CHECK ("version" >= 1)
);

CREATE INDEX "issues_organization_id_project_id_idx" ON "coordination"."issues"("organization_id", "project_id");
CREATE INDEX "issues_impact_analysis_id_idx" ON "coordination"."issues"("impact_analysis_id");

ALTER TABLE "coordination"."issues"
  ADD CONSTRAINT "issues_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "coordination"."issues"
  ADD CONSTRAINT "issues_impact_analysis_id_fkey"
  FOREIGN KEY ("impact_analysis_id") REFERENCES "coordination"."impact_analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- issue_status_events / comments / evidence
-- ---------------------------------------------------------------------------

CREATE TABLE "coordination"."issue_status_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "rationale" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_status_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "issue_status_events_issue_id_created_at_idx" ON "coordination"."issue_status_events"("issue_id", "created_at");

ALTER TABLE "coordination"."issue_status_events"
  ADD CONSTRAINT "issue_status_events_issue_id_fkey"
  FOREIGN KEY ("issue_id") REFERENCES "coordination"."issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "coordination"."issue_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "issue_comments_body_check" CHECK (length(trim("body")) > 0)
);

CREATE INDEX "issue_comments_issue_id_created_at_idx" ON "coordination"."issue_comments"("issue_id", "created_at");

ALTER TABLE "coordination"."issue_comments"
  ADD CONSTRAINT "issue_comments_issue_id_fkey"
  FOREIGN KEY ("issue_id") REFERENCES "coordination"."issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "coordination"."issue_evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "added_by_user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "stored_object_id" UUID,
    "reference" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "issue_evidence_kind_check" CHECK ("kind" IN ('FILE', 'NOTE', 'URI'))
);

CREATE INDEX "issue_evidence_issue_id_created_at_idx" ON "coordination"."issue_evidence"("issue_id", "created_at");

ALTER TABLE "coordination"."issue_evidence"
  ADD CONSTRAINT "issue_evidence_issue_id_fkey"
  FOREIGN KEY ("issue_id") REFERENCES "coordination"."issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- tenant binding — never trust client org/project ids
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION coordination.assert_same_tenant_impact()
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
    RAISE EXCEPTION 'Impact Analysis project/organization mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM document.documents d
    WHERE d.id = NEW.document_id
      AND d.organization_id = NEW.organization_id
      AND d.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'Impact Analysis document tenant binding does not match Project';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM document.revisions r
    WHERE r.id = NEW.source_revision_id
      AND r.document_id = NEW.document_id
      AND r.organization_id = NEW.organization_id
      AND r.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'Impact Analysis source revision tenant binding does not match Document';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER impact_analyses_same_tenant
  BEFORE INSERT OR UPDATE ON coordination.impact_analyses
  FOR EACH ROW
  EXECUTE FUNCTION coordination.assert_same_tenant_impact();

CREATE OR REPLACE FUNCTION coordination.assert_same_tenant_issue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  impact record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM project.projects p
    WHERE p.id = NEW.project_id
      AND p.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Issue project/organization mismatch';
  END IF;
  IF NEW.impact_analysis_id IS NOT NULL THEN
    SELECT organization_id, project_id INTO impact
    FROM coordination.impact_analyses
    WHERE id = NEW.impact_analysis_id;
    IF impact IS NULL THEN
      RAISE EXCEPTION 'Issue Impact Analysis not found';
    END IF;
    IF impact.organization_id <> NEW.organization_id OR impact.project_id <> NEW.project_id THEN
      RAISE EXCEPTION 'Issue tenant binding does not match Impact Analysis';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER issues_same_tenant
  BEFORE INSERT OR UPDATE ON coordination.issues
  FOR EACH ROW
  EXECUTE FUNCTION coordination.assert_same_tenant_issue();

CREATE OR REPLACE FUNCTION coordination.assert_same_tenant_issue_child()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent record;
BEGIN
  SELECT organization_id, project_id INTO parent
  FROM coordination.issues
  WHERE id = NEW.issue_id;
  IF parent IS NULL THEN
    RAISE EXCEPTION 'Issue child parent not found';
  END IF;
  IF parent.organization_id <> NEW.organization_id OR parent.project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'Issue child tenant binding does not match Issue';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER issue_status_events_same_tenant
  BEFORE INSERT OR UPDATE ON coordination.issue_status_events
  FOR EACH ROW
  EXECUTE FUNCTION coordination.assert_same_tenant_issue_child();

CREATE TRIGGER issue_comments_same_tenant
  BEFORE INSERT OR UPDATE ON coordination.issue_comments
  FOR EACH ROW
  EXECUTE FUNCTION coordination.assert_same_tenant_issue_child();

CREATE TRIGGER issue_evidence_same_tenant
  BEFORE INSERT OR UPDATE ON coordination.issue_evidence
  FOR EACH ROW
  EXECUTE FUNCTION coordination.assert_same_tenant_issue_child();

-- Coordination must never mutate Document current revision / Revision lifecycle.
-- No triggers or FKs write into document.documents / document.revisions.

GRANT USAGE ON SCHEMA coordination TO amber_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA coordination TO amber_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA coordination GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO amber_app;
