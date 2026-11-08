import { describe, expect, it } from "vitest";
import { WorkspaceMigrationConfig, WorkspaceMigrationService } from "../src/workspace-migration.js";

function config(partial: Partial<WorkspaceMigrationConfig> = {}): WorkspaceMigrationConfig {
  return {
    discoveryComplete: true,
    identityMapped: true,
    totalMailboxes: 400,
    migratedMailboxes: 400,
    totalCalendars: 400,
    migratedCalendars: 400,
    totalDriveItems: 1000,
    migratedDriveItems: 1000,
    sharedMailboxes: 20,
    groupsMapped: true,
    dns: { mx: true, spf: true, dkim: true, dmarc: true },
    cutoverWindowApproved: false,
    rollbackTested: true,
    adminMfaEnforced: true,
    ...partial
  };
}

function make(partial: Partial<WorkspaceMigrationConfig> = {}) {
  const service = new WorkspaceMigrationService();
  const summary = service.create("Northwind Retail", "northwind.onmicrosoft.com", "northwind.example", config(partial));
  return { service, id: summary.id };
}

describe("Google Workspace migration readiness", () => {
  it("returns a fully migrated workspace with cutover pending", () => {
    const { service, id } = make();
    const s = service.get(id);
    expect(s.migrationPercent).toBe(100);
    expect(s.stages.find((x) => x.key === "cutover")?.status).toBe("in_progress");
    expect(s.canCutover).toBe(false);
  });

  it("blocks discovery until the source inventory is complete", () => {
    const { service, id } = make({ discoveryComplete: false });
    expect(service.get(id).stages.find((x) => x.key === "discovery")?.status).toBe("blocked");
  });

  it("blocks identity when groups or admin MFA are missing", () => {
    const { service, id } = make({ groupsMapped: false });
    expect(service.get(id).stages.find((x) => x.key === "identity")?.status).toBe("blocked");
  });

  it("weights mail, calendar and drive migration", () => {
    const { service, id } = make({ migratedMailboxes: 200, migratedCalendars: 200, migratedDriveItems: 500 });
    expect(service.get(id).migrationPercent).toBe(50);
  });

  it("blocks DNS when DMARC is missing", () => {
    const { service, id } = make({ dns: { mx: true, spf: true, dkim: true, dmarc: false } });
    expect(service.get(id).stages.find((x) => x.key === "dns")?.status).toBe("blocked");
  });

  it("blocks cutover while mail migration is incomplete", () => {
    const { service, id } = make({ migratedMailboxes: 399 });
    expect(service.get(id).stages.find((x) => x.key === "cutover")?.status).toBe("blocked");
  });

  it("blocks rollback proof until it is tested", () => {
    const { service, id } = make({ rollbackTested: false });
    expect(service.get(id).stages.find((x) => x.key === "rollback")?.status).toBe("blocked");
  });

  it("approves cutover only when migration, rollback and approval are present", () => {
    const { service, id } = make();
    const approved = service.approveCutover(id, "delivery-lead");
    expect(approved.canCutover).toBe(true);
    expect(approved.stages.find((x) => x.key === "cutover")?.status).toBe("complete");
  });

  it("rejects cutover approval for an incomplete migration", () => {
    const { service, id } = make({ migratedDriveItems: 0 });
    expect(() => service.approveCutover(id, "delivery-lead")).toThrow("cutover blocked");
  });

  it("recalculates and audits after an update", () => {
    const { service, id } = make({ migratedMailboxes: 0 });
    const updated = service.update(id, { migratedMailboxes: 400 }, "engineer");
    expect(updated.migrationPercent).toBe(100);
    expect(updated.auditCount).toBeGreaterThan(1);
  });

  it("rejects invalid inputs", () => {
    const service = new WorkspaceMigrationService();
    expect(() => service.create("", "src", "dst.example", config())).toThrow();
    expect(() => service.create("Client", "", "dst.example", config())).toThrow();
    expect(() => service.create("Client", "src", "not-a-domain", config())).toThrow();
  });

  it("preserves a zero-item calendar as complete", () => {
    const { service, id } = make({ totalCalendars: 0, migratedCalendars: 0 });
    expect(service.get(id).stages.find((x) => x.key === "calendar")?.status).toBe("complete");
  });
});
