-- PF-1.6: Governance / Gates / Formal Exceptions.
-- Additive only. Formal Exception is the sole bypass. No gate.override / forceRelease.
-- READY ≠ RELEASED. Exception never marks a requirement SATISFIED.
-- RELEASED ≠ RELEASED_WITH_EXCEPTION. Exception is requirement-specific.

CREATE SCHEMA IF NOT EXISTS "governance";

-- ---------------------------------------------------------------------------
-- gates
-- ---------------------------------------------------------------------------

CREATE TABLE "governance"."gates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'NOT_READY',
    "last_evaluated_at" TIMESTAMP(3),
    "last_evaluated_by_user_id" UUID,
    "released_at" TIMESTAMP(3),
    "released_by_user_id" UUID,
    "release_kind" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gates_status_check" CHECK ("status" IN (
      'NOT_READY', 'BLOCKED', 'READY', 'RELEASED', 'RELEASED_WITH_EXCEPTION'
    )),
    CONSTRAINT "gates_name_check" CHECK (length(trim("name")) > 0),
    CONSTRAINT "gates_version_check" CHECK ("version" >= 1),
    CONSTRAINT "gates_release_kind_check" CHECK (
      "release_kind" IS NULL OR "release_kind" IN ('NORMAL', 'WITH_EXCEPTION')
    ),
    CONSTRAINT "gates_released_check" CHECK (
      ("status" NOT IN ('RELEASED', 'RELEASED_WITH_EXCEPTION'))
      OR (
        "released_at" IS NOT NULL
        AND "released_by_user_id" IS NOT NULL
        AND "release_kind" IS NOT NULL
      )
    )
);

CREATE INDEX "gates_organization_id_project_id_idx"
  ON "governance"."gates"("organization_id", "project_id");

ALTER TABLE "governance"."gates"
  ADD CONSTRAINT "gates_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- gate_requirements
-- Satisfaction is persisted separately from Exception coverage.
-- ---------------------------------------------------------------------------

CREATE TABLE "governance"."gate_requirements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "gate_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT TRUE,
    "config" JSONB NOT NULL,
    "checklist" JSONB NOT NULL,
    "last_satisfaction" TEXT,
    "last_covered_by_exception" BOOLEAN NOT NULL DEFAULT FALSE,
    "last_covering_exception_id" UUID,
    "last_evaluated_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_requirements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate_requirements_type_check" CHECK ("type" IN (
      'DOCUMENT_REQUIRED',
      'REVISION_APPROVED',
      'ISSUE_STATE',
      'TASK_STATE',
      'MILESTONE_STATE',
      'MANUAL_APPROVAL',
      'CHECKLIST_COMPLETE'
    )),
    CONSTRAINT "gate_requirements_title_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "gate_requirements_version_check" CHECK ("version" >= 1),
    CONSTRAINT "gate_requirements_satisfaction_check" CHECK (
      "last_satisfaction" IS NULL OR "last_satisfaction" IN ('SATISFIED', 'UNSATISFIED')
    ),
    CONSTRAINT "gate_requirements_coverage_not_satisfaction_check" CHECK (
      NOT ("last_covered_by_exception" = TRUE AND "last_satisfaction" = 'SATISFIED')
    )
);

CREATE INDEX "gate_requirements_organization_id_project_id_idx"
  ON "governance"."gate_requirements"("organization_id", "project_id");
CREATE INDEX "gate_requirements_gate_id_idx"
  ON "governance"."gate_requirements"("gate_id");

ALTER TABLE "governance"."gate_requirements"
  ADD CONSTRAINT "gate_requirements_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "governance"."gate_requirements"
  ADD CONSTRAINT "gate_requirements_gate_id_fkey"
  FOREIGN KEY ("gate_id") REFERENCES "governance"."gates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- formal_exceptions — requirement-specific; immutable history via forward transitions
-- ---------------------------------------------------------------------------

CREATE TABLE "governance"."formal_exceptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "gate_id" UUID NOT NULL,
    "gate_requirement_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMP(3),
    "revoked_by_user_id" UUID,
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formal_exceptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "formal_exceptions_status_check" CHECK ("status" IN (
      'REQUESTED', 'APPROVED', 'REJECTED', 'REVOKED'
    )),
    CONSTRAINT "formal_exceptions_reason_check" CHECK (length(trim("reason")) > 0),
    CONSTRAINT "formal_exceptions_version_check" CHECK ("version" >= 1),
    CONSTRAINT "formal_exceptions_decided_check" CHECK (
      ("status" NOT IN ('APPROVED', 'REJECTED'))
      OR ("decided_by_user_id" IS NOT NULL AND "decided_at" IS NOT NULL)
    ),
    CONSTRAINT "formal_exceptions_revoked_check" CHECK (
      ("status" <> 'REVOKED')
      OR ("revoked_by_user_id" IS NOT NULL AND "revoked_at" IS NOT NULL)
    )
);

CREATE INDEX "formal_exceptions_organization_id_project_id_idx"
  ON "governance"."formal_exceptions"("organization_id", "project_id");
CREATE INDEX "formal_exceptions_gate_requirement_id_idx"
  ON "governance"."formal_exceptions"("gate_requirement_id");

ALTER TABLE "governance"."formal_exceptions"
  ADD CONSTRAINT "formal_exceptions_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "governance"."formal_exceptions"
  ADD CONSTRAINT "formal_exceptions_gate_id_fkey"
  FOREIGN KEY ("gate_id") REFERENCES "governance"."gates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "governance"."formal_exceptions"
  ADD CONSTRAINT "formal_exceptions_gate_requirement_id_fkey"
  FOREIGN KEY ("gate_requirement_id") REFERENCES "governance"."gate_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- gate_release_decisions — durable, immutable evidence
-- ---------------------------------------------------------------------------

CREATE TABLE "governance"."gate_release_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "gate_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "released_by_user_id" UUID NOT NULL,
    "released_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gate_version" INTEGER NOT NULL,
    "evaluation_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_release_decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate_release_decisions_kind_check" CHECK ("kind" IN ('NORMAL', 'WITH_EXCEPTION'))
);

CREATE INDEX "gate_release_decisions_organization_id_project_id_idx"
  ON "governance"."gate_release_decisions"("organization_id", "project_id");
CREATE INDEX "gate_release_decisions_gate_id_released_at_idx"
  ON "governance"."gate_release_decisions"("gate_id", "released_at");

ALTER TABLE "governance"."gate_release_decisions"
  ADD CONSTRAINT "gate_release_decisions_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "governance"."gate_release_decisions"
  ADD CONSTRAINT "gate_release_decisions_gate_id_fkey"
  FOREIGN KEY ("gate_id") REFERENCES "governance"."gates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- used-exception links for WITH_EXCEPTION releases
-- ---------------------------------------------------------------------------

CREATE TABLE "governance"."gate_release_used_exceptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "release_decision_id" UUID NOT NULL,
    "formal_exception_id" UUID NOT NULL,
    "gate_requirement_id" UUID NOT NULL,

    CONSTRAINT "gate_release_used_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gate_release_used_exceptions_decision_exception_key"
  ON "governance"."gate_release_used_exceptions"("release_decision_id", "formal_exception_id");
CREATE INDEX "gate_release_used_exceptions_formal_exception_id_idx"
  ON "governance"."gate_release_used_exceptions"("formal_exception_id");

ALTER TABLE "governance"."gate_release_used_exceptions"
  ADD CONSTRAINT "gate_release_used_exceptions_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "governance"."gate_release_used_exceptions"
  ADD CONSTRAINT "gate_release_used_exceptions_release_decision_id_fkey"
  FOREIGN KEY ("release_decision_id") REFERENCES "governance"."gate_release_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "governance"."gate_release_used_exceptions"
  ADD CONSTRAINT "gate_release_used_exceptions_formal_exception_id_fkey"
  FOREIGN KEY ("formal_exception_id") REFERENCES "governance"."formal_exceptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "governance"."gate_release_used_exceptions"
  ADD CONSTRAINT "gate_release_used_exceptions_gate_requirement_id_fkey"
  FOREIGN KEY ("gate_requirement_id") REFERENCES "governance"."gate_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- tenant binding — never trust client org/project ids
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION governance.assert_same_tenant_gate()
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
    RAISE EXCEPTION 'Gate project/organization mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER gates_same_tenant
  BEFORE INSERT OR UPDATE ON governance.gates
  FOR EACH ROW
  EXECUTE FUNCTION governance.assert_same_tenant_gate();

CREATE OR REPLACE FUNCTION governance.assert_same_tenant_requirement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  gate record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM project.projects p
    WHERE p.id = NEW.project_id
      AND p.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'GateRequirement project/organization mismatch';
  END IF;
  SELECT organization_id, project_id INTO gate
  FROM governance.gates
  WHERE id = NEW.gate_id;
  IF gate IS NULL THEN
    RAISE EXCEPTION 'GateRequirement Gate not found';
  END IF;
  IF gate.organization_id <> NEW.organization_id OR gate.project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'GateRequirement tenant binding does not match Gate';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER gate_requirements_same_tenant
  BEFORE INSERT OR UPDATE ON governance.gate_requirements
  FOR EACH ROW
  EXECUTE FUNCTION governance.assert_same_tenant_requirement();

CREATE OR REPLACE FUNCTION governance.assert_same_tenant_exception()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  gate record;
  requirement record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM project.projects p
    WHERE p.id = NEW.project_id
      AND p.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'FormalException project/organization mismatch';
  END IF;
  SELECT organization_id, project_id INTO gate
  FROM governance.gates
  WHERE id = NEW.gate_id;
  SELECT organization_id, project_id, gate_id INTO requirement
  FROM governance.gate_requirements
  WHERE id = NEW.gate_requirement_id;
  IF gate IS NULL OR requirement IS NULL THEN
    RAISE EXCEPTION 'FormalException Gate or Requirement not found';
  END IF;
  IF gate.organization_id <> NEW.organization_id
     OR gate.project_id <> NEW.project_id
     OR requirement.organization_id <> NEW.organization_id
     OR requirement.project_id <> NEW.project_id
     OR requirement.gate_id <> NEW.gate_id THEN
    RAISE EXCEPTION 'FormalException tenant binding does not match GateRequirement';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER formal_exceptions_same_tenant
  BEFORE INSERT OR UPDATE ON governance.formal_exceptions
  FOR EACH ROW
  EXECUTE FUNCTION governance.assert_same_tenant_exception();

CREATE OR REPLACE FUNCTION governance.assert_same_tenant_release()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  gate record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM project.projects p
    WHERE p.id = NEW.project_id
      AND p.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'GateReleaseDecision project/organization mismatch';
  END IF;
  SELECT organization_id, project_id INTO gate
  FROM governance.gates
  WHERE id = NEW.gate_id;
  IF gate IS NULL THEN
    RAISE EXCEPTION 'GateReleaseDecision Gate not found';
  END IF;
  IF gate.organization_id <> NEW.organization_id OR gate.project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'GateReleaseDecision tenant binding does not match Gate';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER gate_release_decisions_same_tenant
  BEFORE INSERT OR UPDATE ON governance.gate_release_decisions
  FOR EACH ROW
  EXECUTE FUNCTION governance.assert_same_tenant_release();

CREATE OR REPLACE FUNCTION governance.assert_same_tenant_used_exception()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  decision record;
  exception record;
  requirement record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM project.projects p
    WHERE p.id = NEW.project_id
      AND p.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'GateReleaseUsedException project/organization mismatch';
  END IF;
  SELECT organization_id, project_id, gate_id INTO decision
  FROM governance.gate_release_decisions
  WHERE id = NEW.release_decision_id;
  SELECT organization_id, project_id, gate_id, gate_requirement_id INTO exception
  FROM governance.formal_exceptions
  WHERE id = NEW.formal_exception_id;
  SELECT organization_id, project_id, gate_id INTO requirement
  FROM governance.gate_requirements
  WHERE id = NEW.gate_requirement_id;
  IF decision IS NULL OR exception IS NULL OR requirement IS NULL THEN
    RAISE EXCEPTION 'GateReleaseUsedException related row not found';
  END IF;
  IF decision.organization_id <> NEW.organization_id
     OR decision.project_id <> NEW.project_id
     OR exception.organization_id <> NEW.organization_id
     OR exception.project_id <> NEW.project_id
     OR requirement.organization_id <> NEW.organization_id
     OR requirement.project_id <> NEW.project_id
     OR exception.gate_requirement_id <> NEW.gate_requirement_id THEN
    RAISE EXCEPTION 'GateReleaseUsedException tenant binding mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER gate_release_used_exceptions_same_tenant
  BEFORE INSERT OR UPDATE ON governance.gate_release_used_exceptions
  FOR EACH ROW
  EXECUTE FUNCTION governance.assert_same_tenant_used_exception();

-- Release decisions are immutable evidence. Application updates are denied at the API;
-- the table still allows UPDATE for schema tools, but amber_app is not given DELETE.

GRANT USAGE ON SCHEMA governance TO amber_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA governance TO amber_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA governance GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO amber_app;
