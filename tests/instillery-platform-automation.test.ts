import { describe, expect, it } from "vitest";
import {
  InstilleryPlatformAutomation,
  ModernWorkTenantConfig,
} from "../src/instillery-platform-automation";

describe("InstilleryPlatformAutomation", () => {
  const validConfig: ModernWorkTenantConfig = {
    clientId: "CLI-INST-001",
    clientName: "Auckland Enterprise Partner",
    targetM365TenantId: "tenant-nz-999-guid",
    sourcePlatform: "GoogleWorkspace",
    activeUserCount: 250,
    assignedLicenses: 260,
    requiredLicenses: 250,
    dnsRecords: {
      mxVerified: true,
      spfVerified: true,
      dkimVerified: true,
      dmarcVerified: true,
    },
    endpointCompliance: {
      totalDevices: 250,
      enrolledIntune: 250,
      encryptedBitLockerOrFileVault: 250,
      edrSensorActive: 250,
    },
    securityBaseline: {
      mfaConditionalAccessEnforced: true,
      legacyAuthBlocked: true,
      adminRolesProtected: true,
    },
    virtualization: {
      avdHostPoolsConfigured: true,
      fsLogixProfilesMounted: true,
      sessionHostScalingActive: true,
    },
    processAutomation: {
      userLifecycleFlowActive: true,
      ticketAutomationConfigured: true,
    },
    cutoverApprovedByProjectManager: true,
    documentationHandoverCompleted: true,
  };

  it("evaluates a fully configured tenant as 100% ready for MSP handover", () => {
    const report = InstilleryPlatformAutomation.evaluateReadiness(validConfig);
    expect(report.overallScore).toBe(100);
    expect(report.canHandover).toBe(true);
    expect(report.blockers).toHaveLength(0);
    expect(report.stages.licensing).toBe("PASS");
    expect(report.stages.dnsSecurity).toBe("PASS");
    expect(report.stages.endpointSecurity).toBe("PASS");
    expect(report.stages.identityProtection).toBe("PASS");
    expect(report.stages.virtualizationReady).toBe("PASS");
    expect(report.stages.processAutomationReady).toBe("PASS");
    expect(report.stages.governanceAndSignoff).toBe("PASS");
  });

  it("blocks handover when license delta is negative", () => {
    const config = {
      ...validConfig,
      assignedLicenses: 200,
      requiredLicenses: 250,
    };
    const report = InstilleryPlatformAutomation.evaluateReadiness(config);
    expect(report.canHandover).toBe(false);
    expect(report.stages.licensing).toBe("FAIL");
    expect(report.blockers.some((b) => b.includes("Negative license delta"))).toBe(true);
  });

  it("flags missing DNS authentication records (DMARC / DKIM)", () => {
    const config = {
      ...validConfig,
      dnsRecords: {
        ...validConfig.dnsRecords,
        dmarcVerified: false,
      },
    };
    const report = InstilleryPlatformAutomation.evaluateReadiness(config);
    expect(report.canHandover).toBe(false);
    expect(report.stages.dnsSecurity).toBe("FAIL");
    expect(report.blockers.some((b) => b.includes("DMARC"))).toBe(true);
  });

  it("detects unencrypted or un-enrolled endpoints below 95% threshold", () => {
    const config = {
      ...validConfig,
      endpointCompliance: {
        totalDevices: 100,
        enrolledIntune: 80, // 80% < 95%
        encryptedBitLockerOrFileVault: 75,
        edrSensorActive: 80,
      },
    };
    const report = InstilleryPlatformAutomation.evaluateReadiness(config);
    expect(report.canHandover).toBe(false);
    expect(report.stages.endpointSecurity).toBe("FAIL");
    expect(report.metrics.intuneEnrollmentPercent).toBe(80);
  });

  it("blocks virtualization readiness when FSLogix profiles are unmounted", () => {
    const config = {
      ...validConfig,
      virtualization: {
        ...validConfig.virtualization,
        fsLogixProfilesMounted: false,
      },
    };
    const report = InstilleryPlatformAutomation.evaluateReadiness(config);
    expect(report.canHandover).toBe(false);
    expect(report.stages.virtualizationReady).toBe("FAIL");
    expect(report.blockers.some((b) => b.includes("FSLogix"))).toBe(true);
  });

  it("requires Project Manager cutover approval before final MSP handover", () => {
    const config = {
      ...validConfig,
      cutoverApprovedByProjectManager: false,
    };
    const report = InstilleryPlatformAutomation.evaluateReadiness(config);
    expect(report.canHandover).toBe(false);
    expect(report.stages.governanceAndSignoff).toBe("FAIL");
    expect(report.blockers.some((b) => b.includes("PM approval"))).toBe(true);
  });

  it("generates cryptographic SHA-256 handover manifest with developer signature", () => {
    const manifest = InstilleryPlatformAutomation.generateHandoverManifest(validConfig);
    expect(manifest.manifestId).toContain("CLI-INST-001");
    expect(manifest.readinessScore).toBe(100);
    expect(manifest.blockerCount).toBe(0);
    expect(manifest.engineerVoice).toContain("Soumya Debnath");
    expect(manifest.sha256VerificationHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
