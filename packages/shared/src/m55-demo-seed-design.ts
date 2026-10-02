import { createHash } from "node:crypto";

/**
 * Local-only portfolio layered on the M3/M4/M5 fixtures.
 * Written only when AMBER_SEED_M3=1. Fictional. Deterministic IDs.
 * Demo reference instant: 2026-10-02T12:00:00.000Z (America/Sao_Paulo display).
 */
export const M55_DEMO_REFERENCE_ISO = "2026-10-02T12:00:00.000Z";
export const M55_DEMO_TIME_ZONE = "America/Sao_Paulo";

export function demoSeedUuid(key: string): string {
  const digest = createHash("sha256").update(`amber.m55.demo.${key}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export const M55_DEMO_USERS = [
  { key: "admin-a", email: "admin.a@amber.test", displayName: "Helena Admin", persona: "Administradora da organização" },
  { key: "bim-a", email: "bim.a@amber.test", displayName: "Caio BIM", persona: "Coordenador BIM" },
  { key: "architect-a", email: "architect.a@amber.test", displayName: "Lia Arquitetura", persona: "Arquiteta" },
  { key: "structural-a", email: "structural.a@amber.test", displayName: "Rui Estruturas", persona: "Engenheiro estrutural" },
  { key: "mep-a", email: "mep.a@amber.test", displayName: "Nara Instalações", persona: "Engenheira MEP" },
  { key: "contractor-a", email: "contractor.a@amber.test", displayName: "Oto Obra", persona: "Contratada" },
] as const;

export const M55_DEMO_ORG_MEMBERSHIPS = [
  { userKey: "admin-a", templateKey: "ORGANIZATION_ADMINISTRATOR", membershipType: "INTERNAL" },
  { userKey: "bim-a", templateKey: null, membershipType: "INTERNAL" },
  { userKey: "architect-a", templateKey: null, membershipType: "INTERNAL" },
  { userKey: "structural-a", templateKey: null, membershipType: "INTERNAL" },
  { userKey: "mep-a", templateKey: null, membershipType: "INTERNAL" },
  { userKey: "contractor-a", templateKey: null, membershipType: "EXTERNAL" },
] as const;

const DEMO_SEED_LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
/** Compose service name from docker-compose.yml. Not a configurable remote bypass. */
const DEMO_SEED_COMPOSE_HOST = "postgres";

export function demoSeedEnabled(env: { AMBER_SEED_M3?: string }): boolean {
  return env.AMBER_SEED_M3 === "1";
}

export function assertLocalDemoSeedTarget(env: {
  NODE_ENV?: string;
  AMBER_ENV?: string;
  AMBER_ALLOW_DEMO_SEED?: string;
  DATABASE_URL?: string;
}): void {
  if (env.NODE_ENV === "production" || env.AMBER_ENV === "production") {
    throw new Error("Refusing demo seed: NODE_ENV or AMBER_ENV is production");
  }
  if (env.AMBER_ALLOW_DEMO_SEED !== "1") {
    throw new Error("Refusing demo seed: AMBER_ALLOW_DEMO_SEED=1 is required");
  }
  const raw = env.DATABASE_URL;
  if (!raw?.trim()) {
    throw new Error("Refusing demo seed: DATABASE_URL is missing");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Refusing demo seed: DATABASE_URL is malformed");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("Refusing demo seed: DATABASE_URL must use the postgresql protocol");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!DEMO_SEED_LOOPBACK_HOSTS.has(host) && host !== DEMO_SEED_COMPOSE_HOST) {
    throw new Error(`Refusing demo seed: database host "${host}" is not a local or disposable target`);
  }
}

export const M55_DEMO_PROJECTS = [
  { key: "demo-hospital", name: "Hospital Santa Clara — expansão", archived: false, story: "Ativo e em risco: clash de instalações atrasado." },
  { key: "demo-campus", name: "Campus Corporativo Aurora", archived: false, story: "Ativo e no prazo." },
  { key: "demo-logistics", name: "Centro Logístico Vale", archived: false, story: "Bloqueado por interferência de fundação." },
  { key: "demo-tower", name: "Torre Residencial Leme", archived: false, story: "Ainda em planejamento." },
  { key: "demo-renovation", name: "Retrofit Estação Norte", archived: true, story: "Obra concluída e arquivada." },
] as const;

export const M55_DEMO_PROJECT_MEMBERS = [
  { projectKey: "demo-hospital", userKey: "coord-a", templateKey: "PROJECT_COORDINATOR" },
  { projectKey: "demo-hospital", userKey: "bim-a", templateKey: "DISCIPLINE_COORDINATOR" },
  { projectKey: "demo-hospital", userKey: "architect-a", templateKey: "CONTRIBUTOR_DESIGNER" },
  { projectKey: "demo-hospital", userKey: "structural-a", templateKey: "CONTRIBUTOR_DESIGNER" },
  { projectKey: "demo-hospital", userKey: "mep-a", templateKey: "CONTRIBUTOR_DESIGNER" },
  { projectKey: "demo-hospital", userKey: "contractor-a", templateKey: "EXTERNAL_CONTRIBUTOR" },
  { projectKey: "demo-hospital", userKey: "viewer-a", templateKey: "VIEWER" },
  { projectKey: "demo-campus", userKey: "coord-a", templateKey: "PROJECT_COORDINATOR" },
  { projectKey: "demo-campus", userKey: "architect-a", templateKey: "CONTRIBUTOR_DESIGNER" },
  { projectKey: "demo-campus", userKey: "bim-a", templateKey: "DISCIPLINE_COORDINATOR" },
  { projectKey: "demo-logistics", userKey: "bim-a", templateKey: "PROJECT_COORDINATOR" },
  { projectKey: "demo-logistics", userKey: "structural-a", templateKey: "CONTRIBUTOR_DESIGNER" },
  { projectKey: "demo-tower", userKey: "architect-a", templateKey: "PROJECT_COORDINATOR" },
  { projectKey: "demo-tower", userKey: "viewer-a", templateKey: "VIEWER" },
  { projectKey: "demo-renovation", userKey: "coord-a", templateKey: "PROJECT_COORDINATOR" },
] as const;

export const M55_DEMO_TEAMS = [
  { key: "demo-arch", name: "Arquitetura", archived: false },
  { key: "demo-str", name: "Estruturas", archived: false },
  { key: "demo-mep", name: "Instalações", archived: false },
  { key: "demo-bim", name: "Coordenação BIM", archived: false },
  { key: "demo-site", name: "Obra", archived: true },
] as const;

export const M55_DEMO_TEAM_MEMBERS = [
  { teamKey: "demo-arch", userKey: "architect-a" },
  { teamKey: "demo-arch", userKey: "coord-a" },
  { teamKey: "demo-str", userKey: "structural-a" },
  { teamKey: "demo-str", userKey: "bim-a" },
  { teamKey: "demo-mep", userKey: "mep-a" },
  { teamKey: "demo-mep", userKey: "bim-a" },
  { teamKey: "demo-bim", userKey: "bim-a" },
  { teamKey: "demo-bim", userKey: "coord-a" },
  { teamKey: "demo-bim", userKey: "architect-a" },
  { teamKey: "demo-site", userKey: "contractor-a" },
  { teamKey: "demo-site", userKey: "coord-a" },
] as const;

export const M55_DEMO_PHASES = [
  { key: "hospital-concept", projectKey: "demo-hospital", name: "Conceito", sequence: 0, status: "COMPLETED" },
  { key: "hospital-dd", projectKey: "demo-hospital", name: "Projeto executivo", sequence: 1, status: "ACTIVE" },
  { key: "campus-dd", projectKey: "demo-campus", name: "Desenvolvimento", sequence: 1, status: "ACTIVE" },
  { key: "logistics-exec", projectKey: "demo-logistics", name: "Execução", sequence: 1, status: "ACTIVE" },
  { key: "tower-brief", projectKey: "demo-tower", name: "Programa", sequence: 0, status: "PLANNED" },
  { key: "renovation-close", projectKey: "demo-renovation", name: "Encerramento", sequence: 2, status: "COMPLETED" },
] as const;

export const M55_DEMO_DELIVERABLES = [
  { key: "hosp-arch-model", projectKey: "demo-hospital", phaseKey: "hospital-dd", disciplineCode: "ARCH", code: "HSP-ARQ-001", title: "Modelo de arquitetura — ala clínica", status: "IN_PROGRESS" },
  { key: "hosp-str-model", projectKey: "demo-hospital", phaseKey: "hospital-dd", disciplineCode: "STR", code: "HSP-EST-001", title: "Modelo estrutural — bloco B", status: "IN_REVIEW" },
  { key: "hosp-mep-pack", projectKey: "demo-hospital", phaseKey: "hospital-dd", disciplineCode: "MEP", code: "HSP-MEP-001", title: "Pacote de instalações — centro cirúrgico", status: "PLANNED" },
  { key: "campus-report", projectKey: "demo-campus", phaseKey: "campus-dd", disciplineCode: "ARCH", code: "CMP-ARQ-014", title: "Relatório de coordenação — campus", status: "APPROVED" },
] as const;

export const M55_DEMO_MILESTONES = [
  { key: "hosp-coord", projectKey: "demo-hospital", phaseKey: "hospital-dd", title: "Coordenação multidisciplinar", status: "PLANNED", dayOffset: 12 },
  { key: "hosp-freeze", projectKey: "demo-hospital", phaseKey: "hospital-concept", title: "Congelamento do conceito", status: "ACHIEVED", dayOffset: -20 },
  { key: "log-foundation", projectKey: "demo-logistics", phaseKey: "logistics-exec", title: "Liberação da fundação", status: "PLANNED", dayOffset: 5 },
  { key: "tower-program", projectKey: "demo-tower", phaseKey: "tower-brief", title: "Aprovação do programa", status: "PLANNED", dayOffset: 30 },
] as const;

export const M55_DEMO_TASKS = [
  { key: "hosp-survey", projectKey: "demo-hospital", phaseKey: "hospital-concept", title: "Levantamento da ala existente", status: "DONE", priority: "NORMAL", assignee: "architect-a", dayOffset: -15, milestoneKey: "hosp-freeze", deliverableKey: null },
  { key: "hosp-arch", projectKey: "demo-hospital", phaseKey: "hospital-dd", title: "Modelo de arquitetura da ala clínica", status: "IN_PROGRESS", priority: "HIGH", assignee: "architect-a", dayOffset: 6, milestoneKey: "hosp-coord", deliverableKey: "hosp-arch-model" },
  { key: "hosp-str", projectKey: "demo-hospital", phaseKey: "hospital-dd", title: "Modelo estrutural do bloco B", status: "BLOCKED", priority: "HIGH", assignee: "structural-a", dayOffset: 8, milestoneKey: "hosp-coord", deliverableKey: "hosp-str-model", blockedReason: "Aguardando eixos do modelo de arquitetura." },
  { key: "hosp-clash", projectKey: "demo-hospital", phaseKey: "hospital-dd", title: "Relatório de clashes do centro cirúrgico", status: "TODO", priority: "URGENT", assignee: "bim-a", dayOffset: -3, milestoneKey: "hosp-coord", deliverableKey: "hosp-mep-pack" },
  { key: "campus-review", projectKey: "demo-campus", phaseKey: "campus-dd", title: "Revisão do relatório de coordenação", status: "IN_PROGRESS", priority: "NORMAL", assignee: "architect-a", dayOffset: 4, milestoneKey: null, deliverableKey: "campus-report" },
  { key: "log-hold", projectKey: "demo-logistics", phaseKey: "logistics-exec", title: "Contenção da interferência de fundação", status: "BLOCKED", priority: "URGENT", assignee: "structural-a", dayOffset: -1, milestoneKey: "log-foundation", deliverableKey: null, blockedReason: "Sondagem adicional pendente." },
  { key: "tower-brief", projectKey: "demo-tower", phaseKey: "tower-brief", title: "Programa de necessidades da torre", status: "TODO", priority: "LOW", assignee: "architect-a", dayOffset: 21, milestoneKey: "tower-program", deliverableKey: null },
  { key: "renovation-close", projectKey: "demo-renovation", phaseKey: "renovation-close", title: "Dossiê de entrega da estação", status: "DONE", priority: "NORMAL", assignee: "coord-a", dayOffset: -40, milestoneKey: null, deliverableKey: null },
  { key: "hosp-cancelled", projectKey: "demo-hospital", phaseKey: "hospital-dd", title: "Estudo de heliponto descartado", status: "CANCELLED", priority: "LOW", assignee: "architect-a", dayOffset: 40, milestoneKey: null, deliverableKey: null },
] as const;

export const M55_DEMO_DEPENDENCIES = [
  { predecessor: "hosp-survey", successor: "hosp-arch" },
  { predecessor: "hosp-arch", successor: "hosp-str" },
  { predecessor: "hosp-str", successor: "hosp-clash" },
] as const;

export const M55_DEMO_GATES = [
  { key: "hosp-coord-gate", projectKey: "demo-hospital", name: "Gate de coordenação da ala clínica", status: "BLOCKED" },
  { key: "campus-ready", projectKey: "demo-campus", name: "Gate de emissão do campus", status: "READY" },
  { key: "renovation-released", projectKey: "demo-renovation", name: "Gate de encerramento da estação", status: "RELEASED" },
] as const;

export const M55_DEMO_DOCUMENTS = [
  { key: "hosp-minutes", projectKey: "demo-hospital", code: "HSP-ATA-012", title: "Ata de coordenação — 28 de setembro", status: "ACTIVE" },
  { key: "log-restricted", projectKey: "demo-logistics", code: "LOG-REL-003", title: "Relatório restrito de fundação", status: "ACTIVE" },
] as const;

export const M55_DEMO_CALENDARS = [
  { key: "coord-personal", ownerKey: "coord-a", name: "Agenda da coordenação", description: "Agenda pessoal de Seed Coordinator A.", status: "ACTIVE" },
  { key: "hospital", ownerKey: "coord-a", name: "Hospital Santa Clara", description: "Marcos e reuniões da expansão.", status: "ACTIVE" },
  { key: "bim-team", ownerKey: "bim-a", name: "Coordenação BIM", description: "Sessões da equipe de coordenação.", status: "ACTIVE" },
  { key: "archive-ro", ownerKey: "coord-a", name: "Arquivo de obra — somente leitura", description: "Calendário arquivado.", status: "ARCHIVED" },
] as const;

export const M55_DEMO_EVENTS = [
  { key: "coord-standup", calendarKey: "coord-personal", title: "Alinhamento diário", allDay: false, start: "2026-10-02T12:00:00.000Z", end: "2026-10-02T12:30:00.000Z" },
  { key: "coord-overlap", calendarKey: "coord-personal", title: "Ligação com a contratada", allDay: false, start: "2026-10-02T12:15:00.000Z", end: "2026-10-02T12:45:00.000Z" },
  { key: "hosp-review", calendarKey: "hospital", title: "Revisão de projeto — ala clínica", allDay: false, start: "2026-10-06T14:00:00.000Z", end: "2026-10-06T16:00:00.000Z" },
  { key: "hosp-inspect", calendarKey: "hospital", title: "Visita ao canteiro", allDay: false, start: "2026-09-28T13:00:00.000Z", end: "2026-09-28T15:00:00.000Z" },
  { key: "hosp-deadline", calendarKey: "hospital", title: "Entrega do pacote de coordenação", allDay: true, startDate: "2026-10-14", endDate: "2026-10-14" },
  { key: "bim-session", calendarKey: "bim-team", title: "Sessão de clashes", allDay: false, start: "2026-10-03T16:00:00.000Z", end: "2026-10-03T17:30:00.000Z" },
] as const;

export const M55_DEMO_CONVERSATIONS = [
  { key: "dm-coord-architect", kind: "DIRECT" as const, userKeys: ["coord-a", "architect-a"] as const, readBy: ["coord-a", "architect-a"] as const },
  { key: "dm-bim-structural", kind: "DIRECT" as const, userKeys: ["bim-a", "structural-a"] as const, readBy: ["structural-a"] as const },
  { key: "team-bim", kind: "TEAM" as const, teamKey: "demo-bim", readBy: ["coord-a"] as const },
  { key: "team-site", kind: "TEAM" as const, teamKey: "demo-site", readBy: ["coord-a", "contractor-a"] as const },
] as const;

export const M55_DEMO_MESSAGES = [
  { key: "dm-arch-1", conversationKey: "dm-coord-architect", authorKey: "coord-a", body: "Lia, o eixo da ala clínica mudou depois da visita. Consegue revisar o modelo até sexta?", edited: false, tombstone: false, at: "2026-10-01T14:00:00.000Z" },
  { key: "dm-arch-2", conversationKey: "dm-coord-architect", authorKey: "architect-a", body: "Revisado. O corredor de serviço ficou 1,20 m e o posto de enfermagem desceu um eixo.", edited: true, tombstone: false, at: "2026-10-01T16:10:00.000Z" },
  { key: "dm-arch-3", conversationKey: "dm-coord-architect", authorKey: "coord-a", body: "Rascunho interno que não deve permanecer.", edited: false, tombstone: true, at: "2026-10-01T16:20:00.000Z" },
  { key: "dm-arch-4", conversationKey: "dm-coord-architect", authorKey: "architect-a", body: "O posto de enfermagem agora encosta na circulação vertical. Sem mudança de área útil.", edited: false, tombstone: false, at: "2026-10-01T17:05:00.000Z" },
  { key: "dm-arch-5", conversationKey: "dm-coord-architect", authorKey: "coord-a", body: "Combinado. Deixo o apontamento na sessão de BIM, sem tratar o chat como decisão.", edited: false, tombstone: false, at: "2026-10-01T17:40:00.000Z" },
  { key: "dm-arch-6", conversationKey: "dm-coord-architect", authorKey: "architect-a", body: "Vou publicar o pacote no projeto executivo ainda hoje.", edited: false, tombstone: false, at: "2026-10-01T18:10:00.000Z" },
  { key: "dm-arch-7", conversationKey: "dm-coord-architect", authorKey: "coord-a", body: "Perfeito. Amanhã cruzamos com estruturas antes da visita.", edited: false, tombstone: false, at: "2026-10-01T18:25:00.000Z" },
  { key: "dm-str-1", conversationKey: "dm-bim-structural", authorKey: "bim-a", body: "Rui, o clash do shaft com a viga V12 continua aberto. Não é decisão de gate — é só o apontamento da sessão.", edited: false, tombstone: false, at: "2026-10-02T11:00:00.000Z", link: { type: "TASK", taskKey: "hosp-clash" } },
  { key: "dm-str-2", conversationKey: "dm-bim-structural", authorKey: "structural-a", body: "Caio, vi o apontamento. A viga V12 ainda não cabe no shaft; devolvo o modelo amanhã cedo.", edited: false, tombstone: false, at: "2026-10-02T15:10:00.000Z" },
  { key: "team-bim-1", conversationKey: "team-bim", authorKey: "bim-a", body: "Sessão de amanhã fica no modelo federado da ala clínica. Links de colaboração, não o registro da decisão.", edited: false, tombstone: false, at: "2026-10-02T10:00:00.000Z", link: { type: "PROJECT", projectKey: "demo-hospital" } },
  { key: "team-bim-2", conversationKey: "team-bim", authorKey: "architect-a", body: "Publiquei o pacote de arquitetura para a coordenação.", edited: false, tombstone: false, at: "2026-10-02T10:20:00.000Z", link: { type: "DELIVERABLE", deliverableKey: "hosp-arch-model" } },
  { key: "team-bim-3", conversationKey: "team-bim", authorKey: "coord-a", body: "O marco de coordenação continua na segunda quinzena.", edited: false, tombstone: false, at: "2026-10-02T10:40:00.000Z", link: { type: "MILESTONE", milestoneKey: "hosp-coord" } },
  { key: "team-site-1", conversationKey: "team-site", authorKey: "contractor-a", body: "A equipe de obra foi arquivada. Este histórico fica somente leitura.", edited: false, tombstone: false, at: "2026-09-15T13:00:00.000Z" },
] as const;
