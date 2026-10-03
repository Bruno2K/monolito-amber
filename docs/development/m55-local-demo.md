# M5.5 local demo dataset

Fictional portfolio for a local, disposable database. The catalog-only seed does not write these accounts. Demo data is written only when all of the following are true:

1. `AMBER_SEED_M3=1`
2. `AMBER_ALLOW_DEMO_SEED=1`
3. `DATABASE_URL` parses as a PostgreSQL URL
4. the host is loopback only: `localhost`, `127.0.0.1`, or `::1`

`NODE_ENV` and `AMBER_ENV` are trimmed and compared case-insensitively. `production` in either variable always refuses the demo seed. A remote host is refused. The Compose DNS name `postgres` is not a seed target. Hostname alone is never enough, and there is no force, unsafe, or remote override. Error text names the failed check and does not include the database URL, username, or password.

Seed from the host against the published loopback port. Do not run the demo seed inside the `api` container: that process uses the Compose service hostname, which the guard rejects. Prefer `scripts/local-rc/bootstrap.sh` or `scripts/local-rc/bootstrap.ps1`. Both set `AMBER_SEED_M3=1` and `AMBER_ALLOW_DEMO_SEED=1` only for the seed command. The PowerShell script restores the previous process environment afterwards and does not write user or machine environment variables. `reset.ps1` reaches that same bootstrap.

Confirm the target before seeding. Print only the host:

```bash
node -e "const u=new URL(process.env.DATABASE_URL); console.log(u.hostname)"
```

```powershell
node -e "const u=new URL(process.env.DATABASE_URL); console.log(u.hostname)"
```

Continue only when that host is `localhost`, `127.0.0.1`, or `::1`.

## Reset and reseed

Bash, from a disposable local database:

```bash
pnpm exec prisma migrate reset --force --skip-seed
pnpm prisma:migrate
AMBER_SEED_M3=1 AMBER_ALLOW_DEMO_SEED=1 pnpm prisma:seed
```

PowerShell, scoped to the seed command:

```powershell
pnpm exec prisma migrate reset --force --skip-seed
pnpm prisma:migrate
$demoSeedFlags = @{
  AMBER_SEED_M3 = "1"
  AMBER_ALLOW_DEMO_SEED = "1"
}
$savedDemoSeedFlags = @{}
foreach ($name in @($demoSeedFlags.Keys)) {
  $savedDemoSeedFlags[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
  Set-Item -Path "Env:$name" -Value $demoSeedFlags[$name]
}
try {
  pnpm prisma:seed
} finally {
  foreach ($name in @($demoSeedFlags.Keys)) {
    $previous = $savedDemoSeedFlags[$name]
    if ([string]::IsNullOrEmpty($previous)) {
      Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
    } else {
      Set-Item -Path "Env:$name" -Value $previous
    }
  }
}
```

Running the seed again is idempotent. Drop, migrate, and seed again reproduce the same ids. Existing Alpha/Beta fixture ids used by tests stay unchanged.

## Sign in

Start the API and web app against that same local database, then open the sign-in page. Use the persona email below and the existing development password `correct-horse-12`. Emails use `@amber.test` only. Choose Amber Demo Alpha unless the walkthrough says Beta.

## Personas

| Persona | Email | Organization | What to show |
| --- | --- | --- | --- |
| Seed Coordinator A | `coordinator.a@amber.test` | Amber Demo Alpha | Inbox, hospital project, calendars |
| Helena Admin | `admin.a@amber.test` | Amber Demo Alpha | Organization administrator |
| Caio BIM | `bim.a@amber.test` | Amber Demo Alpha | BIM coordination; unread direct reply from Rui |
| Lia Arquitetura | `architect.a@amber.test` | Amber Demo Alpha | Architecture model and team chat |
| Rui Estruturas | `structural.a@amber.test` | Amber Demo Alpha | Blocked structural work |
| Nara Instalações | `mep.a@amber.test` | Amber Demo Alpha | MEP package |
| Oto Obra | `contractor.a@amber.test` | Amber Demo Alpha | EXTERNAL membership, hospital project only, archived Obra team |
| Seed Viewer A | `viewer.a@amber.test` | Amber Demo Alpha | Read-only project access |
| Seed External Collaborator A | `external.a@amber.test` | Amber Demo Alpha | Existing external fixture |
| Seed Suspended Member A | `suspended.a@amber.test` | Amber Demo Alpha | Negative: suspended membership |
| Seed Removed Member A | `removed.a@amber.test` | Amber Demo Alpha | Negative: removed membership |
| Seed Coordinator B | `coordinator.b@amber.test` | Amber Demo Beta | Tenant isolation |

## 10–15 minute walkthrough

1. Sign in as Seed Coordinator A on Amber Demo Alpha.
2. Open Mensagens. The BIM team thread has recent coordination notes and links to the hospital, a deliverable, and a milestone. One older direct message is edited and one is tombstoned (“Mensagem removida”).
3. Sign in as Caio BIM. The direct conversation with Rui Estruturas is unread because Rui replied after Caio's note. Rui's own reply does not count as unread for Rui. Opening the conversation as Caio clears Caio's unread count.
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
