import { dbConnect } from '../../lib/mongodb.js';
import { DashboardConfigModel, type DashboardConfig } from '@noxivo/database';

export interface RegisterDashboardInput {
  agencyId: string;
  dashboardName: string;
  dashboardUrl: string;
  webhookSecret: string;
  apiKey: string;
}

export interface DashboardConfigWithMetadata extends DashboardConfig {
  dashboardName: string;
  dashboardUrl: string;
}

export class DashboardRegistryService {
  async registerDashboard(input: RegisterDashboardInput): Promise<DashboardConfig> {
    await dbConnect();

    const existing = await DashboardConfigModel.findOne({ agencyId: input.agencyId });
    if (existing) {
      throw new Error(`Dashboard with agencyId ${input.agencyId} is already registered`);
    }

    const config = await DashboardConfigModel.create({
      agencyId: input.agencyId,
      dashboardName: input.dashboardName,
      dashboardUrl: input.dashboardUrl,
      webhookSecret: input.webhookSecret,
      apiKey: input.apiKey,
      status: 'active'
    });

    return config;
  }

  async updateDashboard(
    agencyId: string,
    updates: Partial<Pick<DashboardConfig, 'dashboardName' | 'dashboardUrl' | 'webhookSecret' | 'status' | 'metadata'>>
  ): Promise<DashboardConfig | null> {
    await dbConnect();

    const config = await DashboardConfigModel.findOneAndUpdate(
      { agencyId },
      { $set: updates },
      { new: true }
    );

    return config;
  }

  async getDashboardByAgencyId(agencyId: string): Promise<DashboardConfig | null> {
    await dbConnect();
    return DashboardConfigModel.findOne({ agencyId }).lean();
  }

  async getDashboardByApiKey(apiKey: string): Promise<DashboardConfig | null> {
    await dbConnect();
    return DashboardConfigModel.findOne({ apiKey, status: 'active' }).lean();
  }

  async getAllDashboards(): Promise<DashboardConfig[]> {
    await dbConnect();
    return DashboardConfigModel.find({ status: 'active' }).lean();
  }

  async listAllAgencies(): Promise<Array<{ agencyId: string; dashboardName: string; dashboardUrl: string; status: string }>> {
    await dbConnect();
    return DashboardConfigModel.find({ status: 'active' })
      .select('agencyId dashboardName dashboardUrl status')
      .lean();
  }

  async markSynced(agencyId: string): Promise<void> {
    await dbConnect();
    await DashboardConfigModel.updateOne(
      { agencyId },
      { $set: { lastSyncAt: new Date() } }
    );
  }

  async deactivateDashboard(agencyId: string): Promise<void> {
    await dbConnect();
    await DashboardConfigModel.updateOne(
      { agencyId },
      { $set: { status: 'disconnected' } }
    );
  }

  async suspendDashboard(agencyId: string): Promise<void> {
    await dbConnect();
    await DashboardConfigModel.updateOne(
      { agencyId },
      { $set: { status: 'suspended' } }
    );
  }

  async getDashboardForWebhook(agencyId: string): Promise<Pick<DashboardConfig, 'dashboardUrl' | 'webhookSecret'> | null> {
    await dbConnect();
    const config = await DashboardConfigModel.findOne({
      agencyId,
      status: 'active'
    }).select('dashboardUrl webhookSecret').lean();

    if (!config) return null;
    return {
      dashboardUrl: config.dashboardUrl,
      webhookSecret: config.webhookSecret
    };
  }
}

export const dashboardRegistry = new DashboardRegistryService();