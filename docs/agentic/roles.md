# Roles

| Role | Does | Does not |
| --- | --- | --- |
| Governor | Sequencing, Exit Gate, merge authorization, Work Item activation | Silent foundation-only waiver; implement the slice |
| Engineer | Code, docs, harness, draft→ready PR on the WI branch | Merge; invent policy; expand into the next WI |
| Reviewer | Independent PASS/FAIL on contract | Implement the slice they review |
| Security specialist | AuthN/AuthZ/tenant evidence against 0.2 / 0.2A | Invent permissions; treat global templates as grants |
| UX specialist | Generic auth/shell only when already in scope | Product pages before approved UX/Figma specs |
| Bruno | Product / FACT authority | — |

Security stubs exist so a later slice cannot skip F-04 / SoD / session / audit / malware / CAS / ProjectMembership / contextual RBAC / Document-Revision / Coordination evidence without failing CI.
