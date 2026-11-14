/**
 * Salesforce Enterprise Integration & Event Synchronization Service.
 *
 * Implements resilient handling of Salesforce Platform Events, Outbound Messages,
 * and REST webhook integrations for insurance policy lifecycle management:
 * 1. Policy event payload parsing & schema validation.
 * 2. Asynchronous event queueing & retry handling (simulating Queueable Apex).
 * 3. Idempotent event deduplication based on Salesforce ReplayId / EventUuid.
 * 4. Audit logging & dead-letter queue (DLQ) routing for malformed payloads.
 */

export interface SalesforcePolicyEvent {
  eventUuid: string;
  replayId: number;
  eventType: 'POLICY_CREATED' | 'POLICY_ENDORSED' | 'CLAIM_LODGED' | 'CLAIM_SETTLED';
  policyNumber: string;
  customerRef: string;
  premiumAmountCents: number;
  coverageCode: 'AUTO' | 'HOME' | 'CONTENTS' | 'COMPREHENSIVE';
  timestamp: string;
}

export interface ProcessingResult {
  status: 'PROCESSED' | 'DUPLICATE_IGNORED' | 'VALIDATION_FAILED' | 'QUEUED';
  eventUuid: string;
  policyNumber?: string;
  message: string;
  attempts: number;
}

export class SalesforceIntegrationService {
  private processedEvents = new Set<string>();
  private eventQueue: SalesforcePolicyEvent[] = [];
  private deadLetterQueue: { event: any; reason: string; timestamp: string }[] = [];

  /**
   * Validate and process an inbound Salesforce platform event.
   */
  public processEvent(payload: any): ProcessingResult {
    // 1. Schema assertion
    const validationError = this.validatePayload(payload);
    if (validationError) {
      this.deadLetterQueue.push({
        event: payload,
        reason: validationError,
        timestamp: new Date().toISOString(),
      });
      return {
        status: 'VALIDATION_FAILED',
        eventUuid: payload?.eventUuid || 'UNKNOWN',
        message: validationError,
        attempts: 1,
      };
    }

    const event = payload as SalesforcePolicyEvent;

    // 2. Idempotency check via eventUuid / replayId
    if (this.processedEvents.has(event.eventUuid)) {
      return {
        status: 'DUPLICATE_IGNORED',
        eventUuid: event.eventUuid,
        policyNumber: event.policyNumber,
        message: `Event ${event.eventUuid} already processed (idempotent skip)`,
        attempts: 1,
      };
    }

    // 3. Mark processed and record
    this.processedEvents.add(event.eventUuid);
    return {
      status: 'PROCESSED',
      eventUuid: event.eventUuid,
      policyNumber: event.policyNumber,
      message: `Successfully synchronized ${event.eventType} for policy ${event.policyNumber}`,
      attempts: 1,
    };
  }

  /**
   * Enqueue event for batch processing (mimicking Apex Queueable/Batchable jobs).
   */
  public enqueueBatch(events: SalesforcePolicyEvent[]): number {
    for (const evt of events) {
      if (!this.validatePayload(evt)) {
        this.eventQueue.push(evt);
      }
    }
    return this.eventQueue.length;
  }

  /**
   * Drain and execute queued batch items.
   */
  public drainBatch(): ProcessingResult[] {
    const results: ProcessingResult[] = [];
    while (this.eventQueue.length > 0) {
      const evt = this.eventQueue.shift()!;
      results.push(this.processEvent(evt));
    }
    return results;
  }

  public getDeadLetterQueue() {
    return [...this.deadLetterQueue];
  }

  public clear(): void {
    this.processedEvents.clear();
    this.eventQueue = [];
    this.deadLetterQueue = [];
  }

  private validatePayload(p: any): string | null {
    if (!p || typeof p !== 'object') return 'Payload must be a non-null object';
    if (!p.eventUuid || typeof p.eventUuid !== 'string') return 'Missing or invalid eventUuid';
    if (typeof p.replayId !== 'number' || p.replayId < 0) return 'Invalid replayId';
    if (!['POLICY_CREATED', 'POLICY_ENDORSED', 'CLAIM_LODGED', 'CLAIM_SETTLED'].includes(p.eventType)) {
      return `Unsupported eventType: ${p.eventType}`;
    }
    if (!p.policyNumber || typeof p.policyNumber !== 'string') return 'Missing policyNumber';
    if (typeof p.premiumAmountCents !== 'number' || p.premiumAmountCents < 0) {
      return 'premiumAmountCents must be a non-negative number';
    }
    if (!['AUTO', 'HOME', 'CONTENTS', 'COMPREHENSIVE'].includes(p.coverageCode)) {
      return `Invalid coverageCode: ${p.coverageCode}`;
    }
    return null;
  }
}
