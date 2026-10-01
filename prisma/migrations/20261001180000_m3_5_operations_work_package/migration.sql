-- M3.5: additive WorkPackage constraints for CRUD / association / ownership.
-- Does NOT rewrite M3.4 Deliverable migration or drop operations.work_packages.
-- Strengthens same-tenant trigger: Deliverable must share Project AND Phase;
-- user owner requires ACTIVE ProjectMembership. Operational rollback = restore
-- backup / do not apply. Formal Exception remains the sole Gate bypass.

ALTER TABLE "operations"."work_packages"
  ADD CONSTRAINT "work_packages_planned_due_check" CHECK (
    "planned_start_at" IS NULL
    OR "due_at" IS NULL
    OR "planned_start_at" <= "due_at"
  );

CREATE INDEX "work_packages_owner_project_membership_id_idx"
  ON "operations"."work_packages"("owner_project_membership_id");
CREATE INDEX "work_packages_owner_team_id_idx"
  ON "operations"."work_packages"("owner_team_id");

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
  del_phase uuid;
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
    SELECT organization_id, project_id, phase_id INTO del_org, del_project, del_phase
      FROM operations.deliverables WHERE id = NEW.deliverable_id;
    IF del_org IS NULL OR del_org <> NEW.organization_id OR del_project <> NEW.project_id THEN
      RAISE EXCEPTION 'WorkPackage deliverable is not bound to the same Project';
    END IF;
    IF del_phase IS NULL OR del_phase <> NEW.phase_id THEN
      RAISE EXCEPTION 'WorkPackage deliverable is not bound to the same Phase';
    END IF;
  END IF;

  IF NEW.owner_project_membership_id IS NOT NULL THEN
    SELECT project_id, status INTO membership_project, membership_status
      FROM project.project_memberships WHERE id = NEW.owner_project_membership_id;
    IF membership_project IS NULL OR membership_project <> NEW.project_id THEN
      RAISE EXCEPTION 'WorkPackage user owner is not a ProjectMembership of this Project';
    END IF;
    IF membership_status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'User owner requires an ACTIVE ProjectMembership';
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
