import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../lib/prisma";
import { recordAudit } from "../lib/audit";
import { comparePassword, hashPassword, requireAuth, signToken } from "../lib/security";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const changePasswordSchema = z
  .object({
    targetUserId: z.number().int().positive().optional(),
    currentPassword: z.string().optional().default(""),
    newPassword: z.string().min(6),
    confirmPassword: z.string().min(6)
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "A confirmacao da senha nao confere.",
    path: ["confirmPassword"]
  });

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Usuario e senha sao obrigatorios." });
    }

    const username = parsed.data.username.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || !user.active) {
      return reply.code(401).send({ message: "Credenciais invalidas." });
    }

    const validPassword = await comparePassword(parsed.data.password, user.passwordHash);
    if (!validPassword) {
      return reply.code(401).send({ message: "Credenciais invalidas." });
    }

    await recordAudit({
      actorUser: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role
      },
      action: "LOGIN",
      entityType: "AUTH",
      entityId: user.id,
      summary: `${user.displayName} realizou login.`,
      before: null,
      after: {
        authenticated: true
      }
    });

    return {
      token: signToken({
        userId: user.id,
        username: user.username,
        role: user.role
      }),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        profileLabel: user.profileLabel,
        role: user.role,
        active: user.active
      }
    };
  });

  app.get("/api/auth/me", { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ message: "Usuario nao autenticado." });
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        profileLabel: true,
        role: true,
        active: true,
        createdAt: true
      }
    });

    if (!user || !user.active) {
      return reply.code(404).send({ message: "Usuario nao encontrado." });
    }

    return { user };
  });

  app.post("/api/auth/change-password", { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ message: "Usuario nao autenticado." });
    }

    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: parsed.error.issues[0]?.message || "Dados invalidos." });
    }

    const isAdmin = authUser.role === "ADMIN";
    const targetUserId = parsed.data.targetUserId ?? authUser.userId;
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) {
      return reply.code(404).send({ message: "Usuario nao encontrado." });
    }

    if (!isAdmin) {
      const validPassword = await comparePassword(parsed.data.currentPassword, user.passwordHash);
      if (!validPassword) {
        return reply.code(400).send({ message: "Senha atual incorreta." });
      }
    }

    const nextPasswordHash = await hashPassword(parsed.data.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: nextPasswordHash }
    });

    await recordAudit({
      actor: authUser,
      actorUser: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role
      },
      action: isAdmin && targetUserId !== authUser.userId ? "ADMIN_CHANGE_PASSWORD" : "CHANGE_PASSWORD",
      entityType: "USER",
      entityId: user.id,
      summary:
        isAdmin && targetUserId !== authUser.userId
          ? `${authUser.username} redefiniu a senha de ${user.displayName}.`
          : `${user.displayName} alterou a propria senha.`,
      before: {
        password: "[redacted]"
      },
      after: {
        password: "[redacted]"
      }
    });

    return { message: "Senha alterada com sucesso." };
  });
}
