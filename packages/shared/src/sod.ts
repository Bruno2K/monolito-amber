import { SodViolationError } from "./errors.js";

/**
 * Resource-level SoD from APPROVED 0.2A §3.
 * Multiple roles may be assigned; protected operations evaluate actor history.
 */

export function assertRevisionApprovalSoD(input: {
  actorUserId: string;
  publishedByUserId: string;
}): void {
  if (input.actorUserId === input.publishedByUserId) {
    throw new SodViolationError("A user must not approve or reject a Revision they published");
  }
}

export function assertRevisionMakeCurrentSoD(input: {
  actorUserId: string;
  publishedByUserId: string;
  revisionStatus: string;
}): void {
  if (input.revisionStatus !== "APPROVED") {
    throw new SodViolationError("revision.make_current requires an APPROVED Revision");
  }
  if (input.actorUserId === input.publishedByUserId) {
    throw new SodViolationError(
      "The user making a Revision current cannot be the original publisher (two human actors required)",
    );
  }
}

export function assertExceptionDecisionSoD(input: {
  actorUserId: string;
  requestedByUserId: string;
}): void {
  if (input.actorUserId === input.requestedByUserId) {
    throw new SodViolationError("A user must not approve or reject their own Formal Exception request");
  }
}

export function assertExceptionReleaseSoD(input: {
  releaserUserId: string;
  requestedByUserId: string;
}): void {
  if (input.releaserUserId === input.requestedByUserId) {
    throw new SodViolationError(
      "A user who requested a Formal Exception must not release the Gate using that Exception",
    );
  }
}

export function assertRoleManagementSoD(input: {
  actorUserId: string;
  targetUserId: string;
  actorHoldsOrgAdmin: boolean;
  grantsOutsideExistingAuthority: boolean;
}): void {
  if (
    input.actorUserId === input.targetUserId &&
    input.grantsOutsideExistingAuthority &&
    !input.actorHoldsOrgAdmin
  ) {
    throw new SodViolationError(
      "A user must not use project-level role assignment to self-grant permissions outside existing administrative authority",
    );
  }
}
