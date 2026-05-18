// =============================================================================
// Notifications - service in-app + (futur) email/SMS
// =============================================================================
// V0 : insertion dans la table `Notification`. Le job d'envoi email/SMS sera
// implemente en session M9 (cron qui lit les notifications PENDING channel
// EMAIL/SMS et les envoie via nodemailer / Twilio).
// =============================================================================

import {
  NotificationChannel,
  NotificationStatus,
  RoleCode,
  prisma,
} from '@reliance-finance/database';

export interface NotificationInput {
  userId: string;
  channel?: NotificationChannel;
  title: string;
  body?: string;
  linkUrl?: string;
  entityType?: string;
  entityId?: string;
}

export async function sendNotification(input: NotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      channel: input.channel ?? NotificationChannel.IN_APP,
      status: NotificationStatus.PENDING,
      title: input.title,
      body: input.body,
      linkUrl: input.linkUrl,
      entityType: input.entityType,
      entityId: input.entityId,
    },
  });
}

/**
 * Notifie tous les utilisateurs ayant un role donne sur la Holding active.
 * Utilise pour : changements RIB -> DFG, anomalies critiques -> Controleur Interne.
 */
export async function notifyHoldingRole(
  role: RoleCode,
  payload: Omit<NotificationInput, 'userId'>,
) {
  const targets = await prisma.membership.findMany({
    where: {
      role,
      isActive: true,
      entity: { kind: 'HOLDING', isActive: true },
    },
    select: { userId: true },
  });

  const unique = Array.from(new Set(targets.map((m) => m.userId)));
  await Promise.all(
    unique.map((userId) =>
      sendNotification({ ...payload, userId }).catch(() => undefined),
    ),
  );
  return unique.length;
}
