import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessagingRouteService } from '../src/modules/webhooks/messaging.route.js';
import { EntitlementService } from '../src/modules/access/entitlement.service.js';
import { ConversationIngestService } from '../src/modules/conversations/ingest.service.js';
import { UsageCaptureService } from '../src/modules/metering/capture.service.js';
import mongoose from 'mongoose';

// Mock @noxivo/database to avoid real DB access and cast errors
vi.mock('@noxivo/database', () => ({
  ConversationModel: {
    findById: vi.fn(),
    findOne: vi.fn(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn()
  },
  WorkflowDefinitionModel: {
    findOne: vi.fn(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn()
  },
  MessageModel: {
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn()
  }
}));

import { ConversationModel, WorkflowDefinitionModel } from '@noxivo/database';

const mockAgencyRepo = {
  findById: vi.fn(),
  findByStripeCustomerId: vi.fn()
};

const mockTenantRepo = {
  findById: vi.fn()
};

const mockMessagingSessionBindingRepo = {
  findBySessionName: vi.fn(),
  updateStatus: vi.fn()
};

const mockCounterService = {
  increment: vi.fn().mockResolvedValue({ incremented: true })
};

const mockInboxService = {
  recordMessage: vi.fn().mockResolvedValue({
    conversation: {
      _id: {
        toString: () => new mongoose.Types.ObjectId().toString()
      }
    }
  })
};

const mockDeliveryLifecycleService = {
  recordEvent: vi.fn().mockResolvedValue({ persisted: true }),
  syncMessageState: vi.fn().mockResolvedValue({ persisted: true })
};

const mockMessageRepo = {
  findOne: vi.fn(),
  find: vi.fn(),
  findOneAndUpdate: vi.fn()
};

const mockConversationRepo = {
  findOne: vi.fn()
};

const mockInboxEventsPublisher = {
  publishMessageCreated: vi.fn().mockResolvedValue(undefined),
  publishDeliveryUpdated: vi.fn().mockResolvedValue(undefined)
};

function queryResult<T>(value: T) {
  return {
    exec: async () => value
  };
}

describe('messaging-webhook-enterprise', () => {
  let messagingRouteService: MessagingRouteService;
  let entitlementService: EntitlementService;
  let ingestService: ConversationIngestService;

  beforeEach(() => {
    vi.clearAllMocks();
    
    const captureService = new UsageCaptureService(mockCounterService as any);
    ingestService = new ConversationIngestService(captureService, null);
    
    entitlementService = new EntitlementService({
      agencyRepo: mockAgencyRepo as any
    });
    
    messagingRouteService = new MessagingRouteService({
      messagingSessionBindingRepo: mockMessagingSessionBindingRepo as any,
      agencyRepo: mockAgencyRepo as any,
      tenantRepo: mockTenantRepo as any,
      entitlementService: entitlementService as any,
      inboxService: mockInboxService as any,
      conversationIngestService: ingestService as any, // FIXED: Added missing service
      messageRepo: mockMessageRepo as any,
      conversationRepo: mockConversationRepo as any,
      deliveryLifecycleService: mockDeliveryLifecycleService as any,
      inboxEventsPublisher: mockInboxEventsPublisher as any
    });

    // Default mocks for Mongoose models
    (ConversationModel.findById as any).mockReturnValue({
      lean: () => ({
        exec: async () => null
      })
    });
  });

  describe('webhook resolution', () => {
    it('should resolve webhook using sessionBindingId from MessagingProvider metadata', async () => {
      // ARRANGE
      const mockBinding = {
        id: 'binding-123',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        clusterId: 'cluster-1',
        sessionName: 'session-abc'
      };
      
      mockMessagingSessionBindingRepo.findBySessionName.mockResolvedValue(mockBinding);
      
      const webhookPayload = {
        session: 'session-abc',
        metadata: {
          agencyId: 'agency-1',
          tenantId: 'tenant-1',
          clusterId: 'cluster-1',
          sessionBindingId: 'binding-123'
        }
      };
      
      // ACT
      const result = await messagingRouteService.resolveWebhook(webhookPayload as any);
      
      // ASSERT
      expect(result.agencyId).toBe('agency-1');
      expect(result.tenantId).toBe('tenant-1');
      expect(result.sessionBindingId).toBe('binding-123');
      expect(mockMessagingSessionBindingRepo.findBySessionName).toHaveBeenCalledWith('session-abc');
    });

    it('returns null when metadata does not match stored binding', async () => {
      // ARRANGE
      const mockBinding = {
        id: 'binding-123',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        clusterId: 'cluster-1',
        sessionName: 'session-abc'
      };
      
      mockMessagingSessionBindingRepo.findBySessionName.mockResolvedValue(mockBinding);
      
      // Payload with mismatched agencyId in metadata
      const webhookPayload = {
        session: 'session-abc',
        metadata: {
          agencyId: 'agency-2', // different agency!
          tenantId: 'tenant-1',
          clusterId: 'cluster-1',
          sessionBindingId: 'binding-123'
        }
      };
      
      const result = await messagingRouteService.resolveWebhook(webhookPayload as any);
      expect(result).toBeNull();
    });

    it('resolves webhook from metadata when binding does not exist', async () => {
      mockMessagingSessionBindingRepo.findBySessionName.mockResolvedValue(null);
      mockAgencyRepo.findById.mockResolvedValue({ _id: 'agency-1' });
      mockTenantRepo.findById.mockResolvedValue({ _id: 'tenant-1' });

      const result = await messagingRouteService.resolveWebhook({
        session: 'unknown-session',
        metadata: {
          agencyId: 'agency-1',
          tenantId: 'tenant-1',
          clusterId: 'cluster-x',
          sessionBindingId: 'binding-x'
        }
      } as any);

      expect(result).toEqual({
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        clusterId: 'cluster-x',
        sessionBindingId: 'binding-x'
      });
    });
  });

  describe('usage metering on inbound', () => {
    it('should increment usage counter on successful inbound processing', async () => {
      // ARRANGE
      const validObjectId = new mongoose.Types.ObjectId().toString();
      const inboundInput = {
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        conversationId: validObjectId,
        contactId: 'contact-1',
        content: 'Hello from customer'
      };
      
      // ACT
      const result = await ingestService.ingestInboundMessage(inboundInput);
      
      // ASSERT
      expect(result.persisted).toBe(true);
      expect(mockCounterService.increment).toHaveBeenCalledWith({
        agencyId: 'agency-1',
        metric: 'inbound_message',
        amount: 1
      });
    });
  });

  describe('webhook message persistence', () => {
    it('maps session.status webhook states to binding status updates', async () => {
      mockMessagingSessionBindingRepo.findBySessionName.mockResolvedValue({
        id: 'binding-123',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        clusterId: 'cluster-1',
        sessionName: 'session-abc'
      });

      await messagingRouteService.processWebhook({
        event: 'session.status',
        session: 'session-abc',
        payload: {
          status: 'WORKING'
        }
      });

      expect(mockMessagingSessionBindingRepo.updateStatus).toHaveBeenCalledWith('session-abc', 'active');
    });

    it('persists inbound media attachment metadata from MessagingProvider messages', async () => {
      mockMessagingSessionBindingRepo.findBySessionName.mockResolvedValue({
        id: 'binding-123',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        clusterId: 'cluster-1',
        sessionName: 'session-abc'
      });
      mockMessageRepo.find.mockReturnValue({ lean: () => queryResult([]) });

      await messagingRouteService.processWebhook({
        event: 'message',
        session: 'session-abc',
        payload: {
          id: 'wamid-media-1',
          from: '15550001111@c.us',
          to: '15550002222@c.us',
          fromMe: false,
          body: 'See attachment',
          hasMedia: true,
          media: {
            url: 'https://messaging.local/files/image.jpg',
            mimetype: 'image/jpeg',
            filename: 'image.jpg'
          },
          replyTo: {
            id: 'quoted-1',
            participant: '15550003333@c.us',
            body: 'Original message',
            media: {
              url: 'https://messaging.local/files/quoted.pdf',
              mimetype: 'application/pdf',
              filename: 'quoted.pdf'
            }
          },
          ack: 0,
          ackName: 'PENDING'
        }
      });

      expect(mockInboxService.recordMessage).toHaveBeenCalledWith(expect.objectContaining({
        contactId: '15550001111@c.us',
        role: 'user',
        providerMessageId: 'wamid-media-1',
        deliveryStatus: 'queued',
        attachments: [
          expect.objectContaining({
            kind: 'image',
            url: 'https://messaging.local/files/image.jpg',
            mimeType: 'image/jpeg',
            fileName: 'image.jpg',
            caption: 'See attachment'
          })
        ],
        metadata: expect.objectContaining({
          quotedMessage: expect.objectContaining({
            messageId: 'quoted-1',
            participant: '15550003333@c.us',
            body: 'Original message',
            media: expect.objectContaining({
              kind: 'document',
              url: 'https://messaging.local/files/quoted.pdf',
              mimeType: 'application/pdf',
              fileName: 'quoted.pdf'
            })
          })
        })
      }));
    });

    it('persists inbound messages when provider payload id uses _serialized shape', async () => {
      mockMessagingSessionBindingRepo.findBySessionName.mockResolvedValue({
        id: 'binding-123',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        clusterId: 'cluster-1',
        sessionName: 'session-abc'
      });
      mockMessageRepo.find.mockReturnValue({ lean: () => queryResult([]) });

      await messagingRouteService.processWebhook({
        event: 'message.upsert',
        session: 'session-abc',
        payload: {
          id: { _serialized: 'wamid-serialized-1' },
          from: '15550001111@c.us',
          to: '15550002222@c.us',
          fromMe: false,
          body: 'Inbound from serialized id',
          ack: 0,
          ackName: 'PENDING'
        }
      });

      expect(mockInboxService.recordMessage).toHaveBeenCalledWith(expect.objectContaining({
        contactId: '15550001111@c.us',
        role: 'user',
        messagingMessageId: 'wamid-serialized-1',
        providerMessageId: 'wamid-serialized-1'
      }));
      expect(mockInboxEventsPublisher.publishMessageCreated).toHaveBeenCalled();
    });

    it('updates outbound delivery state on message ack events', async () => {
      mockMessagingSessionBindingRepo.findBySessionName.mockResolvedValue({
        id: 'binding-123',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        clusterId: 'cluster-1',
        sessionName: 'session-abc'
      });

      mockMessageRepo.find.mockReturnValue({ lean: () => queryResult([{ _id: 'message-1', conversationId: 'conv-1' }]) });
      mockConversationRepo.findOne.mockReturnValue({ lean: () => queryResult({ _id: 'conv-1' }) });
      mockMessageRepo.findOneAndUpdate.mockReturnValue(queryResult({ _id: 'message-1' }));

      await messagingRouteService.processWebhook({
        event: 'message.ack',
        session: 'session-abc',
        payload: {
          id: 'wamid-outbound-1',
          ack: 3,
          ackName: 'READ'
        }
      });

      expect(mockMessageRepo.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'message-1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            providerAck: 3,
            providerAckName: 'READ',
            deliveryStatus: 'read'
          })
        })
      );
      expect(mockInboxEventsPublisher.publishDeliveryUpdated).toHaveBeenCalledWith('tenant-1', 'conv-1');
    });

    it('deduplicates message.any payloads by provider message id', async () => {
      mockMessagingSessionBindingRepo.findBySessionName.mockResolvedValue({
        id: 'binding-123',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        clusterId: 'cluster-1',
        sessionName: 'session-abc'
      });

      mockMessageRepo.find.mockReturnValue({ lean: () => queryResult([{ _id: 'message-1', conversationId: 'conv-1' }]) });
      mockConversationRepo.findOne.mockReturnValue({ lean: () => queryResult({ _id: 'conv-1' }) });
      mockMessageRepo.findOneAndUpdate.mockReturnValue(queryResult({ _id: 'message-1' }));

      await messagingRouteService.processWebhook({
        event: 'message.any',
        session: 'session-abc',
        payload: {
          id: 'wamid-existing-1',
          from: '15550001111@c.us',
          to: '15550002222@c.us',
          fromMe: true,
          body: 'Already stored',
          ack: 1,
          ackName: 'SERVER'
        }
      });

      expect(mockInboxService.recordMessage).not.toHaveBeenCalled();
      expect(mockMessageRepo.findOneAndUpdate).toHaveBeenCalled();
    });

    it('publishes realtime inbox events for newly inserted fromMe messages', async () => {
      mockMessagingSessionBindingRepo.findBySessionName.mockResolvedValue({
        id: 'binding-123',
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        clusterId: 'cluster-1',
        sessionName: 'session-abc'
      });
      mockMessageRepo.find.mockReturnValue({ lean: () => queryResult([]) });

      await messagingRouteService.processWebhook({
        event: 'message.any',
        session: 'session-abc',
        payload: {
          id: 'wamid-new-device-1',
          from: '15550002222@c.us',
          to: '15550001111@c.us',
          fromMe: true,
          body: 'Sent from phone',
          ack: 1,
          ackName: 'SERVER',
          source: 'mobile'
        }
      });

      expect(mockInboxService.recordMessage).toHaveBeenCalledWith(expect.objectContaining({
        role: 'assistant',
        providerMessageId: 'wamid-new-device-1',
        metadata: expect.objectContaining({ source: 'mobile' })
      }));
    });
  });

  describe('entitlement checks for premium features', () => {
    it('should deny premium plugin execution when agency subscription is delinquent', async () => {
      // ARRANGE
      const mockAgency = {
        id: 'agency-1',
        plan: 'enterprise',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        status: 'suspended'
      };
      
      mockAgencyRepo.findById.mockResolvedValue(mockAgency);
      
      // ACT
      const result = await entitlementService.checkEntitlement({
        agencyId: 'agency-1',
        feature: 'premium_plugin'
      });
      
      // ASSERT
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Agency subscription is delinquent');
    });

    it('should allow premium features when agency is active and not delinquent', async () => {
      // ARRANGE
      const mockAgency = {
        id: 'agency-1',
        plan: 'enterprise',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        status: 'active'
      };
      
      mockAgencyRepo.findById.mockResolvedValue(mockAgency);
      
      // ACT
      const result = await entitlementService.checkEntitlement({
        agencyId: 'agency-1',
        feature: 'premium_plugin'
      });
      
      // ASSERT
      expect(result.allowed).toBe(true);
    });

    it('should allow webhook ingestion even when agency is delinquent', async () => {
      // ARRANGE
      const mockAgency = {
        id: 'agency-1',
        plan: 'enterprise',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        status: 'suspended'
      };
      
      mockAgencyRepo.findById.mockResolvedValue(mockAgency);
      
      // ACT
      const result = await entitlementService.checkEntitlement({
        agencyId: 'agency-1',
        feature: 'webhook_ingestion'
      });
      
      // ASSERT
      expect(result.allowed).toBe(true);
    });

    it('should persist inbound messages even when outbound automation is blocked', async () => {
      // ARRANGE
      const mockAgency = {
        id: 'agency-1',
        plan: 'enterprise',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        status: 'suspended'
      };
      
      mockAgencyRepo.findById.mockResolvedValue(mockAgency);
      
      const validObjectId = new mongoose.Types.ObjectId().toString();
      const inboundInput = {
        agencyId: 'agency-1',
        tenantId: 'tenant-1',
        conversationId: validObjectId,
        contactId: 'contact-1',
        content: 'Hello from customer'
      };
      
      // ACT - Even with delinquent status, inbound should persist
      const result = await ingestService.ingestInboundMessage(inboundInput);
      
      // ASSERT - Inbound always persists regardless of billing status
      expect(result.persisted).toBe(true);
    });
  });
});
