import { Component, OnInit, OnDestroy, inject, ViewChild } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { interval, Subscription } from 'rxjs';
import { finalize, startWith, switchMap } from 'rxjs/operators';

/* PrimeNG: usar componentes standalone coherentes con el HTML */
import { Button } from 'primeng/button';
import { Select } from 'primeng/select';
import { DatePicker } from 'primeng/datepicker';
import { InputNumber } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table'; // Table NO es standalone
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Card } from 'primeng/card';
import { Panel } from 'primeng/panel';
import { ProgressSpinner } from 'primeng/progressspinner';
import { MessageService, ConfirmationService } from 'primeng/api';

/* Servicio + DTOs */
import {
  AcquistiService,
  AgenteSaldo,
  SuggestimentoData,
  PreviewRequest,
  PreviewResponse,
  Titolo,
} from '../../acquisti/acquisti.service';

/* Tu lista standalone */
import { AcquistiListComponent } from '../../acquisti/acquisti-list/acquisti-list.component';

@Component({
  selector: 'app-acquisto-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DecimalPipe,

    // PrimeNG (standalone)
    Card,
    Panel,
    Button,
    Select,
    DatePicker,
    InputNumber,
    TableModule,
    ProgressSpinner,
    Toast,
    ConfirmDialog,

    // propios
    AcquistiListComponent,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './acquisto-form.component.html',
  styleUrls: ['./acquisto-form.component.css'],
})
export class AcquistoFormComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private ms = inject(MessageService);
  private confirm = inject(ConfirmationService);

  constructor(private api: AcquistiService) {}

  @ViewChild(AcquistiListComponent) listCmp?: AcquistiListComponent;

  loading = false;
  error: string | null = null;

  titoli: Titolo[] = [];
  rows: AgenteSaldo[] = [];
  polling?: Subscription;
  pollingMs = 5000;

  agentiInfo?: { data: string; numAgenti: number; agenti: AgenteSaldo[] };
  numAgentiAttivi = 0;

  form = this.fb.nonNullable.group({
    titoloCodice: ['', Validators.required],
    dataCompra: [this.todayIso(), [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
    importoTotale: [10000, [Validators.required, Validators.min(0.01)]],
    quantitaTotale: [1, [Validators.required, Validators.min(1)]],
  });

  preview: PreviewResponse | null = null;

  // (estos ya no se usan con p-toast, puedes borrarlos si quieres)
  toastMsg = '';
  toastType: 'success' | 'info' | 'error' = 'info';
  toastVisible = false;
  private toastTimer?: any;

  // Tema oscuro
  isDark = false;

  // ---------------- lifecycle ----------------
  ngOnInit(): void {
    this.refreshSaldosUnifiedOnce();
    this.startUnifiedPolling();
    this.verAgentesActivos();
    this.initTheme();

    this.api.getTitoli().subscribe({
      next: (res) => {
        this.titoli = res ?? [];
        const cur = this.form.get('titoloCodice')!.value;
        if (!cur && this.titoli.length > 0) {
          this.form.patchValue({ titoloCodice: this.titoli[0].codice });
        }
      },
      error: (err) => this.setHttpError(err, 'No se pudieron cargar los títulos'),
    });
  }

  ngOnDestroy(): void {
    this.polling?.unsubscribe();
    this.hideToast();
  }

  // ---------------- tema oscuro ----------------
  private initTheme(): void {
    const saved = localStorage.getItem('theme'); // 'dark' | 'light' | null
    if (saved === 'dark' || saved === 'light') {
      this.isDark = saved === 'dark';
    } else {
      // si no hay preferencia guardada, usa la del sistema
      this.isDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    }
    this.applyThemeClass();
  }

  toggleDark(): void {
    this.isDark = !this.isDark;
    localStorage.setItem('theme', this.isDark ? 'dark' : 'light');
    this.applyThemeClass();
  }

  private applyThemeClass(): void {
    const root = document.documentElement; // <html>
    // Clase para el selector del tema
    root.classList.toggle('dark', this.isDark);
    // Atributo alternativo que algunas libs consultan
    root.setAttribute('data-p-theme', this.isDark ? 'dark' : 'light');
  }

  // ---------------- helpers UI ----------------
  isTodaySelected(): boolean {
    const d = (this.form.get('dataCompra')?.value || '').trim();
    return !!d && d === this.todayIso();
  }

  // ---------------- acciones ----------------
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
          this.showToast(this.error || 'Error al confirmar compra', 'error', 4000);
        },
      });
  }

  onSuggerisciData(): void {
    this.sugerirFecha();
  }

  sugerirFecha(): void {
    this.error = null;

    const titolo = (this.form.get('titoloCodice')?.value as string | undefined)?.trim();
    if (!titolo) {
      this.error = 'Debe seleccionar un título';
      return;
    }

    const n = this.agentiInfo?.numAgenti ?? this.agentiInfo?.agenti?.length ?? 0;
    if (n <= 0) {
      this.error = 'No hay agentes activos para sugerir una fecha.';
      return;
    }

    this.loading = true;
    this.api.suggestData(titolo, n).subscribe({
      next: (sug: SuggestimentoData) => {
        const iso = this.toIsoFromDmy(sug.dataSuggerita);
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
    const dataIso = ((this.form.get('dataCompra')?.value as string) || '').trim();
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
    this.confirm.confirm({
      header: 'Reiniciar saldos',
      message: 'Esto pondrá los saldos a cero. ¿Seguro?',
      icon: 'pi pi-trash',
      acceptLabel: 'Sí, reiniciar',
      rejectLabel: 'Cancelar',
      accept: () => this._resetSaldosReal(),
    });
  }

  private _resetSaldosReal(): void {
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
        this.showToast(this.error || 'Error al reiniciar saldos', 'error', 4000);
      },
    });
  }

  confirmarDesdePreview(): void {
    if (!this.preview) return;
    this.confirm.confirm({
      header: 'Confirmar compra',
      message: '¿Deseas confirmar esta compra?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, confirmar',
      rejectLabel: 'Cancelar',
      accept: () => this.doConferma(),
    });
  }

  cancelarPreview(): void {
    this.preview = null;
  }

  // ---------------- data helpers ----------------
  private refreshSaldosUnifiedOnce(): void {
    const dateIso = (this.form.get('dataCompra')?.value || '').trim();

    if (!dateIso) {
      this.rows = [];
      return;
    }

    if (this.isTodaySelected()) {
      this.api.getSaldiAgenti().subscribe({
        next: (res) => (this.rows = res),
        error: (err) => this.setHttpError(err, 'No se pudieron obtener saldos en vivo'),
      });
    } else {
      this.api.getAgentiAttiviAlla(dateIso).subscribe({
        next: (res) => {
          this.agentiInfo = res;
          this.numAgentiAttivi = res?.numAgenti ?? res?.agenti?.length ?? 0;
          this.rows = res.agenti || [];
        },
        error: (err) => this.setHttpError(err, 'No se pudieron obtener saldos a la fecha'),
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
        error: (err) => this.setHttpError(err, 'No se pudieron obtener saldos (polling)'),
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
        (typeof e === 'string' && e.trim()) || e?.message || e?.code || e?.detail || e?.error || '';
      if (msg) {
        emit(msg);
        return;
      }
    }

    emit(err.statusText || err.message || fallback);
  }

  // Toast Prime (MessageService)
  showToast(msg: string, type: 'success' | 'info' | 'error' = 'info', ms = 2500): void {
    this.ms.add({
      severity: type === 'error' ? 'error' : type,
      summary: type === 'success' ? 'OK' : type === 'error' ? 'Error' : 'Info',
      detail: msg,
      life: ms,
    });
  }
  hideToast(): void {
    /* no-op: lo maneja p-toast */
  }

  // ---------------- getters extra ----------------
  get saldoTotaleDisponibile(): number {
    return (this.rows || []).reduce((acc, a) => acc + (a?.saldoDisponibile ?? 0), 0);
  }

  get badgeType(): 'ok' | 'warn' | 'neg' {
    const tot = this.saldoTotaleDisponibile;
    if (tot < 0) return 'neg';
    const imp = Number(this.form.get('importoTotale')?.value) || 0;
    return imp > tot ? 'warn' : 'ok';
  }

  get diffLabel(): string {
  const diff = this.diffImporteSaldo();
  if (diff > 0) return 'Saldo restante';
  if (diff === 0) return 'Saldo exacto';
  return 'Falta';
}


  diffImporteSaldo(): number {
    const imp = Number(this.form.get('importoTotale')?.value) || 0;
    return this.saldoTotaleDisponibile - imp;
  }
}
