-- M5.1: Calendar + Messaging additive schemas.
-- Expand-only. Does not rewrite Planning/Operations/Identity history.
-- Does not add ResourceAllocation, TimeEntry, attachments, or moderation tables.
-- Operational rollback = restore backup / do not apply. Not DROP SCHEMA.

CREATE SCHEMA IF NOT EXISTS "calendar";
CREATE SCHEMA IF NOT EXISTS "messaging";

-- ---------------------------------------------------------------------------
-- calendar.calendars
-- ---------------------------------------------------------------------------

CREATE TABLE "calendar"."calendars" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "owner_organization_membership_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "time_zone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendars_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calendars_name_check" CHECK (length(trim("name")) > 0),
    CONSTRAINT "calendars_time_zone_check" CHECK (length(trim("time_zone")) > 0),
    CONSTRAINT "calendars_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED')),
    CONSTRAINT "calendars_version_check" CHECK ("version" >= 1),
    CONSTRAINT "calendars_archive_check" CHECK (
      ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
      OR ("status" = 'ACTIVE' AND "archived_at" IS NULL)
    )
);

CREATE UNIQUE INDEX "calendars_id_organization_id_key"
  ON "calendar"."calendars" ("id", "organization_id");
CREATE INDEX "calendars_organization_id_owner_organization_membership_id_idx"
  ON "calendar"."calendars" ("organization_id", "owner_organization_membership_id");

ALTER TABLE "calendar"."calendars"
  ADD CONSTRAINT "calendars_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "org"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "calendar"."calendars"
  ADD CONSTRAINT "calendars_owner_organization_membership_id_fkey"
  FOREIGN KEY ("owner_organization_membership_id") REFERENCES "org"."organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- calendar.calendar_access_grants
-- ---------------------------------------------------------------------------

CREATE TABLE "calendar"."calendar_access_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "principal_kind" TEXT NOT NULL,
    "organization_membership_id" UUID,
    "team_id" UUID,
    "role" TEXT NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_by_organization_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_access_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calendar_access_grants_kind_check" CHECK ("principal_kind" IN ('USER', 'TEAM')),
    CONSTRAINT "calendar_access_grants_role_check" CHECK ("role" IN ('VIEWER', 'EDITOR')),
    CONSTRAINT "calendar_access_grants_xor_check" CHECK (
      ("principal_kind" = 'USER' AND "organization_membership_id" IS NOT NULL AND "team_id" IS NULL)
      OR ("principal_kind" = 'TEAM' AND "team_id" IS NOT NULL AND "organization_membership_id" IS NULL)
    )
);

CREATE INDEX "calendar_access_grants_calendar_id_idx"
  ON "calendar"."calendar_access_grants" ("calendar_id");
CREATE INDEX "calendar_access_grants_organization_membership_id_idx"
  ON "calendar"."calendar_access_grants" ("organization_membership_id");
CREATE INDEX "calendar_access_grants_team_id_idx"
  ON "calendar"."calendar_access_grants" ("team_id");

CREATE UNIQUE INDEX "calendar_access_grants_active_user_uidx"
  ON "calendar"."calendar_access_grants" ("calendar_id", "organization_membership_id")
  WHERE "revoked_at" IS NULL AND "organization_membership_id" IS NOT NULL;

CREATE UNIQUE INDEX "calendar_access_grants_active_team_uidx"
  ON "calendar"."calendar_access_grants" ("calendar_id", "team_id")
  WHERE "revoked_at" IS NULL AND "team_id" IS NOT NULL;

ALTER TABLE "calendar"."calendar_access_grants"
  ADD CONSTRAINT "calendar_access_grants_calendar_id_fkey"
  FOREIGN KEY ("calendar_id") REFERENCES "calendar"."calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "calendar"."calendar_access_grants"
  ADD CONSTRAINT "calendar_access_grants_organization_membership_id_fkey"
  FOREIGN KEY ("organization_membership_id") REFERENCES "org"."organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "calendar"."calendar_access_grants"
  ADD CONSTRAINT "calendar_access_grants_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "org"."teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "calendar"."calendar_access_grants"
  ADD CONSTRAINT "calendar_access_grants_created_by_organization_membership_id_fkey"
  FOREIGN KEY ("created_by_organization_membership_id") REFERENCES "org"."organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- calendar.calendar_events
-- ---------------------------------------------------------------------------

CREATE TABLE "calendar"."calendar_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "all_day" BOOLEAN NOT NULL DEFAULT FALSE,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "time_zone" TEXT,
    "all_day_start_date" DATE,
    "all_day_end_date" DATE,
    "linked_project_id" UUID,
    "reference_type" TEXT,
    "reference_id" UUID,
    "created_by_organization_membership_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calendar_events_kind_check" CHECK ("kind" IN ('MANUAL', 'REFERENCED')),
    CONSTRAINT "calendar_events_title_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "calendar_events_version_check" CHECK ("version" >= 1),
    CONSTRAINT "calendar_events_reference_type_check" CHECK (
      "reference_type" IS NULL OR "reference_type" IN ('TASK', 'MILESTONE', 'DELIVERABLE', 'GATE')
    ),
    CONSTRAINT "calendar_events_reference_shape_check" CHECK (
      ("kind" = 'MANUAL' AND "reference_type" IS NULL AND "reference_id" IS NULL)
      OR ("kind" = 'REFERENCED' AND "reference_type" IS NOT NULL AND "reference_id" IS NOT NULL)
    ),
    CONSTRAINT "calendar_events_time_shape_check" CHECK (
      (
        "all_day" = TRUE
        AND "all_day_start_date" IS NOT NULL
        AND "starts_at" IS NULL
        AND "ends_at" IS NULL
        AND "time_zone" IS NULL
        AND ("all_day_end_date" IS NULL OR "all_day_end_date" >= "all_day_start_date")
      )
      OR (
        "all_day" = FALSE
        AND "starts_at" IS NOT NULL
        AND "time_zone" IS NOT NULL
        AND length(trim("time_zone")) > 0
        AND "all_day_start_date" IS NULL
        AND "all_day_end_date" IS NULL
        AND ("ends_at" IS NULL OR "ends_at" >= "starts_at")
      )
    )
);

CREATE INDEX "calendar_events_calendar_id_starts_at_idx"
  ON "calendar"."calendar_events" ("calendar_id", "starts_at");
CREATE INDEX "calendar_events_calendar_id_all_day_start_date_idx"
  ON "calendar"."calendar_events" ("calendar_id", "all_day_start_date");
CREATE INDEX "calendar_events_organization_id_reference_type_reference_id_idx"
  ON "calendar"."calendar_events" ("organization_id", "reference_type", "reference_id");

ALTER TABLE "calendar"."calendar_events"
  ADD CONSTRAINT "calendar_events_calendar_id_fkey"
  FOREIGN KEY ("calendar_id") REFERENCES "calendar"."calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "calendar"."calendar_events"
  ADD CONSTRAINT "calendar_events_created_by_organization_membership_id_fkey"
  FOREIGN KEY ("created_by_organization_membership_id") REFERENCES "org"."organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Referenced Planning/Operations/Governance ids are NOT foreign keys.
-- Calendar must never cascade-delete or own those source rows.

-- ---------------------------------------------------------------------------
-- messaging.conversations
-- ---------------------------------------------------------------------------

CREATE TABLE "messaging"."conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "team_id" UUID,
    "participant_low_id" UUID,
    "participant_high_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversations_kind_check" CHECK ("kind" IN ('DIRECT', 'TEAM')),
    CONSTRAINT "conversations_version_check" CHECK ("version" >= 1),
    CONSTRAINT "conversations_shape_check" CHECK (
      (
        "kind" = 'DIRECT'
        AND "team_id" IS NULL
        AND "participant_low_id" IS NOT NULL
        AND "participant_high_id" IS NOT NULL
        AND "participant_low_id" < "participant_high_id"
      )
      OR (
        "kind" = 'TEAM'
        AND "team_id" IS NOT NULL
        AND "participant_low_id" IS NULL
        AND "participant_high_id" IS NULL
      )
    )
);

CREATE UNIQUE INDEX "conversations_id_organization_id_key"
  ON "messaging"."conversations" ("id", "organization_id");
CREATE UNIQUE INDEX "conversations_team_id_key"
  ON "messaging"."conversations" ("team_id");
CREATE UNIQUE INDEX "conversations_direct_pair_uidx"
  ON "messaging"."conversations" ("organization_id", "participant_low_id", "participant_high_id")
  WHERE "kind" = 'DIRECT';
CREATE INDEX "conversations_organization_id_kind_idx"
  ON "messaging"."conversations" ("organization_id", "kind");

ALTER TABLE "messaging"."conversations"
  ADD CONSTRAINT "conversations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "org"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "messaging"."conversations"
  ADD CONSTRAINT "conversations_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "org"."teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "messaging"."conversations"
  ADD CONSTRAINT "conversations_participant_low_id_fkey"
  FOREIGN KEY ("participant_low_id") REFERENCES "org"."organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "messaging"."conversations"
  ADD CONSTRAINT "conversations_participant_high_id_fkey"
  FOREIGN KEY ("participant_high_id") REFERENCES "org"."organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- messaging.messages
-- ---------------------------------------------------------------------------

CREATE TABLE "messaging"."messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "author_organization_membership_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "messages_body_check" CHECK (length(trim("body")) > 0),
    CONSTRAINT "messages_version_check" CHECK ("version" >= 1)
);

CREATE INDEX "messages_conversation_id_created_at_id_idx"
  ON "messaging"."messages" ("conversation_id", "created_at", "id");
CREATE INDEX "messages_organization_id_idx"
  ON "messaging"."messages" ("organization_id");

ALTER TABLE "messaging"."messages"
  ADD CONSTRAINT "messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "messaging"."conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "messaging"."messages"
  ADD CONSTRAINT "messages_author_organization_membership_id_fkey"
  FOREIGN KEY ("author_organization_membership_id") REFERENCES "org"."organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- messaging.message_read_states
-- ---------------------------------------------------------------------------

CREATE TABLE "messaging"."message_read_states" (
    "conversation_id" UUID NOT NULL,
    "organization_membership_id" UUID NOT NULL,
    "last_read_message_id" UUID,
    "last_read_created_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_read_states_pkey" PRIMARY KEY ("conversation_id", "organization_membership_id")
);

CREATE INDEX "message_read_states_organization_membership_id_idx"
  ON "messaging"."message_read_states" ("organization_membership_id");

ALTER TABLE "messaging"."message_read_states"
  ADD CONSTRAINT "message_read_states_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "messaging"."conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "messaging"."message_read_states"
  ADD CONSTRAINT "message_read_states_organization_membership_id_fkey"
  FOREIGN KEY ("organization_membership_id") REFERENCES "org"."organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "messaging"."message_read_states"
  ADD CONSTRAINT "message_read_states_last_read_message_id_fkey"
  FOREIGN KEY ("last_read_message_id") REFERENCES "messaging"."messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- same-tenant triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION calendar.assert_same_tenant_calendar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM org.organization_memberships m
    WHERE m.id = NEW.owner_organization_membership_id
      AND m.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Calendar owner Organization mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER calendars_same_tenant
  BEFORE INSERT OR UPDATE ON calendar.calendars
  FOR EACH ROW
  EXECUTE FUNCTION calendar.assert_same_tenant_calendar();

CREATE OR REPLACE FUNCTION calendar.assert_same_tenant_grant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  calendar_org UUID;
  subject_org UUID;
BEGIN
  SELECT c.organization_id INTO calendar_org
  FROM calendar.calendars c
  WHERE c.id = NEW.calendar_id;

  IF calendar_org IS NULL OR calendar_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Calendar grant Organization mismatch';
  END IF;

  IF NEW.organization_membership_id IS NOT NULL THEN
    SELECT m.organization_id INTO subject_org
    FROM org.organization_memberships m
    WHERE m.id = NEW.organization_membership_id;
    IF subject_org IS NULL OR subject_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'Calendar grant subject Organization mismatch';
    END IF;
  END IF;

  IF NEW.team_id IS NOT NULL THEN
    SELECT t.organization_id INTO subject_org
    FROM org.teams t
    WHERE t.id = NEW.team_id;
    IF subject_org IS NULL OR subject_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'Calendar grant Team Organization mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER calendar_access_grants_same_tenant
  BEFORE INSERT OR UPDATE ON calendar.calendar_access_grants
  FOR EACH ROW
  EXECUTE FUNCTION calendar.assert_same_tenant_grant();

CREATE OR REPLACE FUNCTION calendar.assert_same_tenant_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM calendar.calendars c
    WHERE c.id = NEW.calendar_id
      AND c.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Calendar event Organization mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER calendar_events_same_tenant
  BEFORE INSERT OR UPDATE ON calendar.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION calendar.assert_same_tenant_event();

CREATE OR REPLACE FUNCTION messaging.assert_same_tenant_conversation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  left_org UUID;
  right_org UUID;
  team_org UUID;
BEGIN
  IF NEW.kind = 'DIRECT' THEN
    SELECT m.organization_id INTO left_org
    FROM org.organization_memberships m
    WHERE m.id = NEW.participant_low_id;
    SELECT m.organization_id INTO right_org
    FROM org.organization_memberships m
    WHERE m.id = NEW.participant_high_id;
    IF left_org IS NULL OR right_org IS NULL
      OR left_org <> NEW.organization_id
      OR right_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'Direct conversation Organization mismatch';
    END IF;
  ELSE
    SELECT t.organization_id INTO team_org
    FROM org.teams t
    WHERE t.id = NEW.team_id;
    IF team_org IS NULL OR team_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'Team conversation Organization mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER conversations_same_tenant
  BEFORE INSERT OR UPDATE ON messaging.conversations
  FOR EACH ROW
  EXECUTE FUNCTION messaging.assert_same_tenant_conversation();

CREATE OR REPLACE FUNCTION messaging.assert_same_tenant_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM messaging.conversations c
    WHERE c.id = NEW.conversation_id
      AND c.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Message Organization mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM org.organization_memberships m
    WHERE m.id = NEW.author_organization_membership_id
      AND m.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Message author Organization mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_same_tenant
  BEFORE INSERT OR UPDATE ON messaging.messages
  FOR EACH ROW
  EXECUTE FUNCTION messaging.assert_same_tenant_message();

-- ---------------------------------------------------------------------------
-- privileges
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA calendar TO amber_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA calendar TO amber_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA calendar GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO amber_app;

GRANT USAGE ON SCHEMA messaging TO amber_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA messaging TO amber_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA messaging GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO amber_app;
