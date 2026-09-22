# Agentic context

You are working in `Bruno2K/monolito-amber`, the canonical Amber Modular Monolith. Do **not** write product history into `Bruno2K/amber` (landing only). Do **not** create another repository.

## Current slice

**PF-1.4 — Coordination / Impact Analysis Foundation** (Issue #11). Backend/domain Coordination consuming PF-1.3 outbox events. No Coordination UI.

**PF-1.3 — Documents & Revisions Foundation** is merged/DONE (`c4d9dffaad275f6419e5ff1fc8b732e690cfac3d`).  
**PF-1.2 — Project Membership / Contextual RBAC** is merged/DONE (`dee5861b84224f7ea46b4e8bd978c1548a91a71a`).  
**PF-1.1R — Identity & Authorization Reconciliation** is merged/DONE (`3ebb855a1adf955512609e02161d81a8e9bc3f4d`).  
**PF-1.1 — Identity & Organizations** is merged/DONE (`2e44d5622d635bc8b5bfb8fe595bb9f80982ba4a`).

## Encode only FACT / APPROVED

- Closed 0.2A catalog and Amber Role Templates
- Organization-owned RoleDefinitions are the only operational grants
- No `gate.override`; Formal Exception is the sole bypass
- Session-bound org; deny-by-default
- Organization membership ≠ project membership
- Client `organizationId` / `projectId` / `documentId` / `revisionId` / `impactId` / `issueId` are routing hints
- MFA required for Organization Administrator and Governance Approver; privileged AuthZ **fail closed** until MFA is satisfied
- Registration is invitation/bootstrap-controlled (not public self-signup)
- Audit insert-only; `organization.read_audit` for reads
- File `scan_status` fail-closed; vendor OPEN
- Published revision bytes + checksum are immutable
- Current revision is `Document.currentRevisionId` (CAS). No terminal SUPERSEDED status
- `CurrentRevisionChanged` creates exactly one Impact Analysis case (`PENDING_ANALYSIS`); never auto-IMPACTED or auto-Issues
- Assessment and Issue creation are explicit AuthZ + actor
- RESOLVED ≠ CLOSED; Severity ≠ Priority; discipline ≠ assignee

## Forbidden

Product workflows for Planning/Gates; BIM/IFC/BCF viewers; analytics; AI; K8s; microservices; CQRS; event sourcing; Kafka; invented permissions; second bypass; treating global templates as grants; implicit project access from org-level bindings; auto-IMPACTED / auto-Issues; mutating Document current revision from Coordination; Impact dashboard / Issue board / coordination timeline / product nav.

Escalate HUMAN_REQUIRED on approved-spec conflict, HIGH architecture/security beyond contract, destructive ops, or a new product decision.
