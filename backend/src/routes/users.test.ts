import assert from "node:assert/strict";
import test from "node:test";
import { updateUserSchema } from "./users";

function userPayload(overrides: Record<string, unknown> = {}) {
  return {
    username: "henrique",
    displayName: "Henrique",
    profileLabel: "Diretoria",
    password: "",
    role: "USER",
    active: true,
    reportIds: [1, 12],
    moduleAccess: ["REPORTS_ANALYTICS", "GESTAO_VENDAS_REPORTS"],
    filterRules: [],
    ...overrides
  };
}

test("aceita uma atualizacao de usuario com moduleAccess explicito", () => {
  assert.equal(updateUserSchema.safeParse(userPayload()).success, true);
});

test("rejeita uma atualizacao de usuario sem moduleAccess", () => {
  const payload = userPayload();
  delete payload.moduleAccess;

  assert.equal(updateUserSchema.safeParse(payload).success, false);
});
