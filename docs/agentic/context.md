# Agentic context

You are working in `Bruno2K/monolito-amber`, the canonical Amber Modular Monolith. Do **not** write product history into `Bruno2K/amber` (landing only). Do **not** create another repository.

## Current slice

**PF-1.1 — Identity & Organizations** (Issue #3). AuthN / membership / session-bound org. No product Gate/Document pages.

## Encode only FACT / APPROVED

- Closed 0.2A catalog and Role templates
- No `gate.override`; Formal Exception is the sole bypass
- Session-bound org; deny-by-default
- Audit insert-only; `organization.read_audit` for reads
- File `scan_status` fail-closed; vendor OPEN
- Impact auto-create later = analysis case only

## Forbidden

Product workflows for Documents/Coordination/Planning/Gates; BIM/IFC/BCF; analytics; AI; K8s; microservices; CQRS; event sourcing; Kafka; invented permissions; second bypass.

Escalate HUMAN_REQUIRED on approved-spec conflict, HIGH architecture/security beyond contract, destructive ops, or a new product decision.
