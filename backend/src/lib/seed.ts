import prisma from "./prisma";
import { env, resolveAdminBootstrapPassword } from "../config";
import { hashPassword } from "./security";

export async function ensureAdminUser(): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { username: env.adminUsername }
  });

  if (!existing) {
    const passwordHash = await hashPassword(resolveAdminBootstrapPassword());

    await prisma.user.create({
      data: {
        username: env.adminUsername,
        displayName: env.adminDisplayName,
        passwordHash,
        role: "ADMIN",
        active: true
      }
    });
    return;
  }

  if (existing.role !== "ADMIN") {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: "ADMIN",
        active: true
      }
    });
  }
}
