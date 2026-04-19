import { NextResponse } from 'next/server';
import { getCurrentSession } from '../../../lib/auth/session';
import { NotificationModel } from '@noxivo/database';
import dbConnect from '../../../lib/mongodb';

export async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await dbConnect();

    const tenantId = session.actor.tenantId;
    const agencyId = session.actor.agencyId;

    if (!tenantId || !agencyId) {
      return NextResponse.json({ error: 'No tenant scope' }, { status: 400 });
    }

    const notifications = await NotificationModel.find({
      agencyId,
      tenantId
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .exec();

    const unreadCount = await NotificationModel.countDocuments({
      agencyId,
      tenantId,
      isRead: false
    });

    return NextResponse.json({
      notifications: notifications.map(n => ({
        id: n._id.toString(),
        type: n.type,
        title: n.title,
        message: n.message,
        severity: n.severity,
        isRead: n.isRead,
        createdAt: n.createdAt,
        workflowName: n.workflowName,
        nodeId: n.nodeId
      })),
      unreadCount
    });
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, notificationId } = body;

    await dbConnect();

    const tenantId = session.actor.tenantId;
    const agencyId = session.actor.agencyId;

    if (!tenantId || !agencyId) {
      return NextResponse.json({ error: 'No tenant scope' }, { status: 400 });
    }

    if (action === 'markAsRead' && notificationId) {
      await NotificationModel.findOneAndUpdate(
        { _id: notificationId, agencyId, tenantId },
        { isRead: true, readAt: new Date() }
      );
    } else if (action === 'markAllAsRead') {
      await NotificationModel.updateMany(
        { agencyId, tenantId, isRead: false },
        { isRead: true, readAt: new Date() }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update notification:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
