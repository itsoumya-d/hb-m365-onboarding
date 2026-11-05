export type StageKey =
  | "contract"
  | "tenant"
  | "licenses"
  | "domains"
  | "mailbox_migration"
  | "device_enrollment"
  | "security_baseline"
  | "handover";

export type StageStatus = "pending" | "in_progress" | "blocked" | "complete";

export interface DnsRecords {
  mx: boolean;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
}

export interface OnboardingConfig {
  contractSigned: boolean;
  tenantCreated: boolean;
  purchasedSeats: number;
  activeUsers: number;
  sharedMailboxes: number;
  roomMailboxes: number;
  totalMailboxes: number;
  migratedMailboxes: number;
  totalDevices: number;
  enrolledDevices: number;
  compliantDevices: number;
  securityBaselineApplied: boolean;
  dns: DnsRecords;
}

export interface Stage {
  key: StageKey;
  label: string;
  status: StageStatus;
  detail: string;
}

export interface OnboardingEvent {
  type: string;
  actor: string;
  detail: string;
  at: string;
}

export interface OnboardingSummary {
  id: string;
  clientName: string;
  dueAt: string;
  stages: Stage[];
  readinessPercent: number;
  requiredComplete: number;
  requiredTotal: number;
  licenseDelta: number;
  requiredSeats: number;
  migrationPercent: number;
  devicePercent: number;
  securityPercent: number;
  blockers: string[];
  canHandover: boolean;
  overdue: boolean;
  auditCount: number;
}

const REQUIRED_STAGES: StageKey[] = [
  "contract",
  "tenant",
  "licenses",
  "domains",
  "mailbox_migration",
  "device_enrollment",
  "security_baseline"
];

const LABELS: Record<StageKey, string> = {
  contract: "Contract signed",
  tenant: "Tenant created",
  licenses: "Licenses assigned",
  domains: "Domains & DNS",
  mailbox_migration: "Mailbox migration",
  device_enrollment: "Device enrollment",
  security_baseline: "Security baseline",
  handover: "Client handover"
};

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function stage(key: StageKey, status: StageStatus, detail: string): Stage {
  return { key, label: LABELS[key], status, detail };
}

export class OnboardingService {
  private seq = 0;
  private readonly records = new Map<string, {
    id: string;
    clientName: string;
    dueAt: string;
    config: OnboardingConfig;
    stages: Stage[];
    audit: OnboardingEvent[];
    escalated: boolean;
  }>();

  create(clientName: string, dueAt: string, config: OnboardingConfig, explicitId?: string): OnboardingSummary {
    if (!clientName.trim()) throw new Error("clientName is required");
    if (Number.isNaN(Date.parse(dueAt))) throw new Error("dueAt must be a valid date");
    this.seq += 1;
    const id = explicitId ?? `onb_${Date.now()}_${this.seq}`;
    const stages = this.derive(config);
    const record = {
      id,
      clientName: clientName.trim(),
      dueAt,
      config: structuredClone(config),
      stages,
      audit: [{ type: "created", actor: "system", detail: `${stages.length} stages`, at: new Date().toISOString() }],
      escalated: false
    };
    this.records.set(id, record);
    return this.summary(id);
  }

  get(id: string): OnboardingSummary {
    return this.summary(id);
  }

  update(id: string, patch: Partial<OnboardingConfig>, actor: string, at = new Date()): OnboardingSummary {
    const record = this.record(id);
    record.config = this.merge(record.config, patch);
    record.stages = this.derive(record.config);
    record.audit.push({
      type: "config_updated",
      actor: actor.trim() || "system",
      detail: Object.keys(patch).join(","),
      at: at.toISOString()
    });
    return this.summary(id, at);
  }

  handover(id: string, actor: string, at = new Date()): OnboardingSummary {
    const record = this.record(id);
    if (!this.canHandover(record.stages)) throw new Error("handover blocked: required stages are incomplete");
    record.stages = record.stages.map((item) =>
      item.key === "handover" ? stage("handover", "complete", "Handover accepted") : item
    );
    record.audit.push({ type: "handover", actor: actor.trim() || "system", detail: "client handover", at: at.toISOString() });
    return this.summary(id, at);
  }

  escalate(now = new Date()): string[] {
    const overdue: string[] = [];
    for (const record of this.records.values()) {
      if (record.escalated) continue;
      const canHandover = this.canHandover(record.stages);
      if (Date.parse(record.dueAt) < now.getTime() && !canHandover) {
        record.escalated = true;
        overdue.push(record.id);
        record.audit.push({ type: "escalated", actor: "system", detail: "onboarding overdue", at: now.toISOString() });
      }
    }
    return overdue;
  }

  audit(id: string): OnboardingEvent[] {
    return this.record(id).audit;
  }

  summary(id: string, now = new Date()): OnboardingSummary {
    const record = this.record(id);
    const config = record.config;
    const required = record.stages.filter((item) => REQUIRED_STAGES.includes(item.key));
    const completed = required.filter((item) => item.status === "complete").length;
    const readiness = round((completed / REQUIRED_STAGES.length) * 100);
    const requiredSeats = config.activeUsers + config.sharedMailboxes + config.roomMailboxes;
    const licenseDelta = config.purchasedSeats - requiredSeats;
    const migrationPercent = config.totalMailboxes === 0 ? 100 : round((config.migratedMailboxes / config.totalMailboxes) * 100);
    const devicePercent = config.totalDevices === 0 ? 100 : round((config.enrolledDevices / config.totalDevices) * 100);
    const securityPercent = config.totalDevices === 0 ? 100 : round((config.compliantDevices / config.totalDevices) * 100);
    const blockers = required
      .filter((item) => item.status === "blocked")
      .map((item) => `${item.label}: ${item.detail}`);
    if (licenseDelta < 0) blockers.push(`License shortfall: ${Math.abs(licenseDelta)} seat(s)`);
    const canHandover = completed === REQUIRED_STAGES.length;

    return {
      id: record.id,
      clientName: record.clientName,
      dueAt: record.dueAt,
      stages: record.stages,
      readinessPercent: readiness,
      requiredComplete: completed,
      requiredTotal: REQUIRED_STAGES.length,
      licenseDelta,
      requiredSeats,
      migrationPercent,
      devicePercent,
      securityPercent,
      blockers,
      canHandover,
      overdue: Date.parse(record.dueAt) < now.getTime() && !canHandover,
      auditCount: record.audit.length
    };
  }

  private derive(config: OnboardingConfig): Stage[] {
    const requiredSeats = config.activeUsers + config.sharedMailboxes + config.roomMailboxes;
    const licenseDelta = config.purchasedSeats - requiredSeats;
    const dnsComplete = config.dns.mx && config.dns.spf && config.dns.dkim && config.dns.dmarc;

    const stages: Stage[] = [
      stage("contract", config.contractSigned ? "complete" : "pending", config.contractSigned ? "Signed" : "Awaiting signature"),
      stage("tenant", config.tenantCreated ? "complete" : "pending", config.tenantCreated ? "Tenant online" : "Tenant not created"),
      stage(
        "licenses",
        requiredSeats === 0 || licenseDelta >= 0 ? "complete" : "blocked",
        requiredSeats === 0 ? "No seats required" : `${config.purchasedSeats} purchased / ${requiredSeats} required (delta ${licenseDelta})`
      ),
      stage(
        "domains",
        dnsComplete ? "complete" : "blocked",
        dnsComplete ? "MX, SPF, DKIM and DMARC present" : "Missing one or more DNS records"
      ),
      stage(
        "mailbox_migration",
        config.totalMailboxes === 0 || config.migratedMailboxes === config.totalMailboxes
          ? "complete"
          : config.migratedMailboxes > 0
            ? "in_progress"
            : "pending",
        `${config.migratedMailboxes}/${config.totalMailboxes} mailboxes migrated`
      ),
      stage(
        "device_enrollment",
        config.totalDevices === 0 || config.enrolledDevices === config.totalDevices
          ? "complete"
          : config.enrolledDevices > 0
            ? "in_progress"
            : "pending",
        `${config.enrolledDevices}/${config.totalDevices} devices enrolled`
      ),
      stage(
        "security_baseline",
        !config.securityBaselineApplied
          ? "blocked"
          : config.totalDevices === 0 || config.compliantDevices === config.totalDevices
            ? "complete"
            : config.compliantDevices > 0
              ? "in_progress"
              : "pending",
        !config.securityBaselineApplied
          ? "Baseline not applied"
          : `${config.compliantDevices}/${config.totalDevices} devices compliant`
      )
    ];

    const canHandover = stages.every((item) => item.status === "complete");
    stages.push(stage("handover", "pending", canHandover ? "Ready for handover" : "Blocked until all required stages complete"));
    return stages;
  }

  private canHandover(stages: Stage[]): boolean {
    return stages.filter((item) => REQUIRED_STAGES.includes(item.key)).every((item) => item.status === "complete");
  }

  private merge(config: OnboardingConfig, patch: Partial<OnboardingConfig>): OnboardingConfig {
    return {
      ...config,
      ...patch,
      dns: { ...config.dns, ...(patch.dns ?? {}) }
    };
  }

  private record(id: string) {
    const record = this.records.get(id);
    if (!record) throw new Error("onboarding not found");
    return record;
  }
}
