-- PF-1.3: Document + Revision lifecycle on the existing document schema.
-- Additive only. Currentness is documents.current_revision_id (CAS via version).
-- No SUPERSEDED status. No Impact / Issue / Gate tables.

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

CREATE TABLE "document"."documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "discipline_id" TEXT,
    "document_type" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "current_revision_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documents_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED')),
    CONSTRAINT "documents_version_check" CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX "documents_project_id_code_key" ON "document"."documents"("project_id", "code");
CREATE UNIQUE INDEX "documents_current_revision_id_key" ON "document"."documents"("current_revision_id");
CREATE INDEX "documents_organization_id_project_id_idx" ON "document"."documents"("organization_id", "project_id");

ALTER TABLE "document"."documents"
  ADD CONSTRAINT "documents_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- revisions
-- ---------------------------------------------------------------------------

CREATE TABLE "document"."revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "revision_code" TEXT NOT NULL,
    "stored_object_id" UUID,
    "file_name" TEXT,
    "published_checksum_sha256" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by_user_id" UUID NOT NULL,
    "published_by_user_id" UUID,
    "published_at" TIMESTAMP(3),
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMP(3),
    "rejected_by_user_id" UUID,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "revisions_status_check" CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
    CONSTRAINT "revisions_rejected_reason_check" CHECK (
      ("status" <> 'REJECTED') OR ("rejection_reason" IS NOT NULL AND length(trim("rejection_reason")) > 0)
    )
);

CREATE UNIQUE INDEX "revisions_document_id_revision_code_key" ON "document"."revisions"("document_id", "revision_code");
CREATE UNIQUE INDEX "revisions_stored_object_id_key" ON "document"."revisions"("stored_object_id");
CREATE INDEX "revisions_organization_id_project_id_idx" ON "document"."revisions"("organization_id", "project_id");
CREATE INDEX "revisions_document_id_status_idx" ON "document"."revisions"("document_id", "status");

ALTER TABLE "document"."revisions"
  ADD CONSTRAINT "revisions_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "document"."documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document"."documents"
  ADD CONSTRAINT "documents_current_revision_id_fkey"
  FOREIGN KEY ("current_revision_id") REFERENCES "document"."revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- stored_objects — tenant document binding + unique key
-- ---------------------------------------------------------------------------

ALTER TABLE "document"."stored_objects"
  ADD COLUMN "document_id" UUID,
  ADD COLUMN "original_file_name" TEXT;

ALTER TABLE "document"."stored_objects"
  ADD CONSTRAINT "stored_objects_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "document"."documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document"."stored_objects"
  ADD CONSTRAINT "stored_objects_storage_key_key" UNIQUE ("storage_key");

CREATE INDEX "stored_objects_checksum_sha256_idx" ON "document"."stored_objects"("checksum_sha256");

ALTER TABLE "document"."revisions"
  ADD CONSTRAINT "revisions_stored_object_id_fkey"
  FOREIGN KEY ("stored_object_id") REFERENCES "document"."stored_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- same-tenant binding for documents / revisions / current pointer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION document.assert_same_tenant_document()
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
    RAISE EXCEPTION 'Document project/organization mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER documents_same_tenant
  BEFORE INSERT OR UPDATE ON document.documents
  FOR EACH ROW
  EXECUTE FUNCTION document.assert_same_tenant_document();

CREATE OR REPLACE FUNCTION document.assert_same_tenant_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  doc record;
BEGIN
  SELECT organization_id, project_id INTO doc
  FROM document.documents
  WHERE id = NEW.document_id;
  IF doc IS NULL THEN
    RAISE EXCEPTION 'Revision document not found';
  END IF;
  IF doc.organization_id <> NEW.organization_id OR doc.project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'Revision tenant binding does not match Document';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER revisions_same_tenant
  BEFORE INSERT OR UPDATE ON document.revisions
  FOR EACH ROW
  EXECUTE FUNCTION document.assert_same_tenant_revision();

CREATE OR REPLACE FUNCTION document.assert_current_revision_approved()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rev record;
BEGIN
  IF NEW.current_revision_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT id, document_id, status, organization_id, project_id INTO rev
  FROM document.revisions
  WHERE id = NEW.current_revision_id;
  IF rev IS NULL THEN
    RAISE EXCEPTION 'current_revision_id does not exist';
  END IF;
  IF rev.document_id <> NEW.id THEN
    RAISE EXCEPTION 'current_revision_id must belong to the Document';
  END IF;
  IF rev.organization_id <> NEW.organization_id OR rev.project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'current_revision_id tenant mismatch';
  END IF;
  IF rev.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Only an APPROVED Revision may become current';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER documents_current_must_be_approved
  BEFORE INSERT OR UPDATE OF current_revision_id ON document.documents
  FOR EACH ROW
  EXECUTE FUNCTION document.assert_current_revision_approved();

-- ---------------------------------------------------------------------------
-- published revision + stored object immutability
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION document.prevent_published_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'DRAFT' THEN
    IF NEW.revision_code IS DISTINCT FROM OLD.revision_code
       OR NEW.stored_object_id IS DISTINCT FROM OLD.stored_object_id
       OR NEW.file_name IS DISTINCT FROM OLD.file_name
       OR NEW.published_checksum_sha256 IS DISTINCT FROM OLD.published_checksum_sha256
       OR NEW.published_by_user_id IS DISTINCT FROM OLD.published_by_user_id
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.document_id IS DISTINCT FROM OLD.document_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      RAISE EXCEPTION 'Published revision content is immutable';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'PUBLISHED' AND NEW.status = 'UNDER_REVIEW')
        OR (OLD.status = 'UNDER_REVIEW' AND NEW.status IN ('APPROVED', 'REJECTED'))
      ) THEN
        RAISE EXCEPTION 'Illegal revision status transition from % to %', OLD.status, NEW.status;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER revisions_published_immutable
  BEFORE UPDATE ON document.revisions
  FOR EACH ROW
  EXECUTE FUNCTION document.prevent_published_revision_mutation();

CREATE OR REPLACE FUNCTION document.prevent_published_object_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM document.revisions r
    WHERE r.stored_object_id = NEW.id
      AND r.status <> 'DRAFT'
  ) THEN
    IF NEW.storage_key IS DISTINCT FROM OLD.storage_key
       OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
       OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
       OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      RAISE EXCEPTION 'Published stored object bytes/checksum are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stored_objects_published_immutable
  BEFORE UPDATE ON document.stored_objects
  FOR EACH ROW
  EXECUTE FUNCTION document.prevent_published_object_mutation();

-- Existing DEFAULT PRIVILEGES on document schema already cover new tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE document.documents TO amber_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE document.revisions TO amber_app;
