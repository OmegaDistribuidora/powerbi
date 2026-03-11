import { Prisma, PrismaClient } from "@prisma/client";
import prisma from "./prisma";
import type { AppUserRole, AuthUser } from "../types";

type AuditPrismaClient = PrismaClient | Prisma.TransactionClient;

type AuditSnapshotUser = {
  id: number;
  username: string;
  displayName: string;
  role: AppUserRole;
};

type AuditEvent = {
  actor?: AuthUser | null;
  actorUser?: AuditSnapshotUser | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  summary: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
};

export function buildActorSnapshot({
  actor,
  actorUser
}: {
  actor?: AuthUser | null;
  actorUser?: AuditSnapshotUser | null;
}) {
  return {
    actorUserId: actor?.userId ?? actorUser?.id,
    actorUsername: actor?.username ?? actorUser?.username,
    actorDisplayName: actorUser?.displayName,
    actorRole: actor?.role ?? actorUser?.role
  };
}

function normalizeJson(value: Prisma.InputJsonValue | null) {
  return value === null ? Prisma.JsonNull : value;
}

export async function recordAudit(event: AuditEvent, client: AuditPrismaClient = prisma): Promise<void> {
  const actorSnapshot = buildActorSnapshot({
    actor: event.actor,
    actorUser: event.actorUser
  });

  const data: Prisma.AuditLogUncheckedCreateInput = {
    action: event.action,
    entityType: event.entityType,
    summary: event.summary,
    ...(actorSnapshot.actorUserId != null ? { actorUserId: actorSnapshot.actorUserId } : {}),
    ...(actorSnapshot.actorUsername ? { actorUsername: actorSnapshot.actorUsername } : {}),
    ...(actorSnapshot.actorDisplayName ? { actorDisplayName: actorSnapshot.actorDisplayName } : {}),
    ...(actorSnapshot.actorRole ? { actorRole: actorSnapshot.actorRole } : {}),
    ...(event.entityId != null ? { entityId: String(event.entityId) } : {}),
    ...(event.before !== undefined ? { before: normalizeJson(event.before) } : {}),
    ...(event.after !== undefined ? { after: normalizeJson(event.after) } : {}),
    ...(event.metadata !== undefined ? { metadata: normalizeJson(event.metadata) } : {})
  };

  await client.auditLog.create({ data });
}
