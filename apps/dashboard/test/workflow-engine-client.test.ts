import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildWorkflowEngineUrl,
  workflowEngineFetch,
} from '../lib/api/workflow-engine-client';
import {
  loginWithWorkflowEngine,
  signupWithWorkflowEngine,
  logoutFromWorkflowEngine,
  getWorkflowEngineSession,
} from '../lib/api/dashboard-auth-client';
import { dashboardApi } from '../lib/api/dashboard-api';

describe('workflow-engine-client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildWorkflowEngineUrl', () => {
    it('builds URL with default base URL', () => {
      const url = buildWorkflowEngineUrl('/v1/test');
      expect(url).toBe('http://localhost:3001/v1/test');
    });

    it('uses overrideBaseUrl when provided', () => {
      const url = buildWorkflowEngineUrl('/v1/test', 'https://custom.api.noxivo.app');
      expect(url).toBe('https://custom.api.noxivo.app/v1/test');
    });

    it('handles paths without leading slash', () => {
      const url = buildWorkflowEngineUrl('v1/test');
      expect(url).toBe('http://localhost:3001/v1/test');
    });
  });

  describe('workflowEngineFetch', () => {
    it('throws error on non-ok response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => '{"error": "invalid token"}',
      });

      await expect(workflowEngineFetch('/v1/test')).rejects.toThrow('invalid token');
    });

    it('returns parsed JSON on ok response', async () => {
      const mockData = { id: '123', name: 'test' };
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(mockData),
      });

      const result = await workflowEngineFetch<{ id: string; name: string }>('/v1/test');
      expect(result).toEqual(mockData);
    });

    it('does NOT set Content-Type when no body provided and method is GET', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ id: '123' }),
      });

      await workflowEngineFetch('/v1/test', { method: 'GET' });

      const call = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Headers }];
      expect(call[1].headers.get('Content-Type')).toBeNull();
    });

    it('throws error when ok response has empty body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => '',
      });

      await expect(workflowEngineFetch('/v1/test')).rejects.toThrow();
    });

    it('throws error when ok response has non-JSON body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => 'not json',
      });

      await expect(workflowEngineFetch('/v1/test')).rejects.toThrow('Failed to parse response');
    });
  });

  describe('dashboard-auth-client exports', () => {
    it('loginWithWorkflowEngine exists and calls correct endpoint', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ user: { id: '1', email: 'test@test.com', fullName: 'Test', agencyId: 'a1' } }),
      });

      await loginWithWorkflowEngine({ email: 'test@test.com', password: 'password' });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/dashboard-auth/login',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );
    });

    it('signupWithWorkflowEngine exists', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ user: { id: '1', email: 'test@test.com', fullName: 'Test', agencyId: 'a1' } }),
      });

      await signupWithWorkflowEngine({ email: 'test@test.com', password: 'password', fullName: 'Test', agencyName: 'Agency' });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/dashboard-auth/signup',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('logoutFromWorkflowEngine exists and returns { ok: true }', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ ok: true }),
      });

      const result = await logoutFromWorkflowEngine();
      expect(result).toEqual({ ok: true });
    });

    it('getWorkflowEngineSession returns user with fullName', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ user: { id: '1', email: 'test@test.com', fullName: 'Test User', agencyId: 'a1' } }),
      });

      const result = await getWorkflowEngineSession();
      expect(result.user.fullName).toBe('Test User');
    });
  });

  describe('dashboard-api endpoints', () => {
    it('getAgencies uses /api/v1/agencies', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ agencies: [] }),
      });

      await dashboardApi.getAgencies();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/agencies',
        expect.any(Object)
      );
    });

    it('getWorkflows uses /api/v1/workflows', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ workflows: [] }),
      });

      await dashboardApi.getWorkflows();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/workflows',
        expect.any(Object)
      );
    });

    it('getCatalog uses /api/v1/catalog', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ items: [] }),
      });

      await dashboardApi.getCatalog();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/catalog',
        expect.any(Object)
      );
    });

    it('getTeamInbox uses /api/v1/team-inbox', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ messages: [] }),
      });

      await dashboardApi.getTeamInbox();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/team-inbox',
        expect.any(Object)
      );
    });

    it('getSettingsCredentials uses /api/v1/settings/credentials', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ credentials: [] }),
      });

      await dashboardApi.getSettingsCredentials();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/credentials',
        expect.any(Object)
      );
    });

    it('getNotifications uses GET /api/v1/settings/notifications', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ notifications: [], unreadCount: 0 }),
      });

      await dashboardApi.getNotifications();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/notifications',
        expect.any(Object)
      );
    });

    it('markNotificationAsRead uses POST /api/v1/settings/notifications', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      await dashboardApi.markNotificationAsRead('notification-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/notifications',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'markAsRead', notificationId: 'notification-1' }),
        })
      );
    });

    it('markAllNotificationsAsRead uses POST /api/v1/settings/notifications', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      await dashboardApi.markAllNotificationsAsRead();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/notifications',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'markAllAsRead' }),
        })
      );
    });

    it('getImagekitAuth uses GET /api/v1/settings/imagekit-auth', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ signature: 'sig', token: 'tok', expire: 123, publicKey: 'pub' }),
      });

      await dashboardApi.getImagekitAuth();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/imagekit-auth',
        expect.any(Object)
      );
    });

    it('listAgencyWebhooks uses GET /api/v1/agency/webhooks', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify([]),
      });

      await dashboardApi.listAgencyWebhooks();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/agency/webhooks',
        expect.any(Object)
      );
    });

    it('createAgencyWebhook uses POST /api/v1/agency/webhooks', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ id: 'webhook-1' }),
      });

      await dashboardApi.createAgencyWebhook({
        name: 'Bookings',
        url: 'https://example.com/webhook',
        events: ['booking.created'],
        isActive: true,
        secret: '',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/agency/webhooks',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('updateAgencyWebhook uses PUT /api/v1/agency/webhooks/:id', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ id: 'webhook-1' }),
      });

      await dashboardApi.updateAgencyWebhook('webhook-1', {
        name: 'Bookings',
        url: 'https://example.com/webhook',
        events: ['booking.updated'],
        isActive: true,
        secret: '',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/agency/webhooks/webhook-1',
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('deleteAgencyWebhook uses DELETE /api/v1/agency/webhooks/:id', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      await dashboardApi.deleteAgencyWebhook('webhook-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/agency/webhooks/webhook-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('listAdminMessagingSessions uses GET /api/v1/admin/sessions', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify([]),
      });

      await dashboardApi.listAdminMessagingSessions();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/admin/sessions',
        expect.any(Object)
      );
    });

    it('controlAdminMessagingSession uses POST /api/v1/admin/sessions/:id/:action', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      await dashboardApi.controlAdminMessagingSession('session-1', 'restart');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/admin/sessions/session-1/restart',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('deleteAdminMessagingSession uses DELETE /api/v1/admin/sessions/:id', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      await dashboardApi.deleteAdminMessagingSession('session-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/admin/sessions/session-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('getAdminMessagingQr uses GET /api/v1/admin/sessions/:id/qr', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ code: 'qr-token' }),
      });

      await dashboardApi.getAdminMessagingQr('session-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/admin/sessions/session-1/qr',
        expect.any(Object)
      );
    });

    it('getAdminMessagingStatus uses GET /api/v1/admin/sessions/:id/status', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ status: 'WORKING' }),
      });

      await dashboardApi.getAdminMessagingStatus('session-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/admin/sessions/session-1/status',
        expect.any(Object)
      );
    });

    it('upsertSettingsCredential uses POST /api/v1/settings/credentials', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ id: 'cred-1' }),
      });

      await dashboardApi.upsertSettingsCredential({
        provider: 'shopify',
        displayName: 'Shopify',
        secret: { accessToken: 'token' },
        config: { storeUrl: 'https://example.myshopify.com' },
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/credentials',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('getSettingsShop uses GET /api/v1/settings/shop', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ providers: [] }),
      });

      await dashboardApi.getSettingsShop();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/shop',
        expect.any(Object)
      );
    });

    it('updateSettingsShop uses POST /api/v1/settings/shop', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      await dashboardApi.updateSettingsShop({ provider: 'shopify', enabled: true });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/shop',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('getSettingsQr uses GET /api/v1/settings/qr', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ status: 'connected' }),
      });

      await dashboardApi.getSettingsQr();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/qr',
        expect.any(Object)
      );
    });

    it('updateSettingsQr uses POST /api/v1/settings/qr', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ status: 'preparing' }),
      });

      await dashboardApi.updateSettingsQr({ action: 'login' });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/qr',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('deleteSettingsQr uses DELETE /api/v1/settings/qr', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      await dashboardApi.deleteSettingsQr();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/qr',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('getSettingsDeveloperApi uses GET /api/v1/settings/developer-api', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ key: 'secret' }),
      });

      await dashboardApi.getSettingsDeveloperApi();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/developer-api',
        expect.any(Object)
      );
    });

    it('updateSettingsDeveloperApi uses POST /api/v1/settings/developer-api', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ key: 'secret' }),
      });

      await dashboardApi.updateSettingsDeveloperApi('POST');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/developer-api',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('updateSettingsDeveloperApi uses DELETE /api/v1/settings/developer-api', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      await dashboardApi.updateSettingsDeveloperApi('DELETE');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/developer-api',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('getWebhookInboxActivation uses GET /api/v1/settings/webhook-inbox-activation', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ isActive: false }),
      });

      await dashboardApi.getWebhookInboxActivation();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/webhook-inbox-activation',
        expect.any(Object)
      );
    });

    it('postWebhookInboxActivation uses POST /api/v1/settings/webhook-inbox-activation', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ isActive: true }),
      });

      await dashboardApi.postWebhookInboxActivation();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/webhook-inbox-activation',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('deleteWebhookInboxActivation uses DELETE /api/v1/settings/webhook-inbox-activation', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ isActive: false }),
      });

      await dashboardApi.deleteWebhookInboxActivation();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/webhook-inbox-activation',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('getWebhookInboxSources uses GET /api/v1/settings/webhook-inbox-sources', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ sources: [] }),
      });

      await dashboardApi.getWebhookInboxSources();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/webhook-inbox-sources',
        expect.any(Object)
      );
    });

    it('createWebhookInboxSource uses POST /api/v1/settings/webhook-inbox-sources', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ id: 'source-1' }),
      });

      await dashboardApi.createWebhookInboxSource({
        name: 'Website Chat',
        outboundUrl: 'https://example.com/webhooks',
        outboundHeaders: {},
        inboundSecret: 'secret-1',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/webhook-inbox-sources',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('updateWebhookInboxSource uses PATCH /api/v1/settings/webhook-inbox-sources/:id', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ id: 'source-1' }),
      });

      await dashboardApi.updateWebhookInboxSource('source-1', {
        status: 'disabled',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/settings/webhook-inbox-sources/source-1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('createAgency uses POST /api/v1/agencies', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ id: 'agency-1' }),
      });

      await dashboardApi.createAgency({
        name: 'Acme',
        slug: 'acme',
        plan: 'reseller_basic',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/agencies',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('createWorkflow uses POST /api/v1/workflows', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ id: 'wf-1', name: 'Flow' }),
      });

      await dashboardApi.createWorkflow({ name: 'Flow', description: 'Desc' });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/workflows',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('updateWorkflow uses PATCH /api/v1/workflows/:id', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ id: 'wf-1' }),
      });

      await dashboardApi.updateWorkflow('wf-1', { name: 'New', description: 'Updated' });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/workflows/wf-1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('deleteWorkflow uses DELETE /api/v1/workflows/:id', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      await dashboardApi.deleteWorkflow('wf-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/workflows/wf-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('toggleWorkflow uses POST /api/v1/workflows/:id/toggle', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ isActive: true }),
      });

      await dashboardApi.toggleWorkflow('wf-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/workflows/wf-1/toggle',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('cloneWorkflow uses POST /api/v1/workflows/clone', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ success: true, workflowId: 'wf-1' }),
      });

      await dashboardApi.cloneWorkflow('template-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/workflows/clone',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('createCatalogItem uses POST /api/v1/catalog', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ item: { id: 'item-1' } }),
      });

      await dashboardApi.createCatalogItem({
        payload: {
          name: 'New Service',
          itemType: 'service',
          status: 'needs_review',
          priceAmount: 0,
          durationMinutes: 30,
          isActive: true,
        },
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/catalog',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('updateCatalogItem uses PATCH /api/v1/catalog/:id', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ id: 'item-1' }),
      });

      await dashboardApi.updateCatalogItem('item-1', { name: 'Updated Service' });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/catalog/item-1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('deleteCatalogItem uses DELETE /api/v1/catalog/:id', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      await dashboardApi.deleteCatalogItem('item-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/catalog/item-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('getCatalogAiHelp uses POST /api/v1/catalog/ai-help', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ suggestions: {} }),
      });

      await dashboardApi.getCatalogAiHelp({
        mode: 'all',
        context: {
          itemType: 'service',
          name: 'Sample service',
          currentDescription: 'Current text',
          title: 'Current title',
          description: 'Current description',
        },
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/catalog/ai-help',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('uploadCatalogAsset uses POST /api/v1/catalog/upload with FormData body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ url: 'https://cdn.example.com/img.png' }),
      });

      const formData = new FormData();
      formData.append('file', new Blob(['binary'], { type: 'image/png' }), 'sample.png');

      await dashboardApi.uploadCatalogAsset(formData);

      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit & { headers?: Headers }];
      expect(url).toBe('http://localhost:3001/api/v1/catalog/upload');
      expect(options.method).toBe('POST');
      expect(options.credentials).toBe('include');
      expect(options.body).toBe(formData);
      if (options.headers instanceof Headers) {
        expect(options.headers.get('Content-Type')).toBeNull();
      }
    });

    it('uploadCatalogAsset throws JSON error message for non-ok response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ error: 'upload denied' }),
      });

      const formData = new FormData();
      formData.append('file', new Blob(['binary'], { type: 'image/png' }), 'sample.png');

      await expect(dashboardApi.uploadCatalogAsset(formData)).rejects.toThrow('upload denied');
    });

    it('uploadCatalogAsset throws plain text error for non-ok response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'upload denied plain',
      });

      const formData = new FormData();
      formData.append('file', new Blob(['binary'], { type: 'image/png' }), 'sample.png');

      await expect(dashboardApi.uploadCatalogAsset(formData)).rejects.toThrow('upload denied plain');
    });

    it('uploadCatalogAsset throws on ok response with empty body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => '',
      });

      const formData = new FormData();
      formData.append('file', new Blob(['binary'], { type: 'image/png' }), 'sample.png');

      await expect(dashboardApi.uploadCatalogAsset(formData)).rejects.toThrow('Empty response body');
    });

    it('uploadCatalogAsset returns full response on ok', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ url: '/uploads/x.png', aiAnalysis: [{ name: 'Test' }] }),
      });

      const formData = new FormData();
      formData.append('file', new Blob(['binary'], { type: 'image/png' }), 'sample.png');

      const result = await dashboardApi.uploadCatalogAsset(formData);
      expect(result).toEqual({ url: '/uploads/x.png', aiAnalysis: [{ name: 'Test' }] });
    });

    it('uploadCatalogAsset throws on invalid JSON response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => 'not json',
      });

      const formData = new FormData();
      formData.append('file', new Blob(['binary'], { type: 'image/png' }), 'sample.png');

      await expect(dashboardApi.uploadCatalogAsset(formData)).rejects.toThrow('Failed to parse response as JSON: not json');
    });

    it('getCatalogSettings uses GET /api/v1/catalog/settings', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({
          settings: { businessName: 'Test', currency: 'USD', timezone: 'UTC' },
          storage: { provider: 'imagekit', isActive: true },
          storeUrl: 'https://test.noxivo.app',
        }),
      });

      const result = await dashboardApi.getCatalogSettings();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/catalog/settings',
        expect.any(Object)
      );
      expect(result.settings?.businessName).toBe('Test');
      expect(result.storage?.provider).toBe('imagekit');
      expect(result.storeUrl).toBe('https://test.noxivo.app');
    });

    it('saveCatalogSettings uses POST /api/v1/catalog/settings', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({
          settings: { businessName: 'Updated', currency: 'EUR' },
          storage: { provider: 'imagekit', isActive: true },
        }),
      });

      const result = await dashboardApi.saveCatalogSettings({
        businessName: 'Updated',
        currency: 'EUR',
        timezone: 'Europe/Paris',
        accentColor: '#000000',
        logoUrl: '',
        defaultDuration: 30,
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/catalog/settings',
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.settings?.businessName).toBe('Updated');
    });

    it('getCatalogSettings throws on non-ok response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => '{"error": "server error"}',
      });

      await expect(dashboardApi.getCatalogSettings()).rejects.toThrow('server error');
    });
  });
});
