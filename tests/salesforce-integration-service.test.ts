import { describe, it, expect, beforeEach } from 'vitest';
import { SalesforceIntegrationService, SalesforcePolicyEvent } from '../src/salesforce-integration-service.js';

describe('SalesforceIntegrationService', () => {
  let service: SalesforceIntegrationService;

  beforeEach(() => {
    service = new SalesforceIntegrationService();
  });

  const validEvent: SalesforcePolicyEvent = {
    eventUuid: 'evt-101',
    replayId: 1001,
    eventType: 'POLICY_CREATED',
    policyNumber: 'AAI-POL-98214',
    customerRef: 'CUST-5512',
    premiumAmountCents: 145000,
    coverageCode: 'AUTO',
    timestamp: '2026-11-14T07:00:00Z',
  };

  it('successfully processes valid policy creation platform event', () => {
    const res = service.processEvent(validEvent);
    expect(res.status).toBe('PROCESSED');
    expect(res.policyNumber).toBe('AAI-POL-98214');
    expect(res.message).toContain('Successfully synchronized');
  });

  it('guarantees idempotent event processing on duplicate replay', () => {
    const first = service.processEvent(validEvent);
    expect(first.status).toBe('PROCESSED');

    const second = service.processEvent(validEvent);
    expect(second.status).toBe('DUPLICATE_IGNORED');
    expect(second.message).toContain('already processed');
  });

  it('rejects malformed payloads and routes to Dead Letter Queue', () => {
    const malformed = { ...validEvent, eventType: 'INVALID_TYPE' as any };
    const res = service.processEvent(malformed);
    expect(res.status).toBe('VALIDATION_FAILED');
    expect(res.message).toContain('Unsupported eventType');

    const dlq = service.getDeadLetterQueue();
    expect(dlq.length).toBe(1);
    expect(dlq[0].reason).toContain('Unsupported eventType');
  });

  it('validates negative premium amount amounts are rejected', () => {
    const negative = { ...validEvent, premiumAmountCents: -500 };
    const res = service.processEvent(negative);
    expect(res.status).toBe('VALIDATION_FAILED');
    expect(res.message).toContain('premiumAmountCents must be a non-negative number');
  });

  it('batches and drains multiple queueable events asynchronously', () => {
    const evt1 = { ...validEvent, eventUuid: 'evt-101', replayId: 1001 };
    const evt2 = { ...validEvent, eventUuid: 'evt-102', replayId: 1002, policyNumber: 'AAI-POL-98215' };
    const count = service.enqueueBatch([evt1, evt2]);
    expect(count).toBe(2);

    const drained = service.drainBatch();
    expect(drained.length).toBe(2);
    expect(drained[0].status).toBe('PROCESSED');
    expect(drained[1].status).toBe('PROCESSED');
  });

  it('clears state cleanly', () => {
    service.processEvent(validEvent);
    service.clear();
    const replay = service.processEvent(validEvent);
    expect(replay.status).toBe('PROCESSED');
  });
});
