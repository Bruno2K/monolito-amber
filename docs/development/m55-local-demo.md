# M5.5 local demo dataset

Fictional portfolio for a local product demonstration. It is written only when `AMBER_SEED_M3=1` and the process is not production (`NODE_ENV` or `AMBER_ENV` equal to `production` refuses the seed). It does not run as part of the catalog-only seed and it does not add production accounts.

## Reset

From a disposable local database:

```bash
pnpm exec prisma migrate reset --force --skip-seed
pnpm prisma:migrate
AMBER_SEED_M3=1 pnpm prisma:seed
```

Running the seed again is idempotent. Drop, migrate, and seed again reproduce the same ids. Existing Alpha/Beta fixture ids used by tests stay unchanged.

The shared local password for seeded accounts is the existing development password `correct-horse-12`. Emails use `@amber.test` only.

## Personas

| Persona | Email | Organization | What to show |
| --- | --- | --- | --- |
| Seed Coordinator A | `coordinator.a@amber.test` | Amber Demo Alpha | Inbox, hospital project, calendars |
| Helena Admin | `admin.a@amber.test` | Amber Demo Alpha | Organization administrator |
| Caio BIM | `bim.a@amber.test` | Amber Demo Alpha | BIM coordination, unread direct message |
| Lia Arquitetura | `architect.a@amber.test` | Amber Demo Alpha | Architecture model and team chat |
| Rui Estruturas | `structural.a@amber.test` | Amber Demo Alpha | Blocked structural work |
| Nara Instalações | `mep.a@amber.test` | Amber Demo Alpha | MEP package |
| Oto Obra | `contractor.a@amber.test` | Amber Demo Alpha | External contributor, archived Obra team |
| Seed Viewer A | `viewer.a@amber.test` | Amber Demo Alpha | Read-only project access |
| Seed External Collaborator A | `external.a@amber.test` | Amber Demo Alpha | Existing external fixture |
| Seed Suspended Member A | `suspended.a@amber.test` | Amber Demo Alpha | Negative: suspended membership |
| Seed Removed Member A | `removed.a@amber.test` | Amber Demo Alpha | Negative: removed membership |
| Seed Coordinator B | `coordinator.b@amber.test` | Amber Demo Beta | Tenant isolation |

## 10–15 minute walkthrough

1. Sign in as Seed Coordinator A on Amber Demo Alpha.
2. Open Mensagens. The BIM team thread has recent coordination notes and links to the hospital, a deliverable, and a milestone. One older direct message is edited and one is tombstoned (“Mensagem removida”).
3. Sign in as Caio BIM and show the unread direct conversation with Rui Estruturas.
4. Open Hospital Santa Clara. Show the overdue clash task, the blocked structural task, and the dependency chain from the survey.
5. Open the hospital calendar: a past site visit, a future review, an all-day deadline, and an overlapping personal event.
6. Show Campus Corporativo Aurora as the on-track project and Centro Logístico Vale as blocked. Torre Residencial Leme is still in planning. Retrofit Estação Norte is archived.
7. Show the archived Obra team conversation as read-only.
8. Sign in as Seed Coordinator B and confirm Alpha conversations and projects are absent.
9. Mention Seed Suspended Member A and Seed Removed Member A as negative cases. They do not receive active authority.

## Notable records

- Projects: Hospital Santa Clara — expansão; Campus Corporativo Aurora; Centro Logístico Vale; Torre Residencial Leme; Retrofit Estação Norte.
- Teams: Arquitetura, Estruturas, Instalações, Coordenação BIM, and archived Obra.
- Calendars: Agenda da coordenação, Hospital Santa Clara, Coordenação BIM, and an archived read-only calendar.
- Gate de coordenação da ala clínica stays blocked. A requested Formal Exception does not release it. The campus gate is READY and the station gate is RELEASED.
- The logistics foundation report is on a project Seed Viewer A cannot read. The hospital meeting minutes are on a project that coordinator can read.

Chat text is collaboration context, not the system of record and not a governed decision.
