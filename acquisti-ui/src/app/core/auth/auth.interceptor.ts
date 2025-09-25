import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, throwError } from 'rxjs';
import { catchError, filter, switchMap, take, finalize } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

let isRefreshing = false;
const refreshSubject = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // Detectamos si es llamada a nuestro backend
  const base = environment.apiBaseUrl ?? '';
  const isApi = base ? req.url.startsWith(base) : req.url.startsWith('/api');

  // Adjuntamos Authorization si hay token
  const access = auth.accessToken;
  const authedReq = isApi && access
    ? req.clone({ setHeaders: { Authorization: `Bearer ${access}` } })
    : req;

  return next(authedReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (!(isApi && err.status === 401)) {
        return throwError(() => err);
      }

      // Si NO hay refresh configurado, cerramos sesión y devolvemos el error
      const hasRefreshConfigured = !!environment.jwt?.refreshEndpoint;
      if (!hasRefreshConfigured) {
        auth.logout();
        return throwError(() => err);
      }

      // --- flujo con refresh (si lo activas en el backend/environments) ---
      if (!isRefreshing) {
        isRefreshing = true;
        refreshSubject.next(null);

        return auth.refresh().pipe(
          switchMap((res: any) => {
            isRefreshing = false;
            // auth.refresh() ya actualiza el storage; volvemos a leer
            const newAccess = auth.accessToken;
            refreshSubject.next(newAccess);
            const retried = req.clone({
              setHeaders: { Authorization: `Bearer ${newAccess ?? ''}` },
            });
            return next(retried);
          }),
          catchError((refreshErr) => {
            isRefreshing = false;
            auth.logout();
            return throwError(() => refreshErr);
          })
        );
      }

      // Si ya hay un refresh en curso, esperamos a que publique el nuevo token
      return refreshSubject.pipe(
        filter((t) => t !== null),
        take(1),
        switchMap((t) => {
          const retried = req.clone({
            setHeaders: { Authorization: `Bearer ${t}` },
          });
          return next(retried);
        })
      );
    }),
    finalize(() => {
      // opcional: aquí podrías ocultar spinners globales, métricas, etc.
    })
  );
};
