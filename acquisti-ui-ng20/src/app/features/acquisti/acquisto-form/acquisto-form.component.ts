import { Component, OnInit, OnDestroy, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { interval, Subscription } from 'rxjs';
import { finalize, startWith, switchMap } from 'rxjs/operators';

/* PrimeNG v20 */
import { DropdownModule } from 'primeng/dropdown';
import { CalendarModule } from 'primeng/calendar';
import { InputNumberModule } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ButtonModule } from 'primeng/button';
import { MessageService, ConfirmationService } from 'primeng/api';

/* Servicio + DTOs (ajusta la ruta si difiere) */
import {
  AcquistiService,
  AgenteSaldo,
  SuggestimentoData,
  PreviewRequest,
  PreviewResponse,
  Titolo,
} from '../../acquisti/acquisti.service';

/* Lista standalone (ajusta ruta si difiere) */
import { AcquistiListComponent } from '../../acquisti/acquisti-list/acquisti-list.component';

@Component({
  selector: 'app-acquisto-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule, // <-- añadido
    ReactiveFormsModule,
    DropdownModule,
    CalendarModule,
    InputNumberModule,
    TableModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    ButtonModule,
    AcquistiListComponent,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './acquisto-form.component.html',
  styleUrls: ['./acquisto-form.component.css'],
})
export class AcquistoFormComponent implements OnInit, OnDestroy {
  /* ====== estado base ====== */
  private fb = inject(FormBuilder);
  constructor(private api: AcquistiService) {}

  @ViewChild(AcquistiListComponent) listCmp?: AcquistiListComponent;

  loading = false;
  error: string | null = null;

  /* ====== combos / datos maestros ====== */
  titoli: Titolo[] = [];

  /* ====== tabla unificada de saldos ====== */
  rows: AgenteSaldo[] = [];
  polling?: Subscription;
  pollingMs = 5000;

  /* ====== agentes activos a la fecha ====== */
  agentiInfo?: { data: string; numAgenti: number; agenti: AgenteSaldo[] };
  numAgentiAttivi = 0;

  /* ====== formulario (fecha ISO yyyy-MM-dd) ====== */
  form = this.fb.nonNullable.group({
    titoloCodice: ['', Validators.required],
    dataCompra: [
      this.todayIso(),
      [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)],
    ],
    importoTotale: [10000, [Validators.required, Validators.min(0.01)]],
    quantitaTotale: [1, [Validators.required, Validators.min(1)]],
  });

  /* ====== bloque de previsualización ====== */
  preview: PreviewResponse | null = null;

  /* ====== mini toast ====== */
  toastMsg = '';
  toastType: 'success' | 'info' | 'error' = 'info';
  toastVisible = false;
  private toastTimer?: any;

  // ---------------- Ciclo de vida ----------------
  ngOnInit(): void {
    this.refreshSaldosUnifiedOnce();
    this.startUnifiedPolling();
    this.verAgentesActivos();

    this.api.getTitoli().subscribe({
      next: (res) => {
        this.titoli = res ?? [];
        const cur = this.form.get('titoloCodice')!.value;
        if (!cur && this.titoli.length > 0) {
          this.form.patchValue({ titoloCodice: this.titoli[0].codice });
        }
      },
      error: (err) =>
        this.setHttpError(err, 'No se pudieron cargar los títulos'),
    });
  }

  ngOnDestroy(): void {
    this.polling?.unsubscribe();
    this.hideToast();
  }

  // ---------------- Acciones de UI ----------------
  isTodaySelected(): boolean {
    const d = (this.form.get('dataCompra')?.value || '').trim();
    return !!d && d === this.todayIso();
  }

  doPreview(): void {
    this.error = null;
    const req = this.buildRequest();
    if (!req) return;

    this.loading = true;
    this.api
      .preview(req)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (resp) => {
          this.preview = resp;
          this.showToast('Previsualización OK', 'info');
        },
        error: (err: HttpErrorResponse) => {
          this.preview = null;
          this.setHttpError(err, 'Error al previsualizar');
          this.showToast(this.error || 'Error al previsualizar', 'error', 4000);
        },
      });
  }

  doConferma(): void {
    this.error = null;
    const req = this.buildRequest();
    if (!req) return;

    this.loading = true;
    this.api
      .conferma(req)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.preview = null;
          this.showToast('Compra confirmada', 'success');
          this.refreshSaldosUnifiedOnce();
          this.startUnifiedPolling();
          this.verAgentesActivos();
          this.listCmp?.load();
        },
        error: (err) => {
          this.setHttpError(err, 'Error al confirmar compra');
          this.showToast(
            this.error || 'Error al confirmar compra',
            'error',
            4000
          );
        },
      });
  }

  onSuggerisciData(): void {
    this.sugerirFecha();
  }

  sugerirFecha(): void {
    this.error = null;

    const titolo = (
      this.form.get('titoloCodice')?.value as string | undefined
    )?.trim();
    if (!titolo) {
      this.error = 'Debe seleccionar un título';
      return;
    }

    const n =
      this.agentiInfo?.numAgenti ?? this.agentiInfo?.agenti?.length ?? 0;
    if (n <= 0) {
      this.error = 'No hay agentes activos para sugerir una fecha.';
      return;
    }

    this.loading = true;
    this.api.suggestData(titolo, n).subscribe({
      next: (sug: SuggestimentoData) => {
        const iso = this.toIsoFromDmy(sug.dataSuggerita); // dd-MM-yyyy -> yyyy-MM-dd
        this.form.patchValue({ dataCompra: iso });
        this.verAgentesActivos();
        this.refreshSaldosUnifiedOnce();
        this.startUnifiedPolling();
        this.loading = false;
      },
      error: (err) => {
        this.setHttpError(err, 'Error al sugerir fecha');
        this.loading = false;
      },
    });
  }

  verAgentesActivos(): void {
    this.error = null;
    const dataIso = (
      (this.form.get('dataCompra')?.value as string) || ''
    ).trim();
    if (!dataIso) return;

    this.api.getAgentiAttiviAlla(dataIso).subscribe({
      next: (res) => {
        this.agentiInfo = res;
        this.numAgentiAttivi = res?.numAgenti ?? res?.agenti?.length ?? 0;
      },
      error: (err: HttpErrorResponse) => {
        this.setHttpError(err, 'No se pudo obtener agentes activos');
      },
    });
  }

  resetSaldos(): void {
    this.error = null;
    this.api.resetSaldos().subscribe({
      next: () => {
        this.showToast('Saldos reiniciados', 'success');
        this.preview = null;
        this.refreshSaldosUnifiedOnce();
        this.startUnifiedPolling();
        this.verAgentesActivos();
        this.listCmp?.load();
      },
      error: (err) => {
        this.setHttpError(err, 'Error al reiniciar saldos');
        this.showToast(
          this.error || 'Error al reiniciar saldos',
          'error',
          4000
        );
      },
    });
  }

  confirmarDesdePreview(): void {
    if (!this.preview) return;
    const req = this.buildRequest();
    if (!req) return;

    this.loading = true;
    this.api
      .conferma(req)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.preview = null;
          this.showToast('Compra confirmada', 'success');
          this.refreshSaldosUnifiedOnce();
          this.startUnifiedPolling();
          this.verAgentesActivos();
          this.listCmp?.load();
        },
        error: (err) => {
          this.setHttpError(err, 'Error al confirmar compra');
          this.showToast(
            this.error || 'Error al confirmar compra',
            'error',
            4000
          );
        },
      });
  }

  cancelarPreview(): void {
    this.preview = null;
  }

  // ---------------- Helpers ----------------
  private refreshSaldosUnifiedOnce(): void {
    const dateIso = (this.form.get('dataCompra')?.value || '').trim();
    if (!dateIso) {
      this.rows = [];
      return;
    }

    if (this.isTodaySelected()) {
      this.api.getSaldiAgenti().subscribe({
        next: (res) => (this.rows = res),
        error: (err) =>
          this.setHttpError(err, 'No se pudieron obtener saldos en vivo'),
      });
    } else {
      this.api.getAgentiAttiviAlla(dateIso).subscribe({
        next: (res) => {
          this.agentiInfo = res;
          this.numAgentiAttivi = res?.numAgenti ?? res?.agenti?.length ?? 0;
          this.rows = res?.agenti || [];
        },
        error: (err) =>
          this.setHttpError(err, 'No se pudieron obtener saldos a la fecha'),
      });
    }
  }

  private toIsoFromDmy(dmy: string): string {
    const [dd, mm, yyyy] = dmy.split('-');
    return `${yyyy}-${mm}-${dd}`;
  }

  private todayIso(): string {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  private buildRequest(): PreviewRequest | null {
    const v = this.form.getRawValue();

    const titolo = String(v.titoloCodice ?? '').trim();
    const dataIso = String(v.dataCompra ?? '').trim();
    const imp = Number(v.importoTotale);
    const qta = Number(v.quantitaTotale);

    if (
      !titolo ||
      !dataIso ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dataIso) ||
      !isFinite(imp) ||
      !isFinite(qta)
    ) {
      this.error = !dataIso ? 'Fecha inválida.' : 'Formulario inválido';
      return null;
    }

    const req: PreviewRequest = {
      titoloCodice: titolo,
      dataCompra: dataIso,
      importoTotale: imp,
      quantitaTotale: qta,
    };
    return req;
  }

  private startUnifiedPolling(): void {
    this.polling?.unsubscribe();
    if (!this.isTodaySelected()) return;

    this.polling = interval(this.pollingMs)
      .pipe(
        startWith(0),
        switchMap(() => this.api.getSaldiAgenti())
      )
      .subscribe({
        next: (res) => (this.rows = res),
        error: (err) =>
          this.setHttpError(err, 'No se pudieron obtener saldos (polling)'),
      });
  }

  private setHttpError(err: HttpErrorResponse, fallback = 'Error'): void {
    const emit = (msg: string) => {
      this.error = msg;
      this.showToast(msg, 'error', 4000);
    };

    const blob = err?.error;
    if (blob instanceof Blob) {
      blob.text().then((t) => emit(t?.trim() || fallback));
      return;
    }

    if (err?.error) {
      const e = err.error as any;
      const msg =
        (typeof e === 'string' && e.trim()) ||
        e?.message ||
        e?.code ||
        e?.detail ||
        e?.error ||
        '';
      if (msg) {
        emit(msg);
        return;
      }
    }

    emit(err.statusText || err.message || fallback);
  }

  // ---------------- Mini toast ----------------
  showToast(
    msg: string,
    type: 'success' | 'info' | 'error' = 'info',
    ms = 2500
  ): void {
    this.toastMsg = msg;
    this.toastType = type;
    this.toastVisible = true;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.hideToast(), ms);
  }

  hideToast(): void {
    this.toastVisible = false;
    clearTimeout(this.toastTimer);
  }

  // ---------------- Badge helpers ----------------
  get saldoTotaleDisponibile(): number {
    return (this.rows || []).reduce(
      (acc, a) => acc + (a?.saldoDisponibile ?? 0),
      0
    );
  }

  get badgeType(): 'ok' | 'warn' | 'neg' {
    const tot = this.saldoTotaleDisponibile;
    if (tot < 0) return 'neg';
    const imp = Number(this.form.get('importoTotale')?.value) || 0;
    return imp > tot ? 'warn' : 'ok';
  }
}
