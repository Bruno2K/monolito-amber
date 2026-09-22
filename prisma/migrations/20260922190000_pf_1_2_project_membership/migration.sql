-- PF-1.2: Amber Role Templates ≠ Organization-owned RoleDefinitions.
-- Global templates (organization_id IS NULL) remain seed-only and are never
-- operational AuthZ grants. Existing Orgs receive instantiated copies.
-- ProjectMembership + ProjectRoleAssignment become first-class.

-- ---------------------------------------------------------------------------
-- RoleDefinition lineage + template vs org-owned constraint
-- ---------------------------------------------------------------------------

ALTER TABLE "org"."role_definitions"
  ADD COLUMN "source_template_key" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "org"."role_definitions"
SET "source_template_key" = "template_key"
WHERE "source_template_key" IS NULL;

ALTER TABLE "org"."role_definitions"
  ALTER COLUMN "source_template_key" SET NOT NULL;

ALTER TABLE "org"."role_definitions"
  ADD CONSTRAINT role_definitions_template_vs_owned
  CHECK (
    (is_system_template = TRUE AND organization_id IS NULL)
    OR
    (is_system_template = FALSE AND organization_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS role_definitions_org_owned_template_key
  ON org.role_definitions (organization_id, template_key)
  WHERE organization_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Instantiate Organization-owned RoleDefinitions for existing Orgs
-- ---------------------------------------------------------------------------

INSERT INTO org.role_definitions (
  id,
  organization_id,
  template_key,
  source_template_key,
  name,
  description,
  is_system_template,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  o.id,
  t.template_key,
  t.source_template_key,
  t.name,
  t.description,
  FALSE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM org.organizations o
CROSS JOIN org.role_definitions t
WHERE t.organization_id IS NULL
  AND t.is_system_template = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM org.role_definitions existing
    WHERE existing.organization_id = o.id
      AND existing.template_key = t.template_key
  );

INSERT INTO org.role_permissions (role_id, permission_id)
SELECT owned.id, rp.permission_id
FROM org.role_definitions owned
JOIN org.role_definitions template
  ON template.organization_id IS NULL
 AND template.template_key = owned.source_template_key
JOIN org.role_permissions rp
  ON rp.role_id = template.id
WHERE owned.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM org.role_permissions existing
    WHERE existing.role_id = owned.id
      AND existing.permission_id = rp.permission_id
  );

-- ---------------------------------------------------------------------------
-- Remap org-level RoleBindings from global templates to org-owned copies
-- ---------------------------------------------------------------------------

UPDATE org.role_bindings rb
SET role_id = owned.id
FROM org.organization_memberships m,
     org.role_definitions template,
     org.role_definitions owned
WHERE rb.membership_id = m.id
  AND template.id = rb.role_id
  AND template.organization_id IS NULL
  AND owned.organization_id = m.organization_id
  AND owned.template_key = template.template_key
  AND rb.project_id IS NULL;

-- Deduplicate any remapped (membership_id, role_id) pairs before unique index.
DELETE FROM org.role_bindings a
USING org.role_bindings b
WHERE a.ctid < b.ctid
  AND a.membership_id = b.membership_id
  AND a.role_id = b.role_id;

-- ---------------------------------------------------------------------------
-- Project tables (created before migrating any project-scoped RoleBindings)
-- ---------------------------------------------------------------------------

ALTER TABLE "project"."projects" ADD COLUMN "archived_at" TIMESTAMP(3);

CREATE TABLE "project"."project_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "organization_membership_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMP(3),

    CONSTRAINT "project_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_memberships_project_id_organization_membership_id_key"
  ON "project"."project_memberships"("project_id", "organization_membership_id");
CREATE INDEX "project_memberships_organization_membership_id_idx"
  ON "project"."project_memberships"("organization_membership_id");

ALTER TABLE "project"."project_memberships"
  ADD CONSTRAINT "project_memberships_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project"."project_memberships"
  ADD CONSTRAINT "project_memberships_organization_membership_id_fkey"
  FOREIGN KEY ("organization_membership_id") REFERENCES "org"."organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "project"."project_role_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_role_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_role_assignments_project_membership_id_role_id_key"
  ON "project"."project_role_assignments"("project_membership_id", "role_id");

ALTER TABLE "project"."project_role_assignments"
  ADD CONSTRAINT "project_role_assignments_project_membership_id_fkey"
  FOREIGN KEY ("project_membership_id") REFERENCES "project"."project_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project"."project_role_assignments"
  ADD CONSTRAINT "project_role_assignments_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "org"."role_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrate leftover RoleBindings that carried a project_id (implicit project access).
INSERT INTO project.project_memberships (
  id,
  project_id,
  organization_membership_id,
  status,
  version,
  created_at,
  updated_at,
  deactivated_at
)
SELECT
  gen_random_uuid(),
  rb.project_id,
  rb.membership_id,
  'ACTIVE',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM org.role_bindings rb
JOIN project.projects p ON p.id = rb.project_id
WHERE rb.project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM project.project_memberships pm
    WHERE pm.project_id = rb.project_id
      AND pm.organization_membership_id = rb.membership_id
  );

INSERT INTO project.project_role_assignments (
  id,
  project_membership_id,
  role_id,
  created_at
)
SELECT
  gen_random_uuid(),
  pm.id,
  owned.id,
  CURRENT_TIMESTAMP
FROM org.role_bindings rb
JOIN project.project_memberships pm
  ON pm.project_id = rb.project_id
 AND pm.organization_membership_id = rb.membership_id
JOIN org.organization_memberships m ON m.id = rb.membership_id
JOIN org.role_definitions source ON source.id = rb.role_id
JOIN org.role_definitions owned
  ON owned.organization_id = m.organization_id
 AND owned.template_key = source.template_key
WHERE rb.project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM project.project_role_assignments pra
    WHERE pra.project_membership_id = pm.id
      AND pra.role_id = owned.id
  );

DELETE FROM org.role_bindings WHERE project_id IS NOT NULL;

DELETE FROM org.role_bindings rb
USING org.role_definitions r
WHERE rb.role_id = r.id
  AND r.organization_id IS NULL;

ALTER TABLE "org"."role_bindings" DROP COLUMN "project_id";

CREATE UNIQUE INDEX "role_bindings_membership_id_role_id_key"
  ON "org"."role_bindings"("membership_id", "role_id");

-- ---------------------------------------------------------------------------
-- Integrity: operational roles only; same-Organization assignment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION org.assert_operational_same_org_role_binding()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM org.organization_memberships m
    JOIN org.role_definitions r ON r.id = NEW.role_id
    WHERE m.id = NEW.membership_id
      AND r.organization_id IS NOT NULL
      AND r.is_system_template = FALSE
      AND r.organization_id = m.organization_id
  ) THEN
    RAISE EXCEPTION 'RoleBinding must reference an Organization-owned RoleDefinition of the same Organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS role_bindings_operational_same_org ON org.role_bindings;
CREATE TRIGGER role_bindings_operational_same_org
  BEFORE INSERT OR UPDATE ON org.role_bindings
  FOR EACH ROW EXECUTE FUNCTION org.assert_operational_same_org_role_binding();

CREATE OR REPLACE FUNCTION project.assert_project_membership_same_org()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM project.projects p
    JOIN org.organization_memberships m ON m.id = NEW.organization_membership_id
    WHERE p.id = NEW.project_id
      AND p.organization_id = m.organization_id
  ) THEN
    RAISE EXCEPTION 'ProjectMembership must connect an OrganizationMembership of the same Organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS project_memberships_same_org ON project.project_memberships;
CREATE TRIGGER project_memberships_same_org
  BEFORE INSERT OR UPDATE ON project.project_memberships
  FOR EACH ROW EXECUTE FUNCTION project.assert_project_membership_same_org();

CREATE OR REPLACE FUNCTION project.assert_same_org_role_assignment()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM project.project_memberships pm
    JOIN project.projects p ON p.id = pm.project_id
    JOIN org.role_definitions r ON r.id = NEW.role_id
    WHERE pm.id = NEW.project_membership_id
      AND r.organization_id IS NOT NULL
      AND r.is_system_template = FALSE
      AND r.organization_id = p.organization_id
  ) THEN
    RAISE EXCEPTION 'Project role assignment must reference an Organization-owned RoleDefinition of the Project Organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS project_role_assignments_same_org ON project.project_role_assignments;
CREATE TRIGGER project_role_assignments_same_org
  BEFORE INSERT OR UPDATE ON project.project_role_assignments
  FOR EACH ROW EXECUTE FUNCTION project.assert_same_org_role_assignment();
