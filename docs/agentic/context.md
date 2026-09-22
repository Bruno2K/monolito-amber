# Agentic context

You are working in `Bruno2K/monolito-amber`, the canonical Amber Modular Monolith. Do **not** write product history into `Bruno2K/amber` (landing only). Do **not** create another repository.

## Current slice

**PF-1.2 — Project Membership / Contextual RBAC** (Issue #7). Project-level authorization without weakening Organization/tenant boundaries. No product Document/Coordination/Planning/Gate pages.

**PF-1.1R — Identity & Authorization Reconciliation** is merged/DONE (`3ebb855a1adf955512609e02161d81a8e9bc3f4d`).  
**PF-1.1 — Identity & Organizations** is merged/DONE (`2e44d5622d635bc8b5bfb8fe595bb9f80982ba4a`).

## Encode only FACT / APPROVED

- Closed 0.2A catalog and Amber Role Templates
- Organization-owned RoleDefinitions are the only operational grants
- No `gate.override`; Formal Exception is the sole bypass
- Session-bound org; deny-by-default
- Organization membership ≠ project membership
- Client `organizationId` / `projectId` are routing hints
- MFA required for Organization Administrator and Governance Approver; privileged AuthZ **fail closed** until MFA is satisfied
- Registration is invitation/bootstrap-controlled (not public self-signup)
- Audit insert-only; `organization.read_audit` for reads
- File `scan_status` fail-closed; vendor OPEN

## Forbidden

Product workflows for Documents/Coordination/Planning/Gates; BIM/IFC/BCF; analytics; AI; K8s; microservices; CQRS; event sourcing; Kafka; invented permissions; second bypass; treating global templates as grants; implicit project access from org-level bindings.

Escalate HUMAN_REQUIRED on approved-spec conflict, HIGH architecture/security beyond contract, destructive ops, or a new product decision.
