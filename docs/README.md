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

Milestone 0 Exit Gate is **PASS AT SPECIFICATION LEVEL**. Encode FACT/APPROVED only. No foundation-only waiver.

## Tree

- [architecture](./architecture/overview.md) — runtime, module boundaries, [ADR index](./architecture/decisions/README.md)
- [domain](./domain/domain-model.md) — model, state machines, glossary
- [security](./security/identity-authorization.md) — 0.2A, tenancy, baseline
- [api](./api/conventions.md) — REST `/api/v1`, OpenAPI 3.1, Problem Details
- [development](./development/local-setup.md) — local, tests, migrations
- [agentic](./agentic/context.md) — agent operating context, harness, loop, roles
- [ux](./ux/m2.10-final-ux-ui-audit.md) — product UX evidence (M2; M2.10 audit active)

## Product UX evidence (M2)

- [M2.6 — Governance Gates & Exceptions](./ux/m2.6-governance-gates-exceptions.md) — Figma frames, invariants, AuthZ/SoD; **PASS / COMPLETE** (PR #20 OPEN; do not merge; no backend)
- [M2.7 — Overview & Portfolio Health](./ux/m2.7-overview-portfolio-health.md) — Visão Geral + Portfolio derived/read-model UX (stacked on M2.6; **PASS / COMPLETE**; PR #22 OPEN; do not merge; no backend)
- [M2.8 — Activity Experience](./ux/m2.8-activity-experience.md) — Project Atividade read-only material timeline UX (stacked on M2.7; **PASS / COMPLETE**; PR #24 OPEN; do not merge; no backend; not chat / not Audit / not Messaging)
- [M2.9 — Prototype & State Coverage](./ux/m2.9-prototype-state-coverage.md) — Integrated prototype + state/AuthZ/a11y coverage across M2.1–M2.8 (stacked on M2.8 @ 762ab787…; PR [#26](https://github.com/Bruno2K/monolito-amber/pull/26) OPEN; **PASS / COMPLETE**; NAVIGATE 257 / zeros; transversal only; no backend; do not merge; RC2 technical `0758675d…`; Reviewer PASS RC2 tip `ee02fdf8…`; PR tip validated in the independent reviewer report attached to the PR)
- [M2.10 — Final UX/UI Audit & Exit Gate](./ux/m2.10-final-ux-ui-audit.md) — Adversarial audit of M2.1–M2.9 (stacked on M2.9 @ `3a3526fefb41095cc97a20c93a13c1d016f76ccf`; branch `m2.10-final-ux-ui-audit`; **ACTIVE / IN PROGRESS**; status **CORRECTION LOOP / IN REVIEW** — **NOT PASS**; phase 1 scaffold + inventory; Engineer Figma pass + PNGs follow-up; preserve 86 product frames / 257 NAVIGATE / all zeros; M2.10 documentary frames excluded from product metrics; no backend; do not merge #20/#22/#24/#26/this; M3 not started; PR tip validated in the independent reviewer report attached to the PR)

## Deferred after Platform Foundation (PF-1.0..1.7)

Gate Templates; Planning Gantt / critical path; Impact dashboard / Issue board / coordination timeline; BIM/IFC/BCF viewers; analytics; AI; Kubernetes; microservices; CQRS; event sourcing; Kafka; invented permissions; a second Gate bypass (`gate.override`); Next.js product pages for Documents, Coordination, Planning, or Governance (M2.6 Figma evidence is authorized — see above).
