// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { provideAnimations } from '@angular/platform-browser/animations'; // ⬅️ NUEVO

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    provideAnimations(), // ⬅️ AÑADIR ESTO
    providePrimeNG({
      theme: {
        preset: Aura,
        options: { darkModeSelector: 'html.dark' }
      }
    })
  ]
};
