import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../lib/prisma";
import { recordAudit } from "../lib/audit";
import { requireAdmin, requireAuth } from "../lib/security";

const homeCardSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  imageUrl: z.string().url("Imagem invalida.").optional().nullable().or(z.literal("")),
  actionLabel: z.string().optional().nullable(),
  actionUrl: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true)
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
    createdAt: card.createdAt
  };
}

export async function registerHomeCardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/home-cards", { preHandler: [requireAuth] }, async (request) => {
    const where = request.authUser?.role === "ADMIN" ? {} : { active: true };

    const cards = await (prisma as any).homeCard.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
    });

    return {
      cards: cards.map(serializeHomeCard)
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
          imageUrl: parsed.data.imageUrl?.trim() || null,
          actionLabel: parsed.data.actionLabel?.trim() || null,
          actionUrl: parsed.data.actionUrl?.trim() || null,
          sortOrder: parsed.data.sortOrder,
          active: parsed.data.active
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
      where: { id: cardId }
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
          imageUrl: parsed.data.imageUrl?.trim() || null,
          actionLabel: parsed.data.actionLabel?.trim() || null,
          actionUrl: parsed.data.actionUrl?.trim() || null,
          sortOrder: parsed.data.sortOrder,
          active: parsed.data.active
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
