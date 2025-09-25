import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  router.navigate(['/login']); // ajusta ruta de login
  return false;
};
