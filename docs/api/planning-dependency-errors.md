# Planning dependency error contract (M4.4)

Deterministic problem+json for finish-to-start TaskDependency commands. HTTP `code` values stay on the closed Amber catalog (`PLANNING_STATE`, `TENANCY_DENIED`, `IDEMPOTENCY_REQUIRED`, `IDEMPOTENCY_CONFLICT`, `OPTIMISTIC_LOCK`). The optional `reason` field names the dependency rejection. `blockers[]` is present only for incomplete-predecessor start/complete.

Reserved problem keys (`type`, `title`, `status`, `detail`, `instance`, `correlationId`, `code`) are never overwritten by extras.

| Situation | HTTP | `code` | `reason` | Notes |
| --- | --- | --- | --- | --- |
| `type` present and ≠ `FINISH_TO_START` | 409 | `PLANNING_STATE` | `DEPENDENCY_KIND_UNSUPPORTED` | SS/FF/SF rejected |
| predecessor === successor | 409 | `PLANNING_STATE` | `DEPENDENCY_SELF` | |
| Unique pair already exists | 409 | `PLANNING_STATE` | `DEPENDENCY_DUPLICATE` | |
| Direct or transitive cycle | 409 | `PLANNING_STATE` | `DEPENDENCY_CYCLE` | Same-Project snapshot only |
| Unfinished pred on started/completed successor | 409 | `PLANNING_STATE` | `DEPENDENCY_RETROACTIVE` | IN_PROGRESS, BLOCKED, or DONE |
| Start or complete while any pred ≠ DONE | 409 | `PLANNING_STATE` | `DEPENDENCY_PREDECESSOR_INCOMPLETE` | `blockers[]` lists pred id/status/title/message. Not Task `BLOCKED`. |
| Extra date/status fields on dep body | 400 | `HTTP_EXCEPTION` | — | Nest `forbidNonWhitelisted`. Command never writes Task dates. |
| Missing / cross-Project / cross-Org / unknown id | 403 | `TENANCY_DENIED` | — | Omit-not-leak: no foreign title or confirming id |
| Missing `Idempotency-Key` on create/remove | 400 | `IDEMPOTENCY_REQUIRED` | — | |
| Key reused with a different body | 409 | `IDEMPOTENCY_CONFLICT` | — | |
| Stale `expectedVersion` on start/complete | 409 | `OPTIMISTIC_LOCK` | — | |
| VIEWER / no `task.update` | 403 | permission deny | — | Reads still use `project.read` |
| Archived Project mutation | 409 | `PLANNING_STATE` | — | Existing archived rule |

Example start blockage:

```json
{
  "code": "PLANNING_STATE",
  "reason": "DEPENDENCY_PREDECESSOR_INCOMPLETE",
  "detail": "Task cannot move to IN_PROGRESS or DONE while a finish-to-start prerequisite is not DONE",
  "blockers": [
    {
      "predecessorTaskId": "…",
      "status": "TODO",
      "title": "Survey",
      "message": "Predecessor is TODO, not DONE"
    }
  ]
}
```
