import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError, timer } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { tokenStorage } from './token-storage';

type JwtPayload = { exp: number; sub?: string; roles?: string[]; [k: string]: any };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  /** Estado del usuario decodificado desde el access token */
  private _user$ = new BehaviorSubject<JwtPayload | null>(this.decode(tokenStorage.get()));
  readonly user$ = this._user$.asObservable();

  /** Handle del temporizador para refresco/caducidad */
  private refreshTimerSub: any = null;

  // ========= Público =========

  /** POST /login -> guarda token y programa expiración/refresh */
  login(username: string, password: string): Observable<void> {
    const base = environment.apiBaseUrl ?? '';
    const endpoint = environment.jwt?.loginEndpoint ?? '/api/auth/login';

    return this.http.post<any>(`${base}${endpoint}`, { username, password }).pipe(
      tap((res) => this.setFromLoginResponse(res)),
      map(() => void 0)
    );
  }

  /** Limpia sesión localmente */
  logout(): void {
    this.stopAutoRefresh();
    tokenStorage.clear();
    this._user$.next(null);
  }

  /** Acceso directo al access token (útil para el interceptor) */
  get accessToken(): string | null {
    return tokenStorage.get();
  }

  /** ¿Hay token válido en este momento? */
  isAuthenticated(): boolean {
    const payload = this.decode(this.accessToken);
    return !!payload && !this.isExpired(payload, environment.jwt?.accessLeewaySec ?? 0);
  }

  /**
   * Refresh explícito (si existe endpoint + refresh token).
   * En tu backend actual NO se usa; queda preparado para el futuro.
   */
  refresh(): Observable<any> {
    const base = environment.apiBaseUrl ?? '';
    const endpoint = environment.jwt?.refreshEndpoint; // puede ser undefined
    const refreshToken = tokenStorage.getRefresh();

    if (!endpoint) {
      return throwError(() => new Error('refresh-not-configured'));
    }
    if (!refreshToken) {
      return throwError(() => new Error('missing-refresh-token'));
    }

    return this.http
      .post<any>(`${base}${endpoint}`, { refresh_token: refreshToken })
      .pipe(tap((res) => this.setFromLoginResponse(res)));
  }

  // ========= Privado =========

  /** Guarda tokens desde cualquier forma de respuesta y programa temporizador */
  private setFromLoginResponse(res: any): void {
    tokenStorage.setFromLoginResponse(res);

    const payload = this.decode(tokenStorage.get());
    this._user$.next(payload);

    // Si tienes refresh endpoint configurado, programa refresh;
    // si no, programa logout cuando caduque el token.
    const hasRefresh = !!environment.jwt?.refreshEndpoint;
    this.scheduleAutoRefreshOrExpiry(payload, hasRefresh);
  }

  /**
   * Programa un timer:
   * - Con refresh endpoint: intenta refrescar el token antes de expirar.
   * - Sin refresh endpoint: hace logout al expirar.
   */
  private scheduleAutoRefreshOrExpiry(p?: JwtPayload | null, withRefresh = false) {
    this.stopAutoRefresh();

    const payload = p ?? this.decode(tokenStorage.get());
    if (!payload?.exp) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const margin = environment.jwt?.accessLeewaySec ?? 30; // 30s por defecto
    const dueMs = Math.max((payload.exp - nowSec - margin), 1) * 1000;

    this.refreshTimerSub = timer(dueMs)
      .pipe(
        switchMap(() => {
          if (withRefresh) {
            return this.refresh().pipe(catchError(() => of(null)));
          } else {
            // sin refresh → cerrar sesión al expirar
            this.logout();
            return of(null);
          }
        })
      )
      .subscribe();
  }

  private stopAutoRefresh() {
    if (this.refreshTimerSub) {
      this.refreshTimerSub.unsubscribe?.();
      this.refreshTimerSub = null;
    }
  }

  private isExpired(payload?: JwtPayload | null, leewaySec = 0): boolean {
    if (!payload?.exp) return true;
    const nowSec = Math.floor(Date.now() / 1000);
    return nowSec + leewaySec >= payload.exp;
  }

  private decode(token: string | null): JwtPayload | null {
    if (!token) return null;
    try {
      const base = token.split('.')[1];
      const json = atob(base.replace(/-/g, '+').replace(/_/g, '/'));
      // decodeURIComponent(escape()) para soportar UTF-8 en atob
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch {
      return null;
    }
  }
}
