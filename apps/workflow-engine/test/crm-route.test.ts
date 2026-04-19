import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import {
  ContactProfileModel,
  ConversationModel,
  CrmExternalRecordLinkModel
} from '@noxivo/database';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('crm internal route', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-crm-route-tests' });
    await Promise.all([
      ContactProfileModel.init(),
      ConversationModel.init(),
      CrmExternalRecordLinkModel.init()
    ]);
  });

  afterEach(async () => {
    delete process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('loads CRM profile state for an internally scoped conversation', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const conversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      contactName: 'Alice CRM',
      status: 'open',
      unreadCount: 0
    });

    await ContactProfileModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      contactName: 'Alice CRM',
      crmTags: [{ label: 'vip' }],
      totalMessages: 1,
      inboundMessages: 1,
      outboundMessages: 0
    });
    await CrmExternalRecordLinkModel.create({
      agencyId,
      tenantId,
      contactId: '15550001111@c.us',
      provider: 'hubspot',
      objectType: 'contact',
      externalRecordId: 'hs-contact-1',
      externalUrl: 'https://app.hubspot.com/contacts/1'
    });

    process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'crm-psk';
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/internal/crm/conversations/${conversation._id.toString()}/profile?agencyId=${agencyId.toString()}&tenantId=${tenantId.toString()}`,
        headers: {
          'x-nexus-internal-psk': 'crm-psk'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        contactId: '15550001111@c.us',
        crmTags: [expect.objectContaining({ label: 'vip' })],
        externalLinks: [expect.objectContaining({ externalRecordId: 'hs-contact-1' })]
      });
    } finally {
      await server.close();
    }
  });

  it('updates CRM notes, tags, and links for the scoped conversation', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const conversation = await ConversationModel.create({
      agencyId,
      tenantId,
      contactId: '15550002222@c.us',
      contactName: 'Bob CRM',
      status: 'open',
      unreadCount: 0
    });

    process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'crm-psk';
    const server = await buildServer({ logger: false });

    try {
      const updateResponse = await server.inject({
        method: 'PATCH',
        url: `/v1/internal/crm/conversations/${conversation._id.toString()}/profile`,
        headers: {
          'content-type': 'application/json',
          'x-nexus-internal-psk': 'crm-psk'
        },
        payload: {
          agencyId: agencyId.toString(),
          tenantId: tenantId.toString(),
          action: 'update_profile',
          tags: [{ label: 'renewal' }],
          owner: {
            externalOwnerId: 'owner-2',
            displayName: 'Account Exec',
            email: 'ae@example.com'
          }
        }
      });

      expect(updateResponse.statusCode).toBe(200);

      const noteResponse = await server.inject({
        method: 'PATCH',
        url: `/v1/internal/crm/conversations/${conversation._id.toString()}/profile`,
        headers: {
          'content-type': 'application/json',
          'x-nexus-internal-psk': 'crm-psk'
        },
        payload: {
          agencyId: agencyId.toString(),
          tenantId: tenantId.toString(),
          action: 'add_note',
          provider: 'custom',
          note: {
            body: 'Follow up next week',
            authorUserId: 'user-1'
          }
        }
      });

      expect(noteResponse.statusCode).toBe(200);

      const linkResponse = await server.inject({
        method: 'PATCH',
        url: `/v1/internal/crm/conversations/${conversation._id.toString()}/profile`,
        headers: {
          'content-type': 'application/json',
          'x-nexus-internal-psk': 'crm-psk'
        },
        payload: {
          agencyId: agencyId.toString(),
          tenantId: tenantId.toString(),
          action: 'link_record',
          provider: 'custom',
          externalRecordId: 'custom-contact-2',
          externalUrl: 'https://crm.internal/contacts/2'
        }
      });

      expect(linkResponse.statusCode).toBe(200);
      expect(linkResponse.json()).toMatchObject({
        crmOwner: expect.objectContaining({ externalOwnerId: 'owner-2' }),
        crmTags: [expect.objectContaining({ label: 'renewal' })],
        crmNotes: [expect.objectContaining({ body: 'Follow up next week' })],
        externalLinks: [expect.objectContaining({ externalRecordId: 'custom-contact-2' })]
      });
    } finally {
      await server.close();
    }
  });
});
