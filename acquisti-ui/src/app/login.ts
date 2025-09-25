import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';

import { AuthService } from './core/auth/auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <form [formGroup]="form" (ngSubmit)="submit()" autocomplete="off" novalidate>
    <div class="field">
      <label for="username">Usuario</label>
      <input id="username" type="text" formControlName="username" placeholder="Usuario" />
      <small class="err" *ngIf="form.get('username')?.touched && form.get('username')?.invalid">
        Usuario requerido
      </small>
    </div>

    <div class="field">
      <label for="password">Password</label>
      <input id="password" type="password" formControlName="password" placeholder="Password" />
      <small class="err" *ngIf="form.get('password')?.touched && form.get('password')?.invalid">
        Password requerida
      </small>
    </div>

    <button type="submit" [disabled]="form.invalid || loading()"> 
      {{ loading() ? 'Entrando…' : 'Entrar' }}
    </button>

    <p *ngIf="error()" class="err" style="margin-top:.5rem">{{ error() }}</p>
  </form>
  `
})
export default class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  loading = signal(false);
  error = signal<string | null>(null);

  form = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const username = (raw.username ?? '').trim();
    const password = (raw.password ?? '').trim();

    if (!username || !password) {
      this.error.set('Completa usuario y password');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.auth
      .login(username, password)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => this.router.navigateByUrl('/'),
        error: (e) => {
          const msg =
            e?.error?.message ||
            e?.message ||
            'Login fallido. Verifica tus credenciales.';
          this.error.set(msg);
        },
      });
  }
}
