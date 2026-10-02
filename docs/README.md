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
| **M3 Execution Pack** | **ACTIVE / LOCAL ONLY** (M3.9 audit) | https://app.notion.com/p/3ec678e54c8d81c49efeccb527b3e2bd |
| **M3.1 Contract, Migration & Test-Data** | **MERGED** | https://app.notion.com/p/3ec678e54c8d812d9f92d02f9f153568 |
| **M3.8 Local RC pack** | **MERGED**; Bruno homologated LOCAL RC | https://app.notion.com/p/3ec678e54c8d8136be51cc5a7b7720a6 |
| **M3 Local RC Audit Corrections RC1** | **MERGED / homologated** | https://app.notion.com/p/3ec678e54c8d818e8c8fd4fc619059a8 |
| **M3.9 Final Product, Security & UX Audit** | **MERGED**; Exit Gate **FAIL — ACCEPTED** | https://app.notion.com/p/3ec678e54c8d81dab5fceda13242a69b |
| **M4 Execution Pack** | **ACTIVE / LOCAL ONLY** | https://app.notion.com/p/3ec678e54c8d812d9936e6291e8d07f7 |
| **M4.1 Contract, Baseline & Read-Model Plan** | **MERGED** | https://app.notion.com/p/3ec678e54c8d8103beafc69c3bb51edc |
| **M4.2 Planning Shell & Unified List** | **MERGED** | https://app.notion.com/p/3ec678e54c8d8155b715c1309a86627c |
| **M4.3 Task Operations & Inspector** | **IN FLIGHT** (LOCAL ONLY) | https://app.notion.com/p/3ec678e54c8d81299a9cd44035220532 |

Milestone 0 Exit Gate is **PASS AT SPECIFICATION LEVEL**. Encode FACT/APPROVED only. No foundation-only waiver.

## Tree

- [architecture](./architecture/overview.md) — runtime, module boundaries, [ADR index](./architecture/decisions/README.md)
- [domain](./domain/domain-model.md) — model, state machines, glossary
- [security](./security/identity-authorization.md) — 0.2A, tenancy, baseline
- [api](./api/conventions.md) — REST `/api/v1`, OpenAPI 3.1, Problem Details
- [development](./development/local-setup.md) — local, tests, migrations, [M3.8 runbook](./development/m3.8-local-rc-runbook.md), [Windows path](./development/m3-windows-local-rc.md), [RC1 evidence](./development/m3-rc1-evidence/INDEX.md), [M3.9 evidence](./development/m3.9-evidence/INDEX.md)
- [agentic](./agentic/context.md) — agent operating context, harness, loop, roles
- [ux](./ux/m2.10-final-ux-ui-audit.md) — product UX evidence (M2 COMPLETE; Exit Gate PASS)
- [M3.1 Operations contract](./domain/m3-project-operations-contract.md) — MERGED / LOCAL ONLY
- [M4.1 Planning contract](./domain/m4-planning-scheduling-contract.md) — MERGED / LOCAL ONLY
- [M4.2 Planning List](./domain/m4.2-requirement-to-change-plan.md) — IN FLIGHT / LOCAL ONLY

## Product UX evidence (M2)

- [M2.6 — Governance Gates & Exceptions](./ux/m2.6-governance-gates-exceptions.md) — **PASS / COMPLETE**, PR #20 MERGED as `23aeadee…`; no backend
- [M2.7 — Overview & Portfolio Health](./ux/m2.7-overview-portfolio-health.md) — **PASS / COMPLETE**, PR #22 MERGED as `58453e63…`; no backend
- [M2.8 — Activity Experience](./ux/m2.8-activity-experience.md) — **PASS / COMPLETE**, PR #24 MERGED as `130d9602…`; no backend; not chat / Audit / Messaging
- [M2.9 — Prototype & State Coverage](./ux/m2.9-prototype-state-coverage.md) — **PASS / COMPLETE**, PR #26 MERGED as `64223fa3…`; NAVIGATE 257 / structural zeros; no backend
- [M2.10 — Final UX/UI Audit & Exit Gate](./ux/m2.10-final-ux-ui-audit.md) — **PASS / COMPLETE**, PR #28 MERGED as `4e410b11…`; M2 Exit Gate PASS; R-01/R-02 CLEARED; F-04 OPTIONAL; 86 / 257 / zeros; **M2 COMPLETE / INTEGRATED**

## M4 — Planning & Scheduling (ACTIVE / LOCAL ONLY)

- [M4.1 requirement-to-change plan](./domain/m4.1-requirement-to-change-plan.md) — Issue [#54](https://github.com/Bruno2K/monolito-amber/issues/54); published first
- [M4 Planning & Scheduling contract](./domain/m4-planning-scheduling-contract.md) — lifecycle, deps, read-model, AuthZ, audit/CAS
- [M4.1 baseline inventory](./domain/m4.1-baseline-inventory.md) · [gap analysis](./domain/m4.1-gap-analysis.md)
- [M4.1 migration/seed/rollback plan](./domain/m4.1-migration-seed-rollback-plan.md) — plan only; no applied DDL
- [M4.1 Figma → route map](./domain/m4.1-figma-route-map.md) — documentary
- [M4.1 test strategy](./domain/m4.1-test-strategy.md) · [R14 no-feature-code](./domain/m4.1-no-feature-code-evidence.md)
- [M4.1 matrix](./domain/m4.1-requirements-traceability.md) — 14 ATENDIDO (docs-only WI)
- [M4.2 requirement-to-change plan](./domain/m4.2-requirement-to-change-plan.md) — Issue [#56](https://github.com/Bruno2K/monolito-amber/issues/56); MERGED
- [M4.2 matrix](./domain/m4.2-requirements-traceability.md) · [Figma trace](./domain/m4.2-figma-trace.md) · [UI evidence](./ux/evidence/m4.2/)
- [M4.3 requirement-to-change plan](./domain/m4.3-requirement-to-change-plan.md) — Issue [#58](https://github.com/Bruno2K/monolito-amber/issues/58); published first
- [M4.3 matrix](./domain/m4.3-requirements-traceability.md) · [Figma trace](./domain/m4.3-figma-trace.md) · [UI evidence](./ux/evidence/m4.3/)
- [M4.5 matrix](./domain/m4.5-requirements-traceability.md) · [Figma trace](./domain/m4.5-figma-trace.md) · [UI evidence](./ux/evidence/m4.5/)
- [M4.6 requirement-to-change plan](./domain/m4.6-requirement-to-change-plan.md) — Issue [#64](https://github.com/Bruno2K/monolito-amber/issues/64); published first
- [M4.6 matrix](./domain/m4.6-requirements-traceability.md) · [Figma trace](./domain/m4.6-figma-trace.md) · [UI evidence](./ux/evidence/m4.6/)
- [M4.7 requirement-to-change plan](./domain/m4.7-requirement-to-change-plan.md) — Issue [#66](https://github.com/Bruno2K/monolito-amber/issues/66); published first
- M3 Exit Gate **FAIL — ACCEPTED** remains accepted debt. **Not M3 COMPLETE.** M4.8–M4.9 remain LOCKED.

## M3 — Project Operations (Exit Gate FAIL — ACCEPTED / LOCAL ONLY)

- [M3.1 contract](./domain/m3-project-operations-contract.md) — Issue [#30](https://github.com/Bruno2K/monolito-amber/issues/30)
- [M3.2 shell traceability](./domain/m3.2-requirements-traceability.md) — Issue [#32](https://github.com/Bruno2K/monolito-amber/issues/32)
- [M3.8 Local RC pack](./development/m3.8-local-rc-runbook.md) — Issue [#44](https://github.com/Bruno2K/monolito-amber/issues/44) merged; Bruno homologated LOCAL RC on `61042767…`
- [RC1 audit corrections](./development/m3-rc1-evidence/INDEX.md) — Issue [#46](https://github.com/Bruno2K/monolito-amber/issues/46) / PR [#47](https://github.com/Bruno2K/monolito-amber/pull/47) MERGED
- [M3.9 matrix](./domain/m3.9-requirements-traceability.md) — Issue [#50](https://github.com/Bruno2K/monolito-amber/issues/50); Engineer recommendation only
- [M3.9 evidence](./development/m3.9-evidence/INDEX.md)
- [M3.8 REQ map](./domain/m3.8-requirements-traceability.md)
- [M3.3 Phase & Discipline](./development/m3-migration-plan.md) — Issue [#33](https://github.com/Bruno2K/monolito-amber/issues/33); LOCAL ONLY; Exit Gate not claimed here
- [ADR-018](./architecture/decisions/ADR-018-operations-module-state-transitions.md) · [migration plan](./development/m3-migration-plan.md) · [OpenAPI plan](./api/m3-openapi-plan.md) · [route map](./architecture/m3-route-map.md) · [permission delta](./security/m3-permission-role-template-delta.md) · [seed design](./development/m3-seed-design.md) · [REQ matrix](./domain/m3.1-requirements-traceability.md) · [impact map](./architecture/m3-files-modules-impact-map.md)

## Deferred after Platform Foundation (PF-1.0..1.7)

Gate Templates; Planning critical path (M4 Gantt is contracted, not implemented here); Impact dashboard / Issue board / coordination timeline; BIM/IFC/BCF viewers; analytics; AI; Kubernetes; microservices; CQRS; event sourcing; Kafka; invented permissions; a second Gate bypass (`gate.override`); Next.js product pages for Documents, Coordination, Planning, or Governance (M2.6 Figma evidence is authorized — see above). M3 product `/projects` routes are **planned** in M3.1 and implemented from M3.2 — not in this contract WI.
