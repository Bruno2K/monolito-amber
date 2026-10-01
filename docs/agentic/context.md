# Agentic context

You are working in `Bruno2K/monolito-amber`, the canonical Amber Modular Monolith — the **real product**. Do **not** write product history into `Bruno2K/amber` (landing only). Do **not** create another repository.

This repository is **PUBLIC** by design (portfolio). No secrets, credentials, or production connection strings belong in git. Hygiene: `.env.example` only; never commit tokens, private keys, or live credentials.

## Current slice

**M2.8 — Activity Experience** (Issue #23). Figma product UX + docs/evidence only. Leave PR **OPEN** (do not merge).

**Stacked on M2.7** branch `m2.7-overview-portfolio-health` @ `85852e6`. **M2.7 and M2.6 are COMPLETE/PASS; PRs #22 and #20 remain OPEN** — do not wait for merge; do not base on `main`.

Platform Foundation **PF-1.0..1.7 is DONE on main** (`49588c3cc9ec0f6b43be5c35f1e2712d09522d17`).

**PF-1.6 — Governance / Gates / Formal Exceptions** domain is merged/DONE (`887d598ef69eb6898e445810863511e291cbee49`).  
**PF-1.5 — Planning / Tasks / Milestones** is merged/DONE (`d6c64703325a71c7cc240a7b60d5516d93ac2b8f`).  
**PF-1.4 — Coordination / Impact Analysis Foundation** is merged/DONE (`404cfc5bdc9961f79392010bb012ba8f2b1a002a`).  
**PF-1.3 — Documents & Revisions Foundation** is merged/DONE (`c4d9dffaad275f6419e5ff1fc8b732e690cfac3d`).  
**PF-1.2 — Project Membership / Contextual RBAC** is merged/DONE (`dee5861b84224f7ea46b4e8bd978c1548a91a71a`).  
**PF-1.1R — Identity & Authorization Reconciliation** is merged/DONE (`3ebb855a1adf955512609e02161d81a8e9bc3f4d`).  
**PF-1.1 — Identity & Organizations** is merged/DONE (`2e44d5622d635bc8b5bfb8fe595bb9f80982ba4a`).  
**PF-1.0 — Platform Foundation Bootstrap** is merged/DONE (`31ed0a58f3f9c156596e5f048d83e8f7f7455ce0`).

## Encode only FACT / APPROVED

- Closed 0.2A catalog and Amber Role Templates
- Organization-owned RoleDefinitions are the only operational grants
- No `gate.override`; Formal Exception is the sole bypass
- Session-bound org; deny-by-default
- Organization membership ≠ project membership
- Client routing ids are hints only
- MFA required for Organization Administrator and Governance Approver; privileged AuthZ **fail closed** until MFA is satisfied
- Registration is invitation/bootstrap-controlled (not public self-signup)
- Audit insert-only; `organization.read_audit` for reads
- File `scan_status` fail-closed; vendor OPEN
- Published revision bytes + checksum are immutable
- Current revision is `Document.currentRevisionId` (CAS). No terminal SUPERSEDED status
- `CurrentRevisionChanged` creates exactly one Impact Analysis case (`PENDING_ANALYSIS`); never auto-IMPACTED or auto-Issues
- Assessment and Issue creation are explicit AuthZ + actor
- RESOLVED ≠ CLOSED; Severity ≠ Priority; discipline ≠ assignee
- Task ≠ Issue; Task done ≠ Issue resolve ≠ Milestone achieve
- Task lateness and Milestone AT_RISK/MISSED are derived (ADR-016); ACHIEVED is explicit
- READY ≠ RELEASED; Formal Exception is the sole bypass and does not satisfy a requirement
- RELEASED ≠ RELEASED_WITH_EXCEPTION; Exception is requirement-specific
- Governance reads Documents/Coordination/Planning via adapters and does not mutate upstream
- **M2.6** delivers Governance Gates & Exceptions **product UX in Figma** + evidence docs (COMPLETE/PASS; PR #20 OPEN; no backend)
- **M2.7** delivers Visão Geral + Portfolio Health as **derived/read-model** UX in Figma + evidence docs (COMPLETE/PASS; PR #22 OPEN; stacked on M2.6; no backend; no health SoT; actor-visible portfolio only)
- **M2.8** delivers Project **Atividade** as **read-only material operational timeline** UX in Figma + evidence docs (stacked on M2.7; not chat; Messaging/Calendar private excluded; not Audit backdoor; project.read + per-item AuthZ)

## Forbidden (future phase — not activated)

Gate Templates builder; BIM/IFC/BCF viewers; analytics warehouse; AI; K8s; microservices; CQRS; event sourcing; Kafka; invented permissions; second bypass (`gate.override` / forceRelease); treating global templates as grants; implicit project access from org-level bindings; auto-IMPACTED / auto-Issues; auto-resolving Issues from Tasks; auto-achieving Milestones; auto-releasing Gates; mutating Document/Issue/Task/Milestone from Governance; **manual health status SoT**; **org-wide portfolio leak**; dashboard builder / user-configured widgets; Messaging as health source; **Activity-as-chat**; **Messaging/Calendar private content in Activity**; **Audit-only dump into Activity**; Activity as Audit or Messaging backdoor.

Also deferred (HUMAN_ACTIVATION_REQUIRED unless Governor activates): notifications worker, Redis/BullMQ jobs, PaaS vendor, malware vendor, LGPD process, RPO/RTO, Audit read UX productization, Next.js Activity app pages implementation, activity event store productization.

Escalate HUMAN_REQUIRED on approved-spec conflict, HIGH architecture/security beyond contract, destructive ops, a new product decision, or any request to expand M2.8 into backend/schema/event store/Audit UX/Messaging.
