import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { OnboardingConfig, OnboardingService } from "../src/onboarding.js";

function config(partial: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    contractSigned: true,
    tenantCreated: true,
    purchasedSeats: 50,
    activeUsers: 40,
    sharedMailboxes: 5,
    roomMailboxes: 5,
    totalMailboxes: 50,
    migratedMailboxes: 50,
    totalDevices: 20,
    enrolledDevices: 20,
    compliantDevices: 20,
    securityBaselineApplied: true,
    dns: { mx: true, spf: true, dkim: true, dmarc: true },
    ...partial
  };
}

function serviceWith(partial: Partial<OnboardingConfig> = {}): { service: OnboardingService; id: string } {
  const service = new OnboardingService();
  const summary = service.create("Kōwhai Legal", "2026-11-20T17:00:00+13:00", config(partial));
  return { service, id: summary.id };
}

describe("Microsoft 365 onboarding readiness", () => {
  it("reports 100% readiness for a complete onboarding", () => {
    const { service, id } = serviceWith();
    const summary = service.get(id);
    expect(summary.readinessPercent).toBe(100);
    expect(summary.requiredComplete).toBe(7);
    expect(summary.canHandover).toBe(true);
    expect(summary.stages.find((stage) => stage.key === "handover")?.status).toBe("pending");
  });

  it("blocks contract readiness until signed", () => {
    const { service, id } = serviceWith({ contractSigned: false });
    const summary = service.get(id);
    expect(summary.stages.find((stage) => stage.key === "contract")?.status).toBe("pending");
    expect(summary.readinessPercent).toBe(85.7);
  });

  it("blocks tenant readiness until created", () => {
    const { service, id } = serviceWith({ tenantCreated: false });
    expect(service.get(id).stages.find((stage) => stage.key === "tenant")?.status).toBe("pending");
  });

  it("blocks a license shortfall", () => {
    const { service, id } = serviceWith({ purchasedSeats: 49 });
    const summary = service.get(id);
    expect(summary.licenseDelta).toBe(-1);
    expect(summary.stages.find((stage) => stage.key === "licenses")?.status).toBe("blocked");
    expect(summary.blockers.join(" ")).toContain("License shortfall");
  });

  it("accepts an exact license match", () => {
    const { service, id } = serviceWith({ purchasedSeats: 50 });
    const summary = service.get(id);
    expect(summary.licenseDelta).toBe(0);
    expect(summary.stages.find((stage) => stage.key === "licenses")?.status).toBe("complete");
  });

  it("blocks missing DNS records", () => {
    const { service, id } = serviceWith({ dns: { mx: false, spf: true, dkim: true, dmarc: true } });
    expect(service.get(id).stages.find((stage) => stage.key === "domains")?.status).toBe("blocked");
  });

  it("completes when all DNS records are present", () => {
    const { service, id } = serviceWith();
    expect(service.get(id).stages.find((stage) => stage.key === "domains")?.status).toBe("complete");
  });

  it("reports mailbox migration in progress", () => {
    const { service, id } = serviceWith({ migratedMailboxes: 45 });
    const summary = service.get(id);
    expect(summary.migrationPercent).toBe(90);
    expect(summary.stages.find((stage) => stage.key === "mailbox_migration")?.status).toBe("in_progress");
  });

  it("completes mailbox migration at 100%", () => {
    const { service, id } = serviceWith({ migratedMailboxes: 50 });
    expect(service.get(id).stages.find((stage) => stage.key === "mailbox_migration")?.status).toBe("complete");
  });

  it("reports device enrollment in progress", () => {
    const { service, id } = serviceWith({ enrolledDevices: 18 });
    const summary = service.get(id);
    expect(summary.devicePercent).toBe(90);
    expect(summary.stages.find((stage) => stage.key === "device_enrollment")?.status).toBe("in_progress");
  });

  it("blocks when the security baseline is not applied", () => {
    const { service, id } = serviceWith({ securityBaselineApplied: false });
    expect(service.get(id).stages.find((stage) => stage.key === "security_baseline")?.status).toBe("blocked");
  });

  it("reports security compliance in progress", () => {
    const { service, id } = serviceWith({ compliantDevices: 18 });
    const summary = service.get(id);
    expect(summary.securityPercent).toBe(90);
    expect(summary.stages.find((stage) => stage.key === "security_baseline")?.status).toBe("in_progress");
  });

  it("computes readiness across multiple incomplete stages", () => {
    const { service, id } = serviceWith({ contractSigned: false, migratedMailboxes: 25, enrolledDevices: 10 });
    expect(service.get(id).readinessPercent).toBe(57.1);
  });

  it("allows handover and marks the handover stage complete", () => {
    const { service, id } = serviceWith();
    const handedOver = service.handover(id, "delivery-lead", new Date("2026-11-19T12:00:00+13:00"));
    expect(handedOver.stages.find((stage) => stage.key === "handover")?.status).toBe("complete");
  });

  it("rejects handover while required stages are incomplete", () => {
    const { service, id } = serviceWith({ migratedMailboxes: 20 });
    expect(() => service.handover(id, "delivery-lead")).toThrow("handover blocked");
  });

  it("escalates an overdue incomplete onboarding", () => {
    const { service, id } = serviceWith({ migratedMailboxes: 20 });
    const escalated = service.escalate(new Date("2026-11-21T12:00:00+13:00"));
    expect(escalated).toContain(id);
    expect(service.summary(id, new Date("2026-11-21T12:00:00+13:00")).overdue).toBe(true);
  });

  it("escalates only once", () => {
    const { service } = serviceWith({ migratedMailboxes: 20 });
    service.escalate(new Date("2026-11-21T12:00:00+13:00"));
    expect(service.escalate(new Date("2026-11-22T12:00:00+13:00"))).toEqual([]);
  });

  it("recalculates readiness when configuration changes", () => {
    const { service, id } = serviceWith({ migratedMailboxes: 20 });
    expect(service.get(id).migrationPercent).toBe(40);
    const updated = service.update(id, { migratedMailboxes: 50 }, "engineer");
    expect(updated.migrationPercent).toBe(100);
    expect(updated.auditCount).toBeGreaterThan(1);
  });

  it("records an audit trail", () => {
    const { service, id } = serviceWith({ migratedMailboxes: 20 });
    service.update(id, { migratedMailboxes: 30 }, "engineer");
    expect(service.audit(id).map((event) => event.type)).toEqual(["created", "config_updated"]);
  });

  it("rejects a blank client or invalid due date", () => {
    const service = new OnboardingService();
    expect(() => service.create("", "2026-11-20T17:00:00+13:00", config())).toThrow();
    expect(() => service.create("Kōwhai Legal", "not-a-date", config())).toThrow();
  });

  it("handles a zero-mailbox and zero-device onboarding", () => {
    const { service, id } = serviceWith({ totalMailboxes: 0, migratedMailboxes: 0, totalDevices: 0, enrolledDevices: 0, compliantDevices: 0 });
    const summary = service.get(id);
    expect(summary.migrationPercent).toBe(100);
    expect(summary.devicePercent).toBe(100);
    expect(summary.securityPercent).toBe(100);
    expect(summary.canHandover).toBe(true);
  });

  it("serves create/get/update/handover and the dashboard", async () => {
    const service = new OnboardingService();
    const app = buildApp(service);
    const created = await app.inject({
      method: "POST",
      url: "/api/onboarding",
      payload: { clientName: "Kōwhai Legal", dueAt: "2026-11-20T17:00:00+13:00", config: config({ migratedMailboxes: 20 }) }
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect((await app.inject({ method: "GET", url: `/api/onboarding/${id}` })).statusCode).toBe(200);
    const patched = await app.inject({
      method: "PATCH",
      url: `/api/onboarding/${id}`,
      payload: { patch: { migratedMailboxes: 50 }, actor: "engineer" }
    });
    expect(patched.json().migrationPercent).toBe(100);
    expect((await app.inject({ method: "POST", url: `/api/onboarding/${id}/handover`, payload: { actor: "lead" } })).statusCode).toBe(200);
    const dashboard = await app.inject({ method: "GET", url: "/" });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.body).toContain("Client Onboarding Readiness");
    expect(dashboard.body).toContain("#E31837");
  });
});
