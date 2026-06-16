export const MODULES = [
  {
    key: "MAPPING",
    label: "Mapeamento de painéis",
    path: "/mapping"
  },
  {
    key: "REPORTS_ANALYTICS",
    label: "Relatórios",
    path: "/reports-analytics"
  },
  {
    key: "AUDIT",
    label: "Auditoria",
    path: "/audit"
  }
];

export function hasModuleAccess(user, moduleKey) {
  return user?.role === "ADMIN" || (user?.moduleAccess || []).includes(moduleKey);
}
