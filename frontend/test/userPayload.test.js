import assert from "node:assert/strict";
import test from "node:test";
import { buildUserPayload } from "../src/lib/userPayload.js";

function userForm(overrides = {}) {
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

test("preserva os modulos ao atualizar os paineis de um usuario", () => {
  const payload = buildUserPayload(userForm({ reportIds: [1, 12, 40] }), {
    activeReportIds: new Set([1, 12, 40]),
    extraAllowedReportIds: [40]
  });

  assert.deepEqual(payload.moduleAccess, ["REPORTS_ANALYTICS", "GESTAO_VENDAS_REPORTS"]);
  assert.deepEqual(payload.reportIds, [1, 12, 40]);
});

test("rejeita atualizacao de usuario comum sem moduleAccess", () => {
  const form = userForm();
  delete form.moduleAccess;

  assert.throws(
    () => buildUserPayload(form, { activeReportIds: new Set([1, 12]) }),
    /moduleAccess deve ser informado/
  );
});
