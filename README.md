# hb-m365-onboarding

A TypeScript/Node readiness engine for Microsoft 365 client onboarding:
contract and tenant gates, license true-up, DNS/domain checks, mailbox
migration, device enrollment, security baseline, blockers, SLA and handover.

## Why this exists

An MSP onboarding a client into Microsoft 365 has to coordinate eight moving
parts before handover: contract, tenant, licenses, domains/DNS, mailbox
migration, device enrollment, security baseline and sign-off. Spreadsheets hide
the blockers. This service makes the readiness contract explicit.

## Formulas

```text
requiredSeats   = activeUsers + sharedMailboxes + roomMailboxes
licenseDelta    = purchasedSeats - requiredSeats
migration%      = migratedMailboxes / totalMailboxes
device%         = enrolledDevices / totalDevices
security%       = compliantDevices / totalDevices
readiness%      = completedRequiredStages / 7 * 100

canHandover = contract, tenant, licenses, domains,
              mailboxMigration, deviceEnrollment and securityBaseline
              are all complete
```

A negative license delta, missing MX/SPF/DKIM/DMARC records or an unapplied
security baseline blocks the relevant stage. Handover is rejected until every
required stage is complete. An overdue onboarding escalates once.

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Liveness probe |
| POST | `/api/onboarding` | Create an onboarding |
| GET | `/api/onboarding/:id` | Readiness summary |
| PATCH | `/api/onboarding/:id` | Update config and recalculate |
| POST | `/api/onboarding/:id/handover` | Accept handover |
| GET | `/api/onboarding/sample` | Seeded sample for the dashboard |
| GET | `/` | Client Onboarding Readiness dashboard |

## Run

```bash
npm install
npm run dev
# or
npm run build && npm start
```

The server listens on `:8095` by default and seeds a complete sample onboarding.

## Google Workspace migration

`src/workspace-migration.ts` extends the readiness engine to Microsoft 365 → Google Workspace migrations: discovery, identity/group/MFA mapping, weighted mail/calendar/drive migration, MX/SPF/DKIM/DMARC cutover readiness, rollback proof and explicit cutover approval. It exposes `WorkspaceMigrationService` with `create`, `update`, `approveCutover`, `summary` and `audit`.

`npm test` now covers 34 Vitest tests (22 onboarding + 12 Workspace migration).

## Test

```bash
npm test
npm run build
```

22 Vitest tests cover stage derivation, license true-up, DNS blockers, migration
and device progress, security baseline, readiness percentages, handover gating,
overdue escalation, audit history, validation, zero-device/zero-mailbox cases
and the API/dashboard routes.

## Design tokens

From HB Technologies' public site:

- Heading/body: Montserrat
- Background: `#FFFFFF`
- Surface: `#F5F5F5`
- Text: `#30383A`
- Accent: `#E31837`
- Radius: `40px`
- Spacing unit: `8px`

## Docker

```bash
docker build -t hb-m365-onboarding .
docker run --rm -p 8095:8095 hb-m365-onboarding
```

## Honest scope

This is a tested readiness engine, not a live Microsoft 365 tenant provisioner.
It does not call Microsoft Graph, create tenants, assign licenses or migrate
mailboxes. The stage gates, license/DNS/migration/device/security calculations,
blockers, escalation and audit trail are real and tested.

## License

MIT
