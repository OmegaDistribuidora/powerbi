import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config";

type UsageReportFilters = {
  start: string;
  end: string;
  userId?: string | null;
  coordinatorCode?: string | null;
  profileSlugs?: string[];
};

type ReportUser = {
  id: string;
  code: string;
  displayName: string;
  label: string;
  profileName: string;
  profileSlug: string;
  coordinatorCode: string;
  isActive: boolean;
};

let adminClient: SupabaseClient | null = null;
let adminSessionExpiresAt = 0;
let sessionPromise: Promise<SupabaseClient> | null = null;

function assertConfigured(): void {
  const config = env.gestaoVendasReports;
  if (!config.supabaseUrl || !config.publishableKey || !config.serviceRoleKey || !config.adminEmail) {
    throw new Error("Os relatórios do Gestão de Vendas ainda não foram configurados neste ambiente.");
  }
}

function newClient(key: string): SupabaseClient {
  return createClient(env.gestaoVendasReports.supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

async function createAdminClient(): Promise<SupabaseClient> {
  assertConfigured();
  const config = env.gestaoVendasReports;
  const serviceClient = newClient(config.serviceRoleKey);
  const client = newClient(config.publishableKey);

  const { data: link, error: linkError } = await serviceClient.auth.admin.generateLink({
    type: "magiclink",
    email: config.adminEmail
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    throw new Error(`Não foi possível preparar a consulta administrativa: ${linkError?.message || "token ausente"}`);
  }

  const { data: verified, error: verifyError } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash
  });
  if (verifyError || !verified.session) {
    throw new Error(`Não foi possível autenticar a consulta administrativa: ${verifyError?.message || "sessão ausente"}`);
  }

  adminClient = client;
  adminSessionExpiresAt = Number(verified.session.expires_at || 0) * 1000;
  return client;
}

async function getAdminClient(forceRefresh = false): Promise<SupabaseClient> {
  const sessionStillValid = adminClient && adminSessionExpiresAt > Date.now() + 5 * 60 * 1000;
  if (!forceRefresh && sessionStillValid) {
    return adminClient as SupabaseClient;
  }

  if (!sessionPromise) {
    sessionPromise = createAdminClient().finally(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

function shouldRetry(error: { message?: string; status?: number } | null): boolean {
  if (!error) return false;
  const message = String(error.message || "").toLowerCase();
  return error.status === 401 || error.status === 403 || message.includes("jwt") || message.includes("acesso negado");
}

async function withAdminClient<T>(
  operation: (client: SupabaseClient) => any
): Promise<T> {
  let client = await getAdminClient();
  let result = await operation(client);
  if (shouldRetry(result.error)) {
    client = await getAdminClient(true);
    result = await operation(client);
  }
  if (result.error) {
    throw new Error(result.error.message || "Não foi possível consultar os relatórios do Gestão de Vendas.");
  }
  return result.data as T;
}

export async function fetchGestaoVendasReportUsers(): Promise<ReportUser[]> {
  const [profiles, users] = await Promise.all([
    withAdminClient<any[]>((client) => client.from("app_profiles").select("id, name, slug")),
    withAdminClient<any[]>((client) => client.from("app_users").select("*").order("code"))
  ]);
  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return (users || [])
    .map((user) => {
      const profile = profilesById.get(user.profile_id) || {};
      const code = String(user.code || "").trim();
      const displayName = String(user.display_name || "").trim();
      return {
        id: String(user.auth_user_id || ""),
        code,
        displayName,
        label: code && displayName ? `${code} - ${displayName}` : displayName || code || user.technical_email,
        profileName: profile.name || "Sem perfil",
        profileSlug: profile.slug || "sem_perfil",
        coordinatorCode: String(user.coordinator_code || "").trim(),
        isActive: user.is_active !== false
      };
    })
    .filter((user) => user.id && user.profileSlug !== "admin")
    .sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
}

export async function fetchGestaoVendasUsageReport(filters: UsageReportFilters): Promise<Record<string, unknown>> {
  const data = await withAdminClient<Record<string, unknown>>((client) =>
    client.rpc("get_usage_report", {
      window_start: filters.start,
      window_end: filters.end,
      target_user_id: filters.userId || null,
      target_coordinator_code: filters.coordinatorCode || null,
      target_profile_slugs: filters.profileSlugs?.length ? filters.profileSlugs : []
    })
  );
  return data || {};
}
