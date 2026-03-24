import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config";
import prisma from "../lib/prisma";
import { recordAudit } from "../lib/audit";
import { comparePassword, hashPassword, requireAuth, signToken } from "../lib/security";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const ssoExchangeSchema = z.object({
  token: z.string().min(1)
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

const consumedSsoTokens = new Map<string, number>();

function cleanupConsumedSsoTokens(): void {
  const now = Date.now();
  for (const [jti, expiresAt] of consumedSsoTokens.entries()) {
    if (expiresAt <= now) {
      consumedSsoTokens.delete(jti);
    }
  }
}

function markConsumedSsoToken(jti: unknown, exp: unknown): void {
  if (typeof jti !== "string" || typeof exp !== "number") {
    return;
  }

  cleanupConsumedSsoTokens();
  consumedSsoTokens.set(jti, exp * 1000);
}

function serializeUser(user: {
  id: number;
  username: string;
  displayName: string;
  profileLabel: string | null;
  role: "ADMIN" | "USER";
  active: boolean;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    profileLabel: user.profileLabel,
    role: user.role,
    active: user.active
  };
}

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
      user: serializeUser(user)
    };
  });

  app.post("/api/auth/sso/exchange", async (request, reply) => {
    if (!env.ecosystemSso.sharedSecret) {
      return reply.code(404).send({ message: "Login delegado indisponivel." });
    }

    const parsed = ssoExchangeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Token SSO obrigatorio." });
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(parsed.data.token, env.ecosystemSso.sharedSecret, {
        algorithms: ["HS256"],
        issuer: env.ecosystemSso.issuer,
        audience: env.ecosystemSso.audience
      }) as jwt.JwtPayload;
    } catch (error) {
      return reply.code(401).send({ message: "Token SSO invalido ou expirado." });
    }

    if (typeof payload.jti === "string" && consumedSsoTokens.has(payload.jti)) {
      return reply.code(401).send({ message: "Token SSO ja utilizado." });
    }

    const targetLogin = String(payload.targetLogin || "").trim().toLowerCase();
    if (!targetLogin) {
      return reply.code(400).send({ message: "Token SSO sem login de destino." });
    }

    const user = await prisma.user.findUnique({ where: { username: targetLogin } });
    if (!user || !user.active) {
      return reply.code(401).send({ message: "Usuario alvo nao encontrado ou inativo." });
    }

    const ecosystemUsername = String(payload.ecosystemUsername || "").trim().toLowerCase();
    const ecosystemIsAdmin = payload.ecosystemIsAdmin === true;

    if (user.role === "ADMIN" && !ecosystemIsAdmin) {
      return reply.code(403).send({ message: "Usuario do Ecossistema nao pode acessar administrador via SSO." });
    }

    markConsumedSsoToken(payload.jti, payload.exp);

    await recordAudit({
      actorUser: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role
      },
      action: "SSO_LOGIN",
      entityType: "AUTH",
      entityId: user.id,
      summary: `${user.displayName} realizou login via Ecossistema Omega.`,
      before: null,
      after: {
        authenticated: true,
        source: "ecosistema-omega",
        ecosystemUsername: ecosystemUsername || null,
        targetLogin
      }
    });

    return {
      token: signToken({
        userId: user.id,
        username: user.username,
        role: user.role
      }),
      user: serializeUser(user)
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
