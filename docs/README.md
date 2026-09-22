# Amber documentation

Operating documentation for the **Modular Monolith** product repository `Bruno2K/monolito-amber`.

This is not the Product Vision landing (`Bruno2K/amber`).

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

## Out of scope for PF-1.3

Coordination/Planning/Gates/Exception workflows and UI; BIM/IFC/BCF viewers; analytics; AI; Kubernetes; microservices; CQRS; event sourcing; Kafka; invented permissions; a second Gate bypass; final Documents UX.
