/**
 * Instillery Modern Work & Platform Automation Engine.
 *
 * Engineered for Microsoft 365, Google Workspace, virtualization (AVD/Cloud PC),
 * business process automation, and seamless MSP support team handover.
 */

import * as crypto from "crypto";

export interface ModernWorkTenantConfig {
  clientId: string;
  clientName: string;
  targetM365TenantId: string;
  sourcePlatform: "GoogleWorkspace" | "ExchangeOnPrem" | "TenantToTenant";
  activeUserCount: number;
  assignedLicenses: number;
  requiredLicenses: number;
  dnsRecords: {
    mxVerified: boolean;
    spfVerified: boolean;
    dkimVerified: boolean;
    dmarcVerified: boolean;
  };
  endpointCompliance: {
    totalDevices: number;
    enrolledIntune: number;
    encryptedBitLockerOrFileVault: number;
    edrSensorActive: number;
  };
  securityBaseline: {
    mfaConditionalAccessEnforced: boolean;
    legacyAuthBlocked: boolean;
    adminRolesProtected: boolean;
  };
  virtualization: {
    avdHostPoolsConfigured: boolean;
    fsLogixProfilesMounted: boolean;
    sessionHostScalingActive: boolean;
  };
  processAutomation: {
    userLifecycleFlowActive: boolean;
    ticketAutomationConfigured: boolean;
  };
  cutoverApprovedByProjectManager: boolean;
  documentationHandoverCompleted: boolean;
}

export interface ModernWorkReadinessReport {
  clientId: string;
  clientName: string;
  overallScore: number;
  canHandover: boolean;
  blockers: string[];
  stages: {
    licensing: "PASS" | "FAIL";
    dnsSecurity: "PASS" | "FAIL";
    endpointSecurity: "PASS" | "FAIL";
    identityProtection: "PASS" | "FAIL";
    virtualizationReady: "PASS" | "FAIL";
    processAutomationReady: "PASS" | "FAIL";
    governanceAndSignoff: "PASS" | "FAIL";
  };
  metrics: {
    licenseDelta: number;
    intuneEnrollmentPercent: number;
    encryptionCompliancePercent: number;
  };
}

export interface SupportHandoverManifest {
  manifestId: string;
  clientId: string;
  generatedAt: string;
  engineerVoice: string;
  readinessScore: number;
  blockerCount: number;
  sha256VerificationHash: string;
}

export class InstilleryPlatformAutomation {
  static evaluateReadiness(config: ModernWorkTenantConfig): ModernWorkReadinessReport {
    const blockers: string[] = [];

    // 1. License Check
    const licenseDelta = config.assignedLicenses - config.requiredLicenses;
    let licensingPass = true;
    if (licenseDelta < 0) {
      licensingPass = false;
      blockers.push(`Negative license delta (${licenseDelta}): requires ${Math.abs(licenseDelta)} additional seats`);
    }

    // 2. DNS Security Check
    const dns = config.dnsRecords;
    let dnsPass = true;
    if (!dns.mxVerified || !dns.spfVerified || !dns.dkimVerified || !dns.dmarcVerified) {
      dnsPass = false;
      const missingDns = [];
      if (!dns.mxVerified) missingDns.push("MX");
      if (!dns.spfVerified) missingDns.push("SPF");
      if (!dns.dkimVerified) missingDns.push("DKIM");
      if (!dns.dmarcVerified) missingDns.push("DMARC");
      blockers.push(`Incomplete email authentication DNS records: missing ${missingDns.join(", ")}`);
    }

    // 3. Endpoint Compliance Check
    const endpoints = config.endpointCompliance;
    const intuneEnrollmentPercent = endpoints.totalDevices > 0
      ? (endpoints.enrolledIntune / endpoints.totalDevices) * 100
      : 100;
    const encryptionCompliancePercent = endpoints.totalDevices > 0
      ? (endpoints.encryptedBitLockerOrFileVault / endpoints.totalDevices) * 100
      : 100;

    let endpointPass = true;
    if (intuneEnrollmentPercent < 95) {
      endpointPass = false;
      blockers.push(`Intune enrollment rate (${intuneEnrollmentPercent.toFixed(1)}%) below 95% threshold`);
    }
    if (encryptionCompliancePercent < 95) {
      endpointPass = false;
      blockers.push(`Device encryption rate (${encryptionCompliancePercent.toFixed(1)}%) below 95% threshold`);
    }
    if (endpoints.edrSensorActive < endpoints.enrolledIntune) {
      endpointPass = false;
      blockers.push("One or more enrolled endpoints missing active EDR agent telemetry");
    }

    // 4. Security Baseline Check
    const sec = config.securityBaseline;
    let identityPass = true;
    if (!sec.mfaConditionalAccessEnforced || !sec.legacyAuthBlocked || !sec.adminRolesProtected) {
      identityPass = false;
      blockers.push("Core security baseline incomplete: requires MFA Conditional Access, Legacy Auth Block, and Privileged Identity Protection");
    }

    // 5. Virtualization Check
    const virt = config.virtualization;
    let virtPass = true;
    if (!virt.avdHostPoolsConfigured || !virt.fsLogixProfilesMounted) {
      virtPass = false;
      blockers.push("Virtualization deployment incomplete: AVD host pool or FSLogix profile storage unconfigured");
    }

    // 6. Process Automation Check
    const auto = config.processAutomation;
    let autoPass = true;
    if (!auto.userLifecycleFlowActive || !auto.ticketAutomationConfigured) {
      autoPass = false;
      blockers.push("Business process automation incomplete: user lifecycle or ticketing automation unconfigured");
    }

    // 7. Governance & Sign-off Check
    let govPass = true;
    if (!config.cutoverApprovedByProjectManager || !config.documentationHandoverCompleted) {
      govPass = false;
      blockers.push("Governance sign-off incomplete: PM approval or operational documentation handover missing");
    }

    const stageResults = [licensingPass, dnsPass, endpointPass, identityPass, virtPass, autoPass, govPass];
    const completedStages = stageResults.filter(Boolean).length;
    const overallScore = Math.round((completedStages / stageResults.length) * 100);

    return {
      clientId: config.clientId,
      clientName: config.clientName,
      overallScore,
      canHandover: blockers.length === 0,
      blockers,
      stages: {
        licensing: licensingPass ? "PASS" : "FAIL",
        dnsSecurity: dnsPass ? "PASS" : "FAIL",
        endpointSecurity: endpointPass ? "PASS" : "FAIL",
        identityProtection: identityPass ? "PASS" : "FAIL",
        virtualizationReady: virtPass ? "PASS" : "FAIL",
        processAutomationReady: autoPass ? "PASS" : "FAIL",
        governanceAndSignoff: govPass ? "PASS" : "FAIL",
      },
      metrics: {
        licenseDelta,
        intuneEnrollmentPercent: Math.round(intuneEnrollmentPercent),
        encryptionCompliancePercent: Math.round(encryptionCompliancePercent),
      },
    };
  }

  static generateHandoverManifest(config: ModernWorkTenantConfig): SupportHandoverManifest {
    const report = this.evaluateReadiness(config);
    const nowIso = new Date().toISOString();

    const payload = JSON.stringify({
      clientId: config.clientId,
      clientName: config.clientName,
      targetM365TenantId: config.targetM365TenantId,
      overallScore: report.overallScore,
      blockers: report.blockers,
      stages: report.stages,
      timestamp: nowIso,
    });

    const hash = crypto.createHash("sha256").update(payload).digest("hex");

    return {
      manifestId: `MAN-${config.clientId}-${Date.now()}`,
      clientId: config.clientId,
      generatedAt: nowIso,
      engineerVoice: "Soumya Debnath — Modern Work & Platform Delivery Automation",
      readinessScore: report.overallScore,
      blockerCount: report.blockers.length,
      sha256VerificationHash: hash,
    };
  }
}
