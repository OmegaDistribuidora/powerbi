const clientId = (import.meta.env.VITE_MICROSOFT_CLIENT_ID || "").trim();
const tenantId = (import.meta.env.VITE_MICROSOFT_TENANT_ID || "").trim();
const redirectUri = (import.meta.env.VITE_MICROSOFT_REDIRECT_URI || window.location.origin).trim();
const powerBiScope = (import.meta.env.VITE_POWERBI_SCOPE || "https://analysis.windows.net/powerbi/api/Report.Read.All").trim();

export const microsoftConfig = {
  clientId,
  tenantId,
  redirectUri,
  powerBiScope,
  authority: tenantId ? `https://login.microsoftonline.com/${tenantId}` : "",
  isConfigured: Boolean(clientId && tenantId)
};
