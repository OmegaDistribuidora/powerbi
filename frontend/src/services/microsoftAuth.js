import { microsoftConfig } from "../config";

const loginRequest = {
  scopes: [microsoftConfig.powerBiScope],
  prompt: "select_account"
};

let msalModulePromise = null;
let msalApp = null;
let initPromise = null;

function isInteractionRequired(error, InteractionRequiredAuthError) {
  if (error instanceof InteractionRequiredAuthError) {
    return true;
  }

  const code = String(error?.errorCode || error?.code || error?.message || "").toLowerCase();
  return ["interaction_required", "login_required", "consent_required"].some((fragment) => code.includes(fragment));
}

async function loadMsalLibrary() {
  if (!msalModulePromise) {
    msalModulePromise = import("@azure/msal-browser");
  }

  return msalModulePromise;
}

async function ensureMsal() {
  if (!microsoftConfig.isConfigured) {
    throw new Error(
      "Integracao Microsoft nao configurada. Defina VITE_MICROSOFT_CLIENT_ID e VITE_MICROSOFT_TENANT_ID."
    );
  }

  const msalLibrary = await loadMsalLibrary();

  if (!msalApp) {
    msalApp = new msalLibrary.PublicClientApplication({
      auth: {
        clientId: microsoftConfig.clientId,
        authority: microsoftConfig.authority,
        redirectUri: microsoftConfig.redirectUri
      },
      cache: {
        cacheLocation: "localStorage"
      }
    });
  }

  if (!initPromise) {
    initPromise = msalApp.initialize();
  }

  await initPromise;
  await msalApp.handleRedirectPromise();
  return {
    app: msalApp,
    InteractionRequiredAuthError: msalLibrary.InteractionRequiredAuthError
  };
}

export async function getPowerBiAccessToken({ interactive = true } = {}) {
  const { app, InteractionRequiredAuthError } = await ensureMsal();
  const existingAccount = app.getActiveAccount() || app.getAllAccounts()[0] || null;

  if (existingAccount) {
    app.setActiveAccount(existingAccount);

    try {
      const silentResult = await app.acquireTokenSilent({
        scopes: loginRequest.scopes,
        account: existingAccount
      });
      return { accessToken: silentResult.accessToken, account: silentResult.account };
    } catch (error) {
      if (!isInteractionRequired(error, InteractionRequiredAuthError)) {
        throw error;
      }
      if (!interactive) {
        return { accessToken: null, account: existingAccount };
      }
    }
  }

  if (!interactive) {
    return { accessToken: null, account: existingAccount };
  }

  const interactiveResult = existingAccount
    ? await app.acquireTokenPopup({
        scopes: loginRequest.scopes,
        account: existingAccount
      })
    : await app.loginPopup(loginRequest);

  if (interactiveResult.account) {
    app.setActiveAccount(interactiveResult.account);
  }

  if (interactiveResult.accessToken) {
    return {
      accessToken: interactiveResult.accessToken,
      account: interactiveResult.account
    };
  }

  const fallbackResult = await app.acquireTokenPopup({
    scopes: loginRequest.scopes,
    account: interactiveResult.account || app.getActiveAccount() || undefined
  });

  return {
    accessToken: fallbackResult.accessToken,
    account: fallbackResult.account
  };
}

export async function getMicrosoftAccount() {
  const { app } = await ensureMsal();
  return app.getActiveAccount() || app.getAllAccounts()[0] || null;
}
