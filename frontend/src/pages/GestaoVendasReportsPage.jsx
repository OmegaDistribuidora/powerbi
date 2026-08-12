import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AppWindow, ArrowLeft, BarChart3, CalendarDays, ChevronDown, ChevronRight, Clock3,
  Filter, LayoutDashboard, LoaderCircle, LogIn, RefreshCw, Search, ShieldCheck, Users, X
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";
import { apiJson } from "../services/api";
import {
  EMPTY_REPORT, HIERARCHICAL_PROFILES, PROFILE_META, PROFILE_ORDER, formatCount, formatDateKey,
  formatPercent, groupItems, initials, mergeReport, profileSlugFromLabel, rangeForPreset,
  rangeToIso, sortedHours, sortedWeekdays
} from "../lib/gestaoVendasReports";
import "../styles/gestao-vendas-reports.css";

const TABS = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "users", label: "Usuários", icon: Users },
  { id: "modules", label: "Módulos", icon: AppWindow },
  { id: "hours", label: "Horários", icon: Clock3 },
  { id: "weekdays", label: "Dias", icon: CalendarDays }
];
const PERIODS = [
  { id: "today", label: "Hoje" }, { id: "yesterday", label: "Ontem" },
  { id: "7d", label: "7 dias" }, { id: "month", label: "Mês atual" }
];

export default function GestaoVendasReportsPage() {
  const { token, user } = useAuth();
  const [entered, setEntered] = useState(false);
  if (!entered) {
    return (
      <div className="gv-welcome">
        <Link className="gv-welcome-back" to="/"><ArrowLeft size={17} /> Voltar ao Power BI</Link>
        <section className="gv-welcome-brand">
          <img src="/gestao-vendas-logo.png" alt="Gestão de Vendas" />
          <span>Inteligência de uso</span>
          <h1>Relatórios do Gestão de Vendas</h1>
          <p>Acompanhe acessos, módulos utilizados, perfis ativos e horários de uso do aplicativo.</p>
          <div><ShieldCheck size={19} /> Acesso protegido pelo Ecossistema Omega</div>
        </section>
        <section className="gv-welcome-card">
          <div className="gv-welcome-icon"><ShieldCheck size={27} /></div>
          <span>ACESSO INTEGRADO</span>
          <h2>Bem-vindo(a), {user?.displayName || user?.username || "usuário"}</h2>
          <p>Sua identidade e sua permissão para este módulo já foram confirmadas.</p>
          <button type="button" onClick={() => setEntered(true)}><LogIn size={18} /> Entrar e ver os relatórios</button>
        </section>
      </div>
    );
  }
  return <ReportsDashboard token={token} user={user} />;
}

function ReportsDashboard({ token, user }) {
  const initialRange = rangeForPreset("today");
  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState("today");
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [users, setUsers] = useState([]);
  const [report, setReport] = useState(EMPTY_REPORT);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedCoordinator, setSelectedCoordinator] = useState("");
  const [selectedProfiles, setSelectedProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const requestSequence = useRef(0);
  const coordinatorEnabled = !selectedProfiles.length || selectedProfiles.every((slug) => HIERARCHICAL_PROFILES.has(slug));
  const coordinators = useMemo(() => users.filter((item) => item.profileSlug === "coordenador" && item.code), [users]);
  const availableProfiles = useMemo(() => {
    const present = new Set(users.map((item) => item.profileSlug));
    return PROFILE_ORDER.filter((slug) => present.has(slug) && (!selectedCoordinator || HIERARCHICAL_PROFILES.has(slug)));
  }, [users, selectedCoordinator]);

  const loadUsers = useCallback(async () => {
    const payload = await apiJson("/gestao-vendas-reports/users", { token });
    setUsers(payload.users || []);
  }, [token]);
  const loadReport = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true); setError("");
    try {
      const iso = rangeToIso(startDate, endDate);
      const params = new URLSearchParams({ start: iso.start, end: iso.end });
      if (selectedUserId) params.set("userId", selectedUserId);
      if (coordinatorEnabled && selectedCoordinator) params.set("coordinatorCode", selectedCoordinator);
      if (selectedProfiles.length) params.set("profileSlugs", selectedProfiles.join(","));
      const payload = await apiJson(`/gestao-vendas-reports/usage?${params}`, { token });
      if (sequence !== requestSequence.current) return;
      setReport(mergeReport(payload.report)); setLastUpdated(new Date());
    } catch (requestError) {
      if (sequence === requestSequence.current) setError(requestError.message || "Não foi possível carregar o relatório.");
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [token, startDate, endDate, selectedUserId, selectedCoordinator, selectedProfiles, coordinatorEnabled]);

  useEffect(() => { loadUsers().catch((requestError) => setError(requestError.message)); }, [loadUsers]);
  useEffect(() => { const timer = window.setTimeout(loadReport, 100); return () => window.clearTimeout(timer); }, [loadReport]);
  useEffect(() => { const timer = window.setInterval(() => document.visibilityState === "visible" && loadReport(), 5 * 60 * 1000); return () => window.clearInterval(timer); }, [loadReport]);

  function choosePeriod(next) { const range = rangeForPreset(next); setPeriod(next); setStartDate(range.start); setEndDate(range.end); }
  function toggleProfile(slug) {
    setSelectedProfiles((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]);
    if (!HIERARCHICAL_PROFILES.has(slug)) setSelectedCoordinator("");
  }
  function chooseCoordinator(value) {
    setSelectedCoordinator(value);
    if (value) setSelectedProfiles((current) => current.filter((slug) => HIERARCHICAL_PROFILES.has(slug)));
  }
  const selectedUser = users.find((item) => item.id === selectedUserId);
  const activeFilters = Number(Boolean(selectedUserId)) + Number(Boolean(selectedCoordinator)) + selectedProfiles.length;

  return (
    <div className="gv-reports">
      <aside className="gv-sidebar">
        <div className="gv-brand"><img src="/gestao-vendas-logo.png" alt="" /><div><strong>Gestão de Vendas</strong><span>Relatórios de uso</span></div></div>
        <nav>{TABS.map((item) => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><Icon size={19} /> {item.label}</button>; })}</nav>
        <footer><div className="gv-sidebar-user"><Avatar label={user?.displayName || user?.username} /><span><strong>{user?.displayName || user?.username}</strong><small>{user?.profileLabel || (user?.role === "ADMIN" ? "Administrador" : "Usuário")}</small></span></div><Link to="/"><ArrowLeft size={17} /> Voltar ao Power BI</Link></footer>
      </aside>
      <main className="gv-workspace">
        <header className="gv-header">
          <div><span>PAINEL ADMINISTRATIVO</span><h1>{TABS.find((item) => item.id === tab)?.label}</h1></div>
          <div>{lastUpdated && <small>Atualizado {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>}<button onClick={() => Promise.all([loadUsers(), loadReport()])} disabled={loading}><RefreshCw className={loading ? "gv-spin" : ""} size={17} /> Atualizar</button></div>
        </header>
        <section className="gv-dashboard-content">
          <FilterPanel {...{ period, startDate, endDate, users, selectedUser, coordinators, selectedCoordinator, coordinatorEnabled, availableProfiles, selectedProfiles, activeFilters, choosePeriod, chooseCoordinator, toggleProfile }} setStartDate={(value) => { setPeriod("custom"); setStartDate(value); }} setEndDate={(value) => { setPeriod("custom"); setEndDate(value); }} setSelectedUserId={setSelectedUserId} clearFilters={() => { setSelectedUserId(""); setSelectedCoordinator(""); setSelectedProfiles([]); }} />
          <div className="gv-period"><CalendarDays size={16} /> Dados de <strong>{formatDateKey(startDate)}</strong> até <strong>{formatDateKey(endDate)}</strong><span>· Horário de Brasília (UTC-3)</span></div>
          {error && <div className="gv-error">{error}</div>}
          <div className={`gv-report-area ${loading ? "loading" : ""}`}>
            {tab === "overview" && <Overview report={report} />}
            {tab === "users" && <UsersView report={report} />}
            {tab === "modules" && <ModulesView report={report} />}
            {tab === "hours" && <HoursView report={report} />}
            {tab === "weekdays" && <WeekdaysView report={report} />}
            {loading && <div className="gv-loading"><LoaderCircle className="gv-spin" size={27} /> Atualizando relatório...</div>}
          </div>
        </section>
      </main>
    </div>
  );
}

function FilterPanel(props) {
  const [query, setQuery] = useState(""); const [open, setOpen] = useState(false);
  const filtered = useMemo(() => { const term = query.trim().toLocaleLowerCase("pt-BR"); return props.users.filter((user) => !term || `${user.label} ${user.profileName}`.toLocaleLowerCase("pt-BR").includes(term)).slice(0, 20); }, [props.users, query]);
  return <section className="gv-filters">
    <header><div><Filter size={18} /><strong>Filtros do relatório</strong></div>{props.activeFilters > 0 && <button onClick={props.clearFilters}><X size={14} /> Limpar filtros</button>}</header>
    <div className="gv-periods">{PERIODS.map((item) => <button key={item.id} className={props.period === item.id ? "active" : ""} onClick={() => props.choosePeriod(item.id)}>{item.label}</button>)}<label>De<input type="date" value={props.startDate} max={props.endDate} onChange={(event) => props.setStartDate(event.target.value)} /></label><label>Até<input type="date" value={props.endDate} min={props.startDate} onChange={(event) => props.setEndDate(event.target.value)} /></label></div>
    <div className="gv-filter-grid">
      <label><span>Coordenador</span><select value={props.selectedCoordinator} onChange={(event) => props.chooseCoordinator(event.target.value)} disabled={!props.coordinatorEnabled}><option value="">Todos</option>{props.coordinators.map((user) => <option key={user.id} value={user.code}>{user.label}</option>)}</select><small>{!props.coordinatorEnabled ? "Indisponível para o perfil escolhido." : ""}</small></label>
      <label><span>Perfis</span><details><summary>{props.selectedProfiles.length ? `${props.selectedProfiles.length} selecionado(s)` : "Todos"}<ChevronDown size={15} /></summary><div className="gv-profile-menu">{props.availableProfiles.map((slug) => <label key={slug}><input type="checkbox" checked={props.selectedProfiles.includes(slug)} onChange={() => props.toggleProfile(slug)} /><i style={{ background: PROFILE_META[slug]?.color }} />{PROFILE_META[slug]?.label || slug}</label>)}</div></details></label>
      <label className="gv-user-filter"><span>Usuário</span><div><Search size={15} /><input value={open ? query : props.selectedUser?.label || ""} placeholder="Todos os usuários" onFocus={() => { setOpen(true); setQuery(""); }} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} />{props.selectedUser && <button onClick={() => props.setSelectedUserId("")}><X size={14} /></button>}</div>{open && <section className="gv-user-results"><button onMouseDown={(event) => event.preventDefault()} onClick={() => { props.setSelectedUserId(""); setOpen(false); }}>Todos os usuários</button>{filtered.map((user) => <button key={user.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { props.setSelectedUserId(user.id); setOpen(false); }}><span>{user.label}</span><small>{user.profileName}</small></button>)}</section>}</label>
    </div>
  </section>;
}

function Overview({ report }) {
  const hours = sortedHours(report.logins_by_hour_by_profile); const weekdays = sortedWeekdays(report.logins_by_weekday_by_profile);
  const peakHour = maxItem(hours); const peakDay = maxItem(weekdays);
  const profiles = (report.logins_by_profile || []).map((item) => ({ ...item, slug: profileSlugFromLabel(item.label) }));
  const total = profiles.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const users = [...(report.active_users_details || [])].sort((a, b) => b.value - a.value);
  return <><div className="gv-metrics"><Metric label="Usuários ativos" value={formatCount(report.active_users)} hint="Pessoas que abriram o app no período" icon={Users} tone="green" /><Metric label="Aberturas do app" value={formatCount(report.total_logins)} hint="Inclui entrada por login automático" icon={Activity} tone="blue" /><Metric label="Horário de pico" value={peakHour?.label || "--"} hint={peakHour ? `${formatCount(peakHour.value)} acessos nesse horário` : "Sem acessos"} icon={Clock3} tone="orange" /><Metric label="Dia de maior uso" value={peakDay?.label || "--"} hint={peakDay ? `${formatCount(peakDay.value)} acessos nesse dia` : "Sem acessos"} icon={CalendarDays} tone="purple" /></div><div className="gv-columns"><Card title="Acessos por perfil" subtitle="Distribuição de todas as aberturas do aplicativo">{profiles.length ? <div className="gv-profile-summary"><Donut profiles={profiles} total={total} center={formatCount(report.total_logins)} /><div>{profiles.map((item) => { const meta = PROFILE_META[item.slug]; return <div className="gv-profile-row" key={item.label}><i style={{ color: meta.color, background: meta.soft }}>{item.label[0]}</i><div><span><strong>{item.label}</strong><b>{formatCount(item.value)} · {formatPercent(total ? item.value / total : 0)}</b></span><Progress value={total ? item.value / total : 0} color={meta.color} /></div></div>; })}</div></div> : <Empty />}</Card><Card title="Usuários em destaque" subtitle="1 ponto por abertura e por módulo, com intervalo antispam de 5 minutos">{users.length ? <div className="gv-rank">{users.map((item, index) => <div key={`${item.label}-${index}`}><em>{index + 1}</em><Avatar label={item.label} /><span><strong>{item.label}</strong><small>{formatCount(item.metadata?.login_points)} login · {formatCount(item.metadata?.module_points)} módulo</small></span><b>{formatCount(item.value)} pts</b></div>)}</div> : <Empty />}</Card></div></>;
}

function UsersView({ report }) {
  const [query, setQuery] = useState(""); const [expanded, setExpanded] = useState(new Set());
  const groups = (report.logins_by_user_by_profile || []).map((group) => ({ ...group, items: (group.items || []).filter((item) => item.label.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))) })).filter((group) => group.items.length);
  const max = Math.max(1, ...(report.logins_by_user || []).map((item) => Number(item.value || 0)));
  return <Card title="Acessos por usuário" subtitle="Quem abriu o aplicativo e quantas vezes no período" actions={<div className="gv-search"><Search size={15} /><input placeholder="Buscar nome ou código" value={query} onChange={(event) => setQuery(event.target.value)} /></div>}>{groups.length ? <div className="gv-accordions">{groups.map((group) => { const meta = PROFILE_META[profileSlugFromLabel(group.label)]; const open = expanded.has(group.label); return <div className="gv-accordion" key={group.label}><button onClick={() => toggleSet(setExpanded, group.label)}><i style={{ color: meta.color, background: meta.soft }}>{group.label[0]}</i><span><strong>{group.label}</strong><small>{group.items.length} usuário(s)</small></span><b>{formatCount(group.items.reduce((sum, item) => sum + Number(item.value || 0), 0))} acessos</b>{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>{open && <section>{group.items.map((item) => <div className="gv-user-row" key={item.label}><Avatar label={item.label} /><span><strong>{item.label}</strong><Progress value={item.value / max} color={meta.color} /></span><b>{formatCount(item.value)}</b></div>)}</section>}</div>; })}</div> : <Empty />}</Card>;
}

function ModulesView({ report }) {
  const [expanded, setExpanded] = useState(new Set()); const modules = [...(report.module_opens_by_module || [])].sort((a, b) => b.value - a.value); const users = [...(report.module_users_by_user || [])].sort((a, b) => b.value - a.value); const max = Math.max(1, ...modules.map((item) => Number(item.value || 0)));
  return <div className="gv-columns"><Card title="Módulos mais acessados" subtitle="A página inicial não participa deste ranking">{modules.length ? <div className="gv-module-rank">{modules.map((item, index) => <div key={item.label}><em>{index + 1}</em><span><strong>{item.label}</strong><Progress value={item.value / max} color="#5268f5" /></span><b>{formatCount(item.value)}</b></div>)}</div> : <Empty />}</Card><Card title="Jornada por usuário" subtitle="Quantos módulos cada pessoa abriu e quais foram eles">{users.length ? <div className="gv-accordions">{users.map((item) => { const open = expanded.has(item.label); return <div className="gv-accordion" key={item.label}><button onClick={() => toggleSet(setExpanded, item.label)}><Avatar label={item.label} /><span><strong>{item.label}</strong><small>{formatCount(item.value)} módulo(s) distinto(s)</small></span>{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>{open && <section className="gv-module-details">{(item.items || []).map((module) => <div key={module.label}><span>{module.label}</span><b>{formatCount(module.value)} abertura(s)</b></div>)}</section>}</div>; })}</div> : <Empty />}</Card></div>;
}

function HoursView({ report }) { const items = sortedHours(report.logins_by_hour_by_profile); const [selected, setSelected] = useState(""); useEffect(() => { if (selected && !items.some((item) => item.label === selected)) setSelected(""); }, [items, selected]); return <Card title="Acessos por horário" subtitle="Toque em uma barra para ver quem acessou naquela hora">{items.length ? <><BarChart items={items} selected={selected} onSelect={setSelected} /><Details title={selected ? `Usuários que acessaram às ${selected}` : "Selecione um horário no gráfico"} items={groupItems(report.logins_by_hour_users, selected)} idle={!selected} /></> : <Empty />}</Card>; }
function WeekdaysView({ report }) { const items = sortedWeekdays(report.logins_by_weekday_by_profile); const [selected, setSelected] = useState(""); const max = Math.max(1, ...items.map((item) => Number(item.value || 0))); return <Card title="Acessos por dia da semana" subtitle="Selecione um dia para detalhar os usuários">{items.length ? <div className="gv-weekdays"><div>{items.map((item) => <button key={item.label} className={selected === item.label ? "active" : ""} onClick={() => setSelected(item.label)}><span>{item.label}</span><Progress value={item.value / max} color={selected === item.label ? "#16875f" : "#5268f5"} /><b>{formatCount(item.value)}</b></button>)}</div><Details title={selected ? `Usuários que acessaram em ${selected}` : "Selecione um dia"} items={groupItems(report.logins_by_weekday_users, selected)} idle={!selected} /></div> : <Empty />}</Card>; }

function Metric({ label, value, hint, icon: Icon, tone }) { return <article className={`gv-metric ${tone}`}><Icon size={21} /><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>; }
function Card({ title, subtitle, actions, children }) { return <section className="gv-card"><header><div><h2>{title}</h2><p>{subtitle}</p></div>{actions}</header><main>{children}</main></section>; }
function Progress({ value, color }) { return <div className="gv-progress"><i style={{ width: `${Math.max(0, Math.min(1, Number(value || 0))) * 100}%`, background: color }} /></div>; }
function Avatar({ label }) { return <i className="gv-avatar">{initials(label)}</i>; }
function Empty() { return <div className="gv-empty"><BarChart3 size={24} /> Nenhum acesso encontrado no período.</div>; }
function maxItem(items) { return items.length ? items.reduce((best, item) => Number(item.value) > Number(best.value) ? item : best) : null; }
function toggleSet(setter, value) { setter((current) => { const next = new Set(current); next.has(value) ? next.delete(value) : next.add(value); return next; }); }
function Donut({ profiles, total, center }) { let cursor = 0; const stops = profiles.map((item) => { const start = cursor; cursor += total ? item.value / total * 100 : 0; return `${PROFILE_META[item.slug].color} ${start}% ${cursor}%`; }); return <div className="gv-donut" style={{ background: `conic-gradient(${stops.join(",")})` }}><span><strong>{center}</strong><small>acessos</small></span></div>; }
function BarChart({ items, selected, onSelect }) { const max = Math.max(1, ...items.map((item) => Number(item.value || 0))); return <div className="gv-chart">{items.map((item) => <button key={item.label} className={selected === item.label ? "active" : ""} onClick={() => onSelect(item.label)}><strong>{formatCount(item.value)}</strong><span><i style={{ height: `${Math.max(5, item.value / max * 100)}%` }} /></span><b>{item.label.replace(":00", "h")}</b></button>)}</div>; }
function Details({ title, items, idle }) { return <section className={`gv-details ${idle ? "idle" : ""}`}><h3>{title}</h3>{idle ? <p>Os detalhes aparecerão aqui.</p> : items.length ? items.map((item) => <div key={item.label}><Avatar label={item.label} /><span>{item.label}</span><b>{formatCount(item.value)}</b></div>) : <p>Nenhum usuário encontrado.</p>}</section>; }
