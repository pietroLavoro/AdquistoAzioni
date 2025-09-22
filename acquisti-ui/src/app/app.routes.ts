import { Routes } from '@angular/router';
import { AcquistiListComponent } from './features/acquisti/acquisti-list/acquisti-list.component';
import { AcquistoFormComponent } from './features/acquisti/acquisto-form/acquisto-form.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'acquisti/nuovo' },
  { path: 'acquisti', component: AcquistiListComponent },
  { path: 'acquisti/nuovo', component: AcquistoFormComponent },
  { path: '**', redirectTo: 'acquisti/nuovo' },
];
