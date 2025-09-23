import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { provideHttpClient } from '@angular/common/http';   // ⬅️ NUEVO

import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(),   // ⬅️ REGISTRA HttpClient PARA TODA LA APP
    providePrimeNG({
      theme: { preset: Aura, options: { darkModeSelector: 'html.dark' } }
    })
  ]
};
