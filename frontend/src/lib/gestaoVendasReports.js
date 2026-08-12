export const PROFILE_ORDER = ["diretoria", "coordenador", "supervisor", "vendedor", "outros", "sem_perfil"];
export const HIERARCHICAL_PROFILES = new Set(["coordenador", "supervisor", "vendedor"]);
export const PROFILE_META = {
  diretoria: { label: "Diretoria", color: "#2f7df6", soft: "#e8f1ff" },
  coordenador: { label: "Coordenador", color: "#16875f", soft: "#e2f5ed" },
  supervisor: { label: "Supervisor", color: "#ee9b16", soft: "#fff3dd" },
  vendedor: { label: "Vendedor", color: "#e6495d", soft: "#ffe9ec" },
  outros: { label: "Outros", color: "#7c5ac9", soft: "#f0ebff" },
  sem_perfil: { label: "Sem perfil", color: "#667085", soft: "#eef1f6" }
};
export const EMPTY_REPORT = {
  active_users: 0,
  total_logins: 0,
  active_users_details: [],
  logins_by_user: [],
  logins_by_profile: [],
  logins_by_user_by_profile: [],
  logins_by_hour_by_profile: [],
  logins_by_hour_users: [],
  logins_by_weekday_by_profile: [],
  logins_by_weekday_users: [],
  module_opens_by_module: [],
  module_users_by_module: [],
  module_users_by_user: []
};

export function mergeReport(report) { return { ...EMPTY_REPORT, ...(report || {}) }; }
export function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
export function shiftDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
export function rangeForPreset(preset, now = new Date()) {
  const today = localDateKey(now);
  if (preset === "yesterday") { const yesterday = shiftDateKey(today, -1); return { start: yesterday, end: yesterday }; }
  if (preset === "7d") return { start: shiftDateKey(today, -6), end: today };
  if (preset === "month") return { start: `${today.slice(0, 7)}-01`, end: today };
  return { start: today, end: today };
}
export function rangeToIso(startKey, endKey) {
  return { start: new Date(`${startKey}T00:00:00.000-03:00`).toISOString(), end: new Date(`${endKey}T23:59:59.999-03:00`).toISOString() };
}
export function aggregateGroups(groups = []) {
  const combined = new Map();
  for (const group of groups) for (const item of group.items || []) combined.set(item.label, (combined.get(item.label) || 0) + Number(item.value || 0));
  return [...combined.entries()].map(([label, value]) => ({ label, value }));
}
export function sortedHours(groups = []) { return aggregateGroups(groups).sort((a, b) => parseInt(a.label, 10) - parseInt(b.label, 10)); }
const WEEKDAY_ORDER = { Segunda: 1, Terca: 2, "Terça": 2, Quarta: 3, Quinta: 4, Sexta: 5, Sabado: 6, "Sábado": 6, Domingo: 7 };
export function sortedWeekdays(groups = []) { return aggregateGroups(groups).sort((a, b) => (WEEKDAY_ORDER[a.label] || 99) - (WEEKDAY_ORDER[b.label] || 99)); }
export function groupItems(groups = [], label) { return groups.find((group) => group.label === label)?.items || []; }
export function profileSlugFromLabel(label = "") {
  const value = label.toLocaleLowerCase("pt-BR");
  if (value.includes("diretoria")) return "diretoria";
  if (value.includes("coorden")) return "coordenador";
  if (value.includes("supervis")) return "supervisor";
  if (value.includes("vendedor")) return "vendedor";
  if (value.includes("outros")) return "outros";
  return "sem_perfil";
}
export function initials(label = "") {
  const parts = label.replace(/^\S+\s+-\s+/, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "--";
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase();
}
export function formatCount(value) { return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value || 0)); }
export function formatPercent(value) { return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(Number(value || 0)); }
export function formatDateKey(value) { if (!value) return ""; const [year, month, day] = value.split("-"); return `${day}/${month}/${year}`; }
