import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import type { LoopMessage, LoopMessageList, Notification, NotificationList } from "@loop/contracts";

type MessageRow = { id: string; subject: string; body: string; createdAt: Date; readAt: Date | null };
type NotificationRow = { id: string; kind: string; title: string; body: string; target: string | null; createdAt: Date; readAt: Date | null };

const toMessage = (r: MessageRow): LoopMessage => ({ id: r.id, subject: r.subject, body: r.body, createdAt: r.createdAt.toISOString(), read: r.readAt !== null });
const toNotification = (r: NotificationRow): Notification => ({
  id: r.id,
  kind: r.kind as Notification["kind"],
  title: r.title,
  body: r.body,
  target: r.target,
  createdAt: r.createdAt.toISOString(),
  read: r.readAt !== null,
});

const PAGE = 50;

/**
 * My LOOP inbox. Two separate stores: one-way LOOP team messages (read/unread) and system notifications (reminders,
 * confirmations, security). There is no reply path and no recruiter chat.
 */
@Injectable()
export class InboxService {
  async messages(contractorId: string): Promise<LoopMessageList> {
    const [rows, unreadCount] = await Promise.all([
      prisma.loopMessage.findMany({ where: { contractorId }, orderBy: { createdAt: "desc" }, take: PAGE }),
      prisma.loopMessage.count({ where: { contractorId, readAt: null } }),
    ]);
    return { items: rows.map(toMessage), unreadCount };
  }

  async markMessageRead(contractorId: string, id: string, now = new Date()): Promise<LoopMessage> {
    await prisma.loopMessage.updateMany({ where: { id, contractorId, readAt: null }, data: { readAt: now } });
    const row = await prisma.loopMessage.findFirst({ where: { id, contractorId } });
    if (!row) throw new NotFoundException("Message not found");
    return toMessage(row);
  }

  /** For the Admin portal (later phase): one-way message from the LOOP team. */
  async sendMessage(contractorId: string, subject: string, body: string, sentBy: string | null): Promise<LoopMessage> {
    return toMessage(await prisma.loopMessage.create({ data: { contractorId, subject, body, sentBy } }));
  }

  /** Records a system notification (reminder sent, availability confirmed, security event). */
  async notify(contractorId: string, kind: Notification["kind"], title: string, body: string, target: string | null = null): Promise<void> {
    await prisma.notification.create({ data: { contractorId, kind, title, body, target } });
  }

  async notifications(contractorId: string): Promise<NotificationList> {
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where: { contractorId }, orderBy: { createdAt: "desc" }, take: PAGE }),
      prisma.notification.count({ where: { contractorId, readAt: null } }),
    ]);
    return { items: rows.map(toNotification), unreadCount };
  }

  async markNotificationRead(contractorId: string, id: string, now = new Date()): Promise<Notification> {
    await prisma.notification.updateMany({ where: { id, contractorId, readAt: null }, data: { readAt: now } });
    const row = await prisma.notification.findFirst({ where: { id, contractorId } });
    if (!row) throw new NotFoundException("Notification not found");
    return toNotification(row);
  }
}
