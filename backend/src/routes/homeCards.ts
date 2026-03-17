import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../lib/prisma";
import { recordAudit } from "../lib/audit";
import { requireAdmin, requireAuth } from "../lib/security";
import { env } from "../config";

const homeCardSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  imageUrl: z.string().min(1).optional().nullable().or(z.literal("")),
  actionLabel: z.string().optional().nullable(),
  actionUrl: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  userIds: z.array(z.number().int().positive()).default([])
});

function serializeHomeCard(card: {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  actionLabel: string | null;
  actionUrl: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  accesses?: Array<{ userId: number; user?: { id: number; displayName: string; active: boolean } }>;
}) {
  return {
    id: card.id,
    title: card.title,
    description: card.description,
    imageUrl: card.imageUrl,
    actionLabel: card.actionLabel,
    actionUrl: card.actionUrl,
    sortOrder: card.sortOrder,
    active: card.active,
    createdAt: card.createdAt,
    userIds: (card.accesses || []).map((access) => access.userId),
    users: (card.accesses || [])
      .map((access) => access.user)
      .filter(Boolean)
      .map((user) => ({
        id: user!.id,
        displayName: user!.displayName,
        active: user!.active
      }))
  };
}

function normalizeImageUrl(value?: string | null) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function normalizeActionUrl(value?: string | null) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

export async function registerHomeCardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/home-cards", { preHandler: [requireAuth] }, async (request) => {
    const where =
      request.authUser?.role === "ADMIN"
        ? {}
        : {
            active: true,
            accesses: {
              some: {
                userId: request.authUser?.userId
              }
            }
          };

    const cards = await (prisma as any).homeCard.findMany({
      where,
      include: {
        accesses: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                active: true
              }
            }
          },
          orderBy: {
            user: {
              displayName: "asc"
            }
          }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
    });

    return {
      cards: cards.map(serializeHomeCard)
    };
  });

  app.post("/api/home-cards/upload-preview", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ message: "Arquivo nao enviado." });
    }

    if (!file.mimetype.startsWith("image/")) {
      return reply.code(400).send({ message: "Envie apenas imagens." });
    }

    const extension = path.extname(file.filename || "") || `.${file.mimetype.split("/")[1] || "png"}`;
    const safeName = `${Date.now()}-${crypto.randomUUID()}${extension.toLowerCase()}`;
    const absoluteFilePath = path.join(env.previewsDir, safeName);
    await fs.mkdir(env.previewsDir, { recursive: true });
    await pipeline(file.file, createWriteStream(absoluteFilePath));

    return {
      imageUrl: `/previews/${safeName}`
    };
  });

  app.post("/api/home-cards", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsed = homeCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: parsed.error.issues[0]?.message || "Dados do card invalidos." });
    }

    const authUser = request.authUser;
    const card = await prisma.$transaction(async (tx: any) => {
      const created = await (tx as any).homeCard.create({
        data: {
          title: parsed.data.title.trim(),
          description: parsed.data.description?.trim() || null,
          imageUrl: normalizeImageUrl(parsed.data.imageUrl),
          actionLabel: parsed.data.actionLabel?.trim() || null,
          actionUrl: normalizeActionUrl(parsed.data.actionUrl),
          sortOrder: parsed.data.sortOrder,
          active: parsed.data.active,
          accesses: {
            create: parsed.data.userIds.map((userId) => ({
              userId
            }))
          }
        },
        include: {
          accesses: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  active: true
                }
              }
            }
          }
        }
      });

      await recordAudit(
        {
          actor: authUser,
          action: "CREATE_HOME_CARD",
          entityType: "HOME_CARD",
          entityId: created.id,
          summary: `Card inicial ${created.title} foi criado.`,
          before: null,
          after: serializeHomeCard(created)
        },
        tx
      );

      return created;
    });

    return reply.code(201).send({ card: serializeHomeCard(card) });
  });

  app.put("/api/home-cards/:id", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const cardId = Number((request.params as { id?: string })?.id);
    if (!Number.isInteger(cardId) || cardId <= 0) {
      return reply.code(400).send({ message: "Card invalido." });
    }

    const parsed = homeCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: parsed.error.issues[0]?.message || "Dados do card invalidos." });
    }

    const current = await (prisma as any).homeCard.findUnique({
      where: { id: cardId },
      include: {
        accesses: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                active: true
              }
            }
          }
        }
      }
    });
    if (!current) {
      return reply.code(404).send({ message: "Card nao encontrado." });
    }

    const authUser = request.authUser;
    const before = serializeHomeCard(current);
    const card = await prisma.$transaction(async (tx: any) => {
      const updated = await (tx as any).homeCard.update({
        where: { id: cardId },
        data: {
          title: parsed.data.title.trim(),
          description: parsed.data.description?.trim() || null,
          imageUrl: normalizeImageUrl(parsed.data.imageUrl),
          actionLabel: parsed.data.actionLabel?.trim() || null,
          actionUrl: normalizeActionUrl(parsed.data.actionUrl),
          sortOrder: parsed.data.sortOrder,
          active: parsed.data.active,
          accesses: {
            deleteMany: {},
            create: parsed.data.userIds.map((userId) => ({
              userId
            }))
          }
        },
        include: {
          accesses: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  active: true
                }
              }
            }
          }
        }
      });

      await recordAudit(
        {
          actor: authUser,
          action: "UPDATE_HOME_CARD",
          entityType: "HOME_CARD",
          entityId: updated.id,
          summary: `Card inicial ${updated.title} foi atualizado.`,
          before,
          after: serializeHomeCard(updated)
        },
        tx
      );

      return updated;
    });

    return { card: serializeHomeCard(card) };
  });
}
