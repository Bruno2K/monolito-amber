# Amber documentation

Operating documentation for the **Modular Monolith** product repository `Bruno2K/monolito-amber`.

This is not the Product Vision landing (`Bruno2K/amber`).

`Bruno2K/monolito-amber` is **PUBLIC** by design (portfolio). No secrets or live credentials in git.

## Binding specifications

| Work item | Status | URL |
| --- | --- | --- |
| System Spec + Final Reconciliation | Authoritative hub | https://app.notion.com/p/3e2678e54c8d811ab279e72355d70204 |
| 0.1 Domain Model & Module Boundaries | APPROVED | https://app.notion.com/p/3e2678e54c8d81d0b005cefa8156b0b6 |
| 0.2 Identity, Tenancy & Authorization | APPROVED (amended by 0.2A) | https://app.notion.com/p/3e2678e54c8d81a4b99bca837516b5b8 |
| **0.2A** Identity / AuthZ baseline | **APPROVED BASELINE** | https://app.notion.com/p/3e3678e54c8d819fa690f4ade50c4e10 |
| 0.3 Revision / Document Lifecycle | APPROVED | https://app.notion.com/p/3e3678e54c8d81a48d34dad1b6b60fe1 |
| 0.4 Coordination Workflow | APPROVED | https://app.notion.com/p/3e3678e54c8d8125ab38eb359e0586c2 |
| **0.5** Planning, Gates & Exceptions | **APPROVED** | https://app.notion.com/p/3e3678e54c8d8134afbccdb1c1183ec3 |
| 0.6 Persistence, Files & Async | Architecture | https://app.notion.com/p/3e3678e54c8d81fb9d8cf5687a762093 |
| 0.7 API, Observability & Tests | Architecture | https://app.notion.com/p/3e3678e54c8d815388d4f0d50b8c70aa |
| 0.8 Architecture Baseline & Roadmap | Architecture | https://app.notion.com/p/3e3678e54c8d81ca9c77dd2ad5439b30 |
| **M3 Execution Pack** | **ACTIVE / LOCAL ONLY** | https://app.notion.com/p/3ec678e54c8d81c49efeccb527b3e2bd |
| **M3.1 Contract, Migration & Test-Data** | **ACTIVE (this WI)** | https://app.notion.com/p/3ec678e54c8d812d9f92d02f9f153568 |

Milestone 0 Exit Gate is **PASS AT SPECIFICATION LEVEL**. Encode FACT/APPROVED only. No foundation-only waiver.

## Tree

- [architecture](./architecture/overview.md) — runtime, module boundaries, [ADR index](./architecture/decisions/README.md)
- [domain](./domain/domain-model.md) — model, state machines, glossary
- [security](./security/identity-authorization.md) — 0.2A, tenancy, baseline
- [api](./api/conventions.md) — REST `/api/v1`, OpenAPI 3.1, Problem Details
- [development](./development/local-setup.md) — local, tests, migrations
- [agentic](./agentic/context.md) — agent operating context, harness, loop, roles
- [ux](./ux/m2.10-final-ux-ui-audit.md) — product UX evidence (M2 COMPLETE; Exit Gate PASS)
- [M3.1 Operations contract](./domain/m3-project-operations-contract.md) — ACTIVE / LOCAL ONLY

## Product UX evidence (M2)

- [M2.6 — Governance Gates & Exceptions](./ux/m2.6-governance-gates-exceptions.md) — **PASS / COMPLETE**, PR #20 MERGED as `23aeadee…`; no backend
- [M2.7 — Overview & Portfolio Health](./ux/m2.7-overview-portfolio-health.md) — **PASS / COMPLETE**, PR #22 MERGED as `58453e63…`; no backend
- [M2.8 — Activity Experience](./ux/m2.8-activity-experience.md) — **PASS / COMPLETE**, PR #24 MERGED as `130d9602…`; no backend; not chat / Audit / Messaging
- [M2.9 — Prototype & State Coverage](./ux/m2.9-prototype-state-coverage.md) — **PASS / COMPLETE**, PR #26 MERGED as `64223fa3…`; NAVIGATE 257 / structural zeros; no backend
- [M2.10 — Final UX/UI Audit & Exit Gate](./ux/m2.10-final-ux-ui-audit.md) — **PASS / COMPLETE**, PR #28 MERGED as `4e410b11…`; M2 Exit Gate PASS; R-01/R-02 CLEARED; F-04 OPTIONAL; 86 / 257 / zeros; **M2 COMPLETE / INTEGRATED**

## M3 — Project Operations (ACTIVE / LOCAL ONLY)

- [M3.1 contract](./domain/m3-project-operations-contract.md) — Issue [#30](https://github.com/Bruno2K/monolito-amber/issues/30)
- [M3.3 Phase & Discipline](./development/m3-migration-plan.md) — Issue [#33](https://github.com/Bruno2K/monolito-amber/issues/33); LOCAL ONLY; Exit Gate not claimed here
- [ADR-018](./architecture/decisions/ADR-018-operations-module-state-transitions.md) · [migration plan](./development/m3-migration-plan.md) · [OpenAPI plan](./api/m3-openapi-plan.md) · [route map](./architecture/m3-route-map.md) · [permission delta](./security/m3-permission-role-template-delta.md) · [seed design](./development/m3-seed-design.md) · [REQ matrix](./domain/m3.1-requirements-traceability.md) · [impact map](./architecture/m3-files-modules-impact-map.md)

## Deferred after Platform Foundation (PF-1.0..1.7)

Gate Templates; Planning Gantt / critical path; Impact dashboard / Issue board / coordination timeline; BIM/IFC/BCF viewers; analytics; AI; Kubernetes; microservices; CQRS; event sourcing; Kafka; invented permissions; a second Gate bypass (`gate.override`); Next.js product pages for Documents, Coordination, Planning, or Governance (M2.6 Figma evidence is authorized — see above). M3 product `/projects` routes are **planned** in M3.1 and implemented from M3.2 — not in this contract WI.
