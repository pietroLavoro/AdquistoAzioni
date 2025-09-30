import { Component, OnInit, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { interval, Subscription } from 'rxjs';
import { finalize, startWith, switchMap } from 'rxjs/operators';

/* PrimeNG (standalone) */
import { Button } from 'primeng/button';
import { Select } from 'primeng/select';
import { DatePicker } from 'primeng/datepicker';
import { InputNumber } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Card } from 'primeng/card';
import { ProgressSpinner } from 'primeng/progressspinner';
import { MessageService, ConfirmationService } from 'primeng/api';
import { Dialog } from 'primeng/dialog';
import { ChartModule } from 'primeng/chart';

/* Servicio + DTOs */
import {
  AcquistiService,
  AgenteSaldo,
  SuggestimentoData,
  PreviewRequest,
  PreviewResponse,
  Titolo,
} from '../acquisti.service';

/* Lista standalone */
import { AcquistiListComponent } from '../acquisti-list/acquisti-list.component';

@Component({
  selector: 'app-acquisto-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    // PrimeNG
    Card,
    Button,
    Select,
    DatePicker,
    InputNumber,
    TableModule,
    ProgressSpinner,
    Toast,
    Dialog,
    ConfirmDialog,
    ChartModule,
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
  @ViewChild('chart') chartComp?: any; // <p-chart #chart>

  loading = false;
  error: string | null = null;

  titoli: Titolo[] = [];
  rows: Array<AgenteSaldo & { quantitaTitoli?: number }> = [];

  numAgentiAttivi = 0;

  polling?: Subscription;
  pollingMs = 5000;

  form = this.fb.nonNullable.group({
    titoloCodice: ['', Validators.required],
    dataCompra: [this.todayIso(), [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
    importoTotale: [10000, [Validators.required, Validators.min(0.01)]],
    quantitaTotale: [1, [Validators.required, Validators.min(1)]],
  });

  preview: PreviewResponse | null = null;
  previewVisible = false;

  isDark = false;
  private importoInizializzato = false;

  chartData: any = { labels: [], datasets: [] };
  chartOptions: any;

  ngOnInit(): void {
    this.refreshSaldosUnifiedOnce();
    this.rebuildChartFromBackend();
    this.startUnifiedPolling();
    this.initTheme();
    this.ensureChartPlaceholder();
    this.setDemoChart(); // quitar cuando haya endpoint real

    // Cargar títulos
    this.api.getTitoli().subscribe({
      next: (res: Titolo[]) => {
        this.titoli = res ?? [];
        if (!this.form.get('titoloCodice')!.value && this.titoli.length) {
          this.form.patchValue({ titoloCodice: this.titoli[0].codice });
        }
      },
      error: (err: HttpErrorResponse) =>
        this.setHttpError(err, 'No se pudieron cargar los títulos'),
    });
  }

  ngOnDestroy(): void {
    this.polling?.unsubscribe();
  }

  /* =======================================================
   *               Acciones principales
   * ======================================================= */

  doPreview(): void {
    this.error = null;
    const req = this.buildRequest();
    if (!req) return;

    this.loading = true;
    this.api
      .preview(req)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (resp: PreviewResponse) => {
          this.preview = resp;
          this.previewVisible = true;
          this.showToast('Previsualización OK', 'info');
        },
        error: (err: HttpErrorResponse) => {
          this.preview = null;
          this.setHttpError(err, 'Error al previsualizar');
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
          this.previewVisible = false;
          this.showToast('Compra confirmada', 'success');
          this.refreshSaldosUnifiedOnce();
          this.startUnifiedPolling();
          this.listCmp?.load();
          this.rebuildChartFromBackend();
        },
        error: (err: HttpErrorResponse) => this.setHttpError(err, 'Error al confirmar compra'),
      });
  }

  onSuggerisciData(): void {
    this.sugerirFecha();
  }

  sugerirFecha(): void {
    this.error = null;

    // 1) tomar el valor del form
    let raw = (this.form.get('titoloCodice')?.value ?? '').toString().trim();
    if (!raw) {
      this.error = 'Debe seleccionar un título';
      return;
    }

    // 2) normalizar: si viene "Apple Inc._AAPL" o "AAPL - Apple"
    //   nos quedamos solo con el código del final
    //   (puedes ajustar la heurística si cambias los datos)
    let codice = raw;
    if (raw.includes('_')) {
      const parts = raw.split('_');
      codice = parts[parts.length - 1].trim();
    } else if (raw.includes('-')) {
      // ejemplo: "AAPL - Apple Inc."
      codice = raw.split('-')[0].trim();
    }

    const n = Math.max(0, Number(this.numAgentiAttivi) || 0);
    if (n <= 0) {
      this.error = 'No hay agentes activos para sugerir una fecha.';
      return;
    }

    this.loading = true;
    this.api.suggestData(codice, n).subscribe({
      next: (sug) => {
        this.form.patchValue({ dataCompra: sug.date });
        this.refreshSaldosUnifiedOnce();
        this.startUnifiedPolling();
        this.loading = false;
        this.rebuildChartFromBackend();
      },
      error: (err) => {
        this.setHttpError(err, 'Error al sugerir fecha');
        this.loading = false;
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
        this.rebuildChartFromBackend();
      },
      error: (err: HttpErrorResponse) => this.setHttpError(err, 'Error al reiniciar saldos'),
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
    this.previewVisible = false;
  }

  /* =======================================================
   *               Carga de datos / polling
   * ======================================================= */

  private refreshSaldosUnifiedOnce(): void {
    const dateIso = (this.form.get('dataCompra')?.value || '').trim();
    if (!dateIso) {
      this.rows = [];
      this.numAgentiAttivi = 0;
      return;
    }

    if (this.isTodaySelected()) {
      this.api.getSaldiAgenti().subscribe({
        next: (res: AgenteSaldo[]) => {
          this.rows = this.normalizeRows(res as Array<AgenteSaldo & { quantitaTitoli?: number }>);
          this.numAgentiAttivi = this.rows.length;
          this.tryInitImportoTotaleConSaldo();
        },
        error: (err: HttpErrorResponse) =>
          this.setHttpError(err, 'No se pudieron obtener saldos en vivo'),
      });
    } else {
      this.rows = [];
      this.numAgentiAttivi = 0;
    }
  }

  private verAgentesActivos(): void {
    const d = (this.form.get('dataCompra')?.value || '').trim();
    if (!d) {
      this.numAgentiAttivi = 0;
      return;
    }
    // ⬇⬇⬇ nombre correcto del método del service
    this.api.getAgentiAttivi(d).subscribe({
      next: (n: number) => (this.numAgentiAttivi = Number(n) || 0),
      error: () => (this.numAgentiAttivi = 0),
    });
  }

  private tryInitImportoTotaleConSaldo(): void {
    if (this.importoInizializzato) return;
    const tot = this.saldoTotaleDisponibile;
    const iniziale = Math.max(0, Math.floor(tot));
    this.form.patchValue({ importoTotale: iniziale });
    this.importoInizializzato = true;
  }

  private rebuildChartFromBackend(): void {
    const dataIso = (this.form.get('dataCompra')?.value || '').trim();
    if ((this.api as any)?.getAttivitaUltimi15Giorni) {
      (this.api as any).getAttivitaUltimi15Giorni(dataIso).subscribe({
        next: (res: any) => {
          const labels: string[] = res?.labels ?? [];
          const compras: number[] = res?.compras ?? Array(labels.length).fill(0);
          const saldo: number[] = res?.saldo ?? Array(labels.length).fill(0);
          if (this.isTodaySelected() && labels.length) labels[labels.length - 1] = 'Hoy';
          this.setChart(labels, compras, saldo);
        },
        error: () => {},
      });
    }
  }

  /* =======================================================
   *                    Utilidades
   * ======================================================= */

  private normalizeRows(
    arr: Array<AgenteSaldo & { quantitaTitoli?: number }>
  ): Array<AgenteSaldo & { quantitaTitoli?: number }> {
    const seen = new Set<string>();
    const out: Array<AgenteSaldo & { quantitaTitoli?: number }> = [];
    for (const r of arr ?? []) {
      const key = String(r.id);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(r);
      }
    }
    return out;
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

    // ⬇⬇⬇ keys correctas del PreviewRequest (service)
    const req: PreviewRequest = {
      titoloCodice: titolo,
      data: dataIso,
      importo: imp,
      quantita: qta,
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
        next: (res: AgenteSaldo[]) => {
          this.rows = this.normalizeRows(res as Array<AgenteSaldo & { quantitaTitoli?: number }>);
          this.numAgentiAttivi = this.rows.length;
          this.rebuildChartFromBackend();
        },
        error: (err: HttpErrorResponse) =>
          this.setHttpError(err, 'No se pudieron obtener saldos (polling)'),
      });
  }

  private setHttpError(err: HttpErrorResponse, fallback = 'Error'): void {
    const msg =
      (typeof err.error === 'string' && err.error.trim()) ||
      (err.error && (err.error.message || err.error.detail || err.error.code || err.error.error)) ||
      err.statusText ||
      err.message ||
      fallback;
    this.error = msg;
    this.showToast(msg, 'error', 4000);
  }

  showToast(msg: string, type: 'success' | 'info' | 'error' = 'info', ms = 2500): void {
    this.ms.add({
      severity: type === 'error' ? 'error' : type,
      summary: type === 'success' ? 'OK' : type === 'error' ? 'Error' : 'Info',
      detail: msg,
      life: ms,
    });
  }

  isTodaySelected(): boolean {
    const d = (this.form.get('dataCompra')?.value || '').trim();
    return !!d && d === this.todayIso();
  }
  private todayIso(): string {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  private fmtEUR = (v: number) =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(v);

  private chartColors() {
    const text =
      getComputedStyle(document.documentElement).getPropertyValue('--soft-text')?.trim() ||
      '#e8ebf1';
    const grid = 'rgba(255,255,255,.08)';
    return { text, grid };
  }

  private buildChartOptions() {
    const { text, grid } = this.chartColors();
    this.chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      locale: 'es-ES',
      scales: {
        x: { ticks: { color: text }, grid: { color: grid } },
        y: {
          ticks: {
            color: text,
            callback: (v: number) => this.fmtEUR(Number(v)).replace(',00', ''),
          },
          grid: { color: grid },
        },
        ySaldo: {
          position: 'right',
          ticks: {
            color: text,
            callback: (v: number) => this.fmtEUR(Number(v)).replace(',00', ''),
          },
          grid: { drawOnChartArea: false, color: grid },
        },
      },
      plugins: {
        legend: { labels: { color: text, usePointStyle: true, boxHeight: 6 } },
        tooltip: { mode: 'index', intersect: false },
      },
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
    };
  }

  private ma(values: number[], window = 7): number[] {
    const out = Array(values.length).fill(0);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= window) sum -= values[i - window];
      out[i] = i >= window - 1 ? +(sum / window).toFixed(2) : NaN;
    }
    return out;
  }

  setChart(labels: string[], compras: number[], saldo: number[]) {
    const ma7 = this.ma(compras, 7);
    this.chartData = {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Compras',
          data: labels.map((_, i) => ({ x: labels[i], y: compras[i] ?? 0 })),
          borderWidth: 0,
          backgroundColor: 'rgba(0, 153, 255, .35)',
          borderRadius: 6,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Compras (MA7)',
          data: labels.map((_, i) => ({ x: labels[i], y: ma7[i] })),
          spanGaps: true,
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Saldo disponible',
          data: labels.map((_, i) => ({ x: labels[i], y: saldo[i] ?? 0 })),
          borderWidth: 2,
          pointRadius: 3,
          fill: false,
          yAxisID: 'ySaldo',
        },
      ],
    };
    this.buildChartOptions();
    queueMicrotask(() => this.chartComp?.refresh?.());
  }

  private ensureChartPlaceholder(): void {
    const hasData = Array.isArray(this.chartData?.datasets) && this.chartData.datasets.length > 0;
    if (hasData) return;
    const labels = Array.from({ length: 15 }, (_, i) => (i === 14 ? 'Hoy' : `${-14 + i}`));
    const compras = Array(15).fill(0);
    const saldoLineal = Array(15).fill(this.saldoTotaleDisponibile || 0);
    this.setChart(labels, compras, saldoLineal);
  }

  get saldoTotaleDisponibile(): number {
    // ⬇⬇⬇ campo correcto: 'disponibile'
    return (this.rows || []).reduce((acc, a) => acc + (a?.disponibile ?? 0), 0);
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
  get dedupedRows(): Array<AgenteSaldo & { quantitaTitoli?: number }> {
    return this.normalizeRows(this.rows);
  }
  trackByIdCf(_i: number, r: AgenteSaldo & { cf?: string }): string {
    return `${r.id}|${r.cf ?? ''}`;
  }
  diffImporteSaldo(): number {
    const imp = Number(this.form.get('importoTotale')?.value) || 0;
    return this.saldoTotaleDisponibile - imp;
  }

  /* ================== Tema ================== */

  private setDemoChart(): void {
    const labels = Array.from({ length: 15 }, (_, i) => (i === 14 ? 'Hoy' : `${-14 + i}`));
    const compras = [0, 50, 0, 20, 0, 0, 60, 0, 0, 0, 80, 0, 0, 0, 0];
    const saldo = [
      4500, 4520, 4520, 4540, 4540, 4540, 4600, 4600, 4600, 4600, 4700, 4700, 4700, 4700, 4687.5,
    ];
    this.setChart(labels as any, compras as any, saldo as any);
  }

  private initTheme(): void {
    const saved = localStorage.getItem('theme');
    this.isDark = saved
      ? saved === 'dark'
      : window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    this.applyThemeClass();
  }
  toggleDark(): void {
    this.isDark = !this.isDark;
    localStorage.setItem('theme', this.isDark ? 'dark' : 'light');
    this.applyThemeClass();
    this.buildChartOptions();
    queueMicrotask(() => this.chartComp?.refresh?.());
  }
  private applyThemeClass(): void {
    const root = document.documentElement;
    root.classList.toggle('dark', this.isDark);
    root.setAttribute('data-p-theme', this.isDark ? 'dark' : 'light');
  }
}
