import type { FastifyReply, FastifyRequest } from "fastify";
import prisma from "./prisma";

export const MODULE_KEYS = ["REPORTS_ANALYTICS", "MAPPING", "AUDIT"] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  REPORTS_ANALYTICS: "Relatorios",
  MAPPING: "Mapeamento de paineis",
  AUDIT: "Auditoria"
};

export function normalizeModuleAccess(modules: unknown): ModuleKey[] {
  const allowed = new Set<ModuleKey>(MODULE_KEYS);
  const unique = new Set<ModuleKey>();

  if (Array.isArray(modules)) {
    modules.forEach((module) => {
      if (allowed.has(module as ModuleKey)) {
        unique.add(module as ModuleKey);
      }
    });
  }

  return Array.from(unique);
}

export function serializeModuleAccess(
  role: "ADMIN" | "USER",
  moduleAccesses?: Array<{ module: ModuleKey | string }>
): ModuleKey[] {
  if (role === "ADMIN") {
    return [...MODULE_KEYS];
  }

  return normalizeModuleAccess((moduleAccesses || []).map((access) => access.module));
}

export function requireModuleAccess(module: ModuleKey) {
  return async function moduleAccessGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authUser = request.authUser;
    if (!authUser) {
      reply.code(401).send({ message: "Usuario nao autenticado." });
      return;
    }

    if (authUser.role === "ADMIN") {
      return;
    }

    const access = await (prisma as any).userModuleAccess.findUnique({
      where: {
        userId_module: {
          userId: authUser.userId,
          module
        }
      }
    });

    if (!access) {
      reply.code(403).send({ message: "Sem acesso a este modulo." });
    }
  };
}
