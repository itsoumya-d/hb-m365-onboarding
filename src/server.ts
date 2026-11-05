import { buildApp } from "./app.js";
import { OnboardingConfig, OnboardingService } from "./onboarding.js";

export function completeConfig(): OnboardingConfig {
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
    dns: { mx: true, spf: true, dkim: true, dmarc: true }
  };
}

const service = new OnboardingService();
service.create("Kōwhai Legal", "2026-11-20T17:00:00+13:00", completeConfig(), "sample");

const app = buildApp(service);
const port = Number(process.env.PORT ?? 8095);
await app.listen({ host: "0.0.0.0", port });
console.log(`hb-m365-onboarding listening on :${port}`);
