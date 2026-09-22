-- PF-1.1 Identity & Organizations (additive split + MFA/session/invite FKs).
-- User remains the global business identity. AuthenticationIdentity owns EMAIL_PASSWORD.

-- CreateTable
CREATE TABLE "identity"."authentication_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authentication_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "authentication_identities_provider_identifier_key" ON "identity"."authentication_identities"("provider", "identifier");

-- CreateIndex
CREATE INDEX "authentication_identities_user_id_idx" ON "identity"."authentication_identities"("user_id");

-- AddForeignKey
ALTER TABLE "identity"."authentication_identities" ADD CONSTRAINT "authentication_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PasswordCredential moves from User to AuthenticationIdentity (no production rows in PF-1.0 seed).
ALTER TABLE "identity"."password_credentials" DROP CONSTRAINT "password_credentials_user_id_fkey";
DROP INDEX "identity"."password_credentials_user_id_key";
ALTER TABLE "identity"."password_credentials" DROP COLUMN "user_id";
ALTER TABLE "identity"."password_credentials" ADD COLUMN "authentication_identity_id" UUID NOT NULL;
CREATE UNIQUE INDEX "password_credentials_authentication_identity_id_key" ON "identity"."password_credentials"("authentication_identity_id");
ALTER TABLE "identity"."password_credentials" ADD CONSTRAINT "password_credentials_authentication_identity_id_fkey" FOREIGN KEY ("authentication_identity_id") REFERENCES "identity"."authentication_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Session security metadata + identity provenance
ALTER TABLE "identity"."sessions" ADD COLUMN "authentication_identity_id" UUID;
ALTER TABLE "identity"."sessions" ADD COLUMN "ip_address" TEXT;
ALTER TABLE "identity"."sessions" ADD COLUMN "user_agent" TEXT;
ALTER TABLE "identity"."sessions" ADD COLUMN "last_reauth_at" TIMESTAMP(3);
CREATE INDEX "sessions_active_organization_id_idx" ON "identity"."sessions"("active_organization_id");
ALTER TABLE "identity"."sessions" ADD CONSTRAINT "sessions_authentication_identity_id_fkey" FOREIGN KEY ("authentication_identity_id") REFERENCES "identity"."authentication_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invitation → Organization + accept/reinvite metadata
ALTER TABLE "identity"."invitations" ADD COLUMN "accepted_by_id" UUID;
ALTER TABLE "identity"."invitations" ADD COLUMN "role_template_key" TEXT;
ALTER TABLE "identity"."invitations" ADD COLUMN "membership_type" TEXT NOT NULL DEFAULT 'INTERNAL';
CREATE INDEX "invitations_organization_id_email_idx" ON "identity"."invitations"("organization_id", "email");
CREATE UNIQUE INDEX invitations_pending_org_email
  ON identity.invitations (organization_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
ALTER TABLE "identity"."invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "org"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "identity"."invitations" ADD CONSTRAINT "invitations_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Password reset → User
ALTER TABLE "identity"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MFA TOTP secret must be recoverable; hash remains integrity-only
ALTER TABLE "identity"."mfa_totp_credentials" ADD COLUMN "secret_encrypted" TEXT;
ALTER TABLE "identity"."mfa_totp_credentials" ALTER COLUMN "secret_encrypted" SET NOT NULL;
ALTER TABLE "identity"."mfa_totp_credentials" ADD CONSTRAINT "mfa_totp_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "identity"."mfa_recovery_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mfa_recovery_codes_user_id_batch_id_idx" ON "identity"."mfa_recovery_codes"("user_id", "batch_id");
ALTER TABLE "identity"."mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "identity"."mfa_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mfa_challenges_token_hash_key" ON "identity"."mfa_challenges"("token_hash");
CREATE INDEX "mfa_challenges_user_id_purpose_idx" ON "identity"."mfa_challenges"("user_id", "purpose");
ALTER TABLE "identity"."mfa_challenges" ADD CONSTRAINT "mfa_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Unbound security events (login before an org exists) may omit organization_id
ALTER TABLE "audit"."audit_events" ALTER COLUMN "organization_id" DROP NOT NULL;
