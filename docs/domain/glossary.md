# Glossary

| Term | Meaning |
| --- | --- |
| Organization | Tenant |
| Project | Empreendimento — operational workspace under an Organization |
| Issue | Only coordination problem entity. *Pendência* is a synonym, not a second entity |
| Task | Planning work item. Task ≠ Issue |
| Gate | Governance checkpoint over mandatory requirements |
| Formal Exception | Sole approved bypass of an unsatisfied GateRequirement |
| Current revision | The operational base of a Document; change is explicit + audited |
| scan_status | PENDING / CLEAN / BLOCKED file-trust state |
| Active Organization | Server-bound session context; never taken from the client as authority |
| Amber Role Template | Product-owned baseline (`organizationId = null`); not an operational grant |
| Organization-owned RoleDefinition | Tenant-owned role instantiated from a template; the only assignable AuthZ target |
| ProjectMembership | First-class link from an Organization Membership to one Project |
| amber_app | Application DB role: INSERT+SELECT on audit, no UPDATE/DELETE |
