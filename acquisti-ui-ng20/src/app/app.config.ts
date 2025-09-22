import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

// Animaciones (Angular 20 recomienda la variante async)
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

// PrimeNG (theming nuevo)
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: { darkModeSelector: 'html.dark' } // opcional
      }
    })
  ]
};
