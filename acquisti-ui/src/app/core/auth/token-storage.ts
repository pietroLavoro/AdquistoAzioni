// src/app/core/auth/token-storage.ts

export interface Tokens {
  accessToken: string;
  refreshToken?: string | null;
}

const ACCESS_KEY  = 'acq.access';
const REFRESH_KEY = 'acq.refresh';

export const tokenStorage = {
  /** Devuelve solo el access token (atajo usado por el interceptor). */
  get(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },

  /** Devuelve ambos tokens si existen (retro-compatible). */
  getTokens(): Tokens | null {
    const access = localStorage.getItem(ACCESS_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);
    return access ? { accessToken: access, refreshToken: refresh } : null;
  },

  /** Guarda solo access token (cuando tu backend devuelve un único `token`). */
  setToken(token: string): void {
    localStorage.setItem(ACCESS_KEY, token);
  },

  /** Guarda access+refresh; si no hay refresh, lo limpia. */
  setTokens(t: Tokens): void {
    localStorage.setItem(ACCESS_KEY, t.accessToken);
    if (t.refreshToken) {
      localStorage.setItem(REFRESH_KEY, t.refreshToken);
    } else {
      localStorage.removeItem(REFRESH_KEY);
    }
  },

  /**
   * Guarda tokens a partir de la respuesta del login, sea cual sea el formato:
   *  - { token }
   *  - { accessToken, refreshToken }
   *  - { access_token, refresh_token }
   */
  setFromLoginResponse(res: any): void {
    const access =
      res?.token ??
      res?.accessToken ??
      res?.access_token ??
      null;

    const refresh =
      res?.refreshToken ??
      res?.refresh_token ??
      null;

    if (access) {
      this.setTokens({ accessToken: access, refreshToken: refresh });
    }
  },

  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },

  /** Alias explícitos si los prefieres. */
  getAccess(): string | null { return localStorage.getItem(ACCESS_KEY); },
  getRefresh(): string | null { return localStorage.getItem(REFRESH_KEY); },
} as const;
