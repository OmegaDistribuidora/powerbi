import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config";
import type { AppUserRole, AuthUser } from "../types";

const TOKEN_REFRESH_WINDOW_MS = 15 * 60 * 1000;

type JwtPayload = {
  userId: number;
  username: string;
  role: AppUserRole;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"]
  });
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, env.jwtSecret) as AuthUser;
}

function shouldRefreshToken(authUser: AuthUser): boolean {
  if (typeof authUser.exp !== "number") {
    return false;
  }

  const expiresAt = authUser.exp * 1000;
  return expiresAt - Date.now() <= TOKEN_REFRESH_WINDOW_MS;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = request.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    reply.code(401).send({ message: "Token ausente." });
    return;
  }

  try {
    request.authUser = verifyToken(token);
    if (request.authUser && shouldRefreshToken(request.authUser)) {
      request.renewedAuthToken = signToken({
        userId: request.authUser.userId,
        username: request.authUser.username,
        role: request.authUser.role
      });
    }
  } catch (error) {
    reply.code(401).send({ message: "Token invalido." });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.authUser) {
    reply.code(401).send({ message: "Usuario nao autenticado." });
    return;
  }

  if (request.authUser.role !== "ADMIN") {
    reply.code(403).send({ message: "Acesso restrito ao administrador." });
  }
}
