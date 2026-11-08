export type WorkspaceStageKey =
  | "discovery"
  | "identity"
  | "mail"
  | "calendar"
  | "drive"
  | "dns"
  | "cutover"
  | "rollback";

export type WorkspaceStageStatus = "pending" | "in_progress" | "blocked" | "complete";

export interface WorkspaceDns {
  mx: boolean;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
}

export interface WorkspaceMigrationConfig {
  discoveryComplete: boolean;
  identityMapped: boolean;
  totalMailboxes: number;
  migratedMailboxes: number;
  totalCalendars: number;
  migratedCalendars: number;
  totalDriveItems: number;
  migratedDriveItems: number;
  sharedMailboxes: number;
  groupsMapped: boolean;
  dns: WorkspaceDns;
  cutoverWindowApproved: boolean;
  rollbackTested: boolean;
  adminMfaEnforced: boolean;
}

export interface WorkspaceStage {
  key: WorkspaceStageKey;
  label: string;
  status: WorkspaceStageStatus;
  detail: string;
}

export interface WorkspaceSummary {
  id: string;
  clientName: string;
  sourceTenant: string;
  targetDomain: string;
  stages: WorkspaceStage[];
  migrationPercent: number;
  readinessPercent: number;
  blockers: string[];
  canCutover: boolean;
  rollbackReady: boolean;
  auditCount: number;
}

export interface WorkspaceEvent {
  type: string;
  actor: string;
  detail: string;
  at: string;
}

const REQUIRED: WorkspaceStageKey[] = ["discovery", "identity", "mail", "calendar", "drive", "dns", "cutover", "rollback"];

const LABELS: Record<WorkspaceStageKey, string> = {
  discovery: "Discovery",
  identity: "Identity mapping",
  mail: "Mail migration",
  calendar: "Calendar migration",
  drive: "Drive migration",
  dns: "DNS cutover",
  cutover: "Cutover approval",
  rollback: "Rollback proof"
};

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function percent(done: number, total: number): number {
  return total === 0 ? 100 : round((done / total) * 100);
}

function stage(key: WorkspaceStageKey, status: WorkspaceStageStatus, detail: string): WorkspaceStage {
  return { key, label: LABELS[key], status, detail };
}

export class WorkspaceMigrationService {
  private seq = 0;
  private readonly records = new Map<string, {
    id: string;
    clientName: string;
    sourceTenant: string;
    targetDomain: string;
    config: WorkspaceMigrationConfig;
    stages: WorkspaceStage[];
    audit: WorkspaceEvent[];
  }>();

  create(clientName: string, sourceTenant: string, targetDomain: string, config: WorkspaceMigrationConfig, explicitId?: string): WorkspaceSummary {
    if (!clientName.trim()) throw new Error("clientName is required");
    if (!sourceTenant.trim() || !targetDomain.trim()) throw new Error("sourceTenant and targetDomain are required");
    if (!targetDomain.includes(".")) throw new Error("targetDomain must be a domain");
    this.seq += 1;
    const id = explicitId ?? `ws_${Date.now()}_${this.seq}`;
    const record = {
      id,
      clientName: clientName.trim(),
      sourceTenant: sourceTenant.trim(),
      targetDomain: targetDomain.trim().toLowerCase(),
      config: structuredClone(config),
      stages: this.derive(config),
      audit: [{ type: "created", actor: "system", detail: "workspace migration", at: new Date().toISOString() }]
    };
    this.records.set(id, record);
    return this.summary(id);
  }

  get(id: string): WorkspaceSummary {
    return this.summary(id);
  }

  update(id: string, patch: Partial<WorkspaceMigrationConfig>, actor: string, at = new Date()): WorkspaceSummary {
    const record = this.record(id);
    record.config = { ...record.config, ...patch, dns: { ...record.config.dns, ...(patch.dns ?? {}) } };
    record.stages = this.derive(record.config);
    record.audit.push({ type: "config_updated", actor: actor.trim() || "system", detail: Object.keys(patch).join(","), at: at.toISOString() });
    return this.summary(id);
  }

  approveCutover(id: string, actor: string, at = new Date()): WorkspaceSummary {
    const record = this.record(id);
    if (!this.migrationReady(record.stages, record.config)) throw new Error("cutover blocked: required migration proof is incomplete");
    record.config.cutoverWindowApproved = true;
    record.stages = this.derive(record.config);
    record.audit.push({ type: "cutover_approved", actor: actor.trim() || "system", detail: "cutover approved", at: at.toISOString() });
    return this.summary(id);
  }

  summary(id: string): WorkspaceSummary {
    const record = this.record(id);
    const c = record.config;
    const migration = round(percent(c.migratedMailboxes, c.totalMailboxes) * 0.5 + percent(c.migratedCalendars, c.totalCalendars) * 0.25 + percent(c.migratedDriveItems, c.totalDriveItems) * 0.25);
    const complete = record.stages.filter((item) => REQUIRED.includes(item.key) && item.status === "complete").length;
    const readiness = round((complete / REQUIRED.length) * 100);
    const blockers = record.stages.filter((item) => item.status === "blocked").map((item) => `${item.label}: ${item.detail}`);
    return {
      id: record.id,
      clientName: record.clientName,
      sourceTenant: record.sourceTenant,
      targetDomain: record.targetDomain,
      stages: record.stages,
      migrationPercent: migration,
      readinessPercent: readiness,
      blockers,
      canCutover: this.canCutover(record.stages, c),
      rollbackReady: c.rollbackTested,
      auditCount: record.audit.length
    };
  }

  audit(id: string): WorkspaceEvent[] {
    return this.record(id).audit;
  }

  private migrationReady(stages: WorkspaceStage[], config: WorkspaceMigrationConfig): boolean {
    const required = stages.filter((item) => item.key !== "cutover" && item.key !== "rollback");
    return required.every((item) => item.status === "complete") && config.rollbackTested;
  }

  private canCutover(stages: WorkspaceStage[], config: WorkspaceMigrationConfig): boolean {
    return this.migrationReady(stages, config) && config.cutoverWindowApproved;
  }

  private derive(config: WorkspaceMigrationConfig): WorkspaceStage[] {
    const mail = percent(config.migratedMailboxes, config.totalMailboxes);
    const calendar = percent(config.migratedCalendars, config.totalCalendars);
    const drive = percent(config.migratedDriveItems, config.totalDriveItems);
    const dnsComplete = config.dns.mx && config.dns.spf && config.dns.dkim && config.dns.dmarc;
    const identity = config.identityMapped && config.groupsMapped && config.adminMfaEnforced;
    const migrationComplete = mail === 100 && calendar === 100 && drive === 100;

    return [
      stage("discovery", config.discoveryComplete ? "complete" : "blocked", config.discoveryComplete ? "Source inventory complete" : "Source inventory missing"),
      stage("identity", identity ? "complete" : "blocked", identity ? "Users, groups and admin MFA mapped" : "Identity/group/MFA mapping incomplete"),
      stage("mail", mail === 100 ? "complete" : "in_progress", `${mail}% mailbox migration`),
      stage("calendar", calendar === 100 ? "complete" : "in_progress", `${calendar}% calendar migration`),
      stage("drive", drive === 100 ? "complete" : "in_progress", `${drive}% drive migration`),
      stage("dns", dnsComplete ? "complete" : "blocked", dnsComplete ? "MX/SPF/DKIM/DMARC ready" : "DNS records incomplete"),
      stage("cutover", config.cutoverWindowApproved ? "complete" : migrationComplete ? "in_progress" : "blocked", config.cutoverWindowApproved ? "Cutover approved" : migrationComplete ? "Awaiting approval" : "Migration incomplete"),
      stage("rollback", config.rollbackTested ? "complete" : "blocked", config.rollbackTested ? "Rollback tested" : "Rollback not tested")
    ];
  }

  private record(id: string) {
    const record = this.records.get(id);
    if (!record) throw new Error(`workspace migration not found: ${id}`);
    return record;
  }
}
