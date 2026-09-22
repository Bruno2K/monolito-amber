# Agentic context

You are working in `Bruno2K/monolito-amber`, the canonical Amber Modular Monolith. Do **not** write product history into `Bruno2K/amber` (landing only). Do **not** create another repository.

## Current slice

**PF-1.1R — Identity & Authorization Reconciliation** (Issue #5). Localized Identity/AuthZ repairs after PF-1.1. No Project Membership, no product Gate/Document pages.

**PF-1.1 — Identity & Organizations** is merged/DONE (`2e44d5622d635bc8b5bfb8fe595bb9f80982ba4a`).  
**PF-1.2 — Projects & Membership** is **blocked** until PF-1.1R is DONE and the Governor authorizes the next slice.

## Encode only FACT / APPROVED

- Closed 0.2A catalog and Role templates
- No `gate.override`; Formal Exception is the sole bypass
- Session-bound org; deny-by-default
- MFA required for Organization Administrator and Governance Approver; privileged AuthZ **fail closed** until MFA is satisfied
- Registration is invitation/bootstrap-controlled (not public self-signup)
- Audit insert-only; `organization.read_audit` for reads
- File `scan_status` fail-closed; vendor OPEN
- Impact auto-create later = analysis case only

## Forbidden

Product workflows for Documents/Coordination/Planning/Gates; BIM/IFC/BCF; analytics; AI; K8s; microservices; CQRS; event sourcing; Kafka; invented permissions; second bypass; Project Membership / project RBAC redesign (PF-1.2).

Escalate HUMAN_REQUIRED on approved-spec conflict, HIGH architecture/security beyond contract, destructive ops, or a new product decision.
