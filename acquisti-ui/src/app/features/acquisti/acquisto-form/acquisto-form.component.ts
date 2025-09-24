import { Component, OnInit, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { interval, Subscription } from 'rxjs';
import { finalize, startWith, switchMap } from 'rxjs/operators';

/* PrimeNG (standalone o módulos) */
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
} from '../../acquisti/acquisti.service';

/* Lista standalone */
import { AcquistiListComponent } from '../../acquisti/acquisti-list/acquisti-list.component';

@Component({
  selector: 'app-acquisto-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DecimalPipe,
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
  /* --------- inyección --------- */
  private fb = inject(FormBuilder);
  private ms = inject(MessageService);
  private confirm = inject(ConfirmationService);
  constructor(private api: AcquistiService) {}

  @ViewChild(AcquistiListComponent) listCmp?: AcquistiListComponent;
  @ViewChild('chart') chartComp?: any; // <p-chart #chart>

  /* --------- estado base --------- */
  loading = false;
  error: string | null = null;

  titoli: Titolo[] = [];
  rows: Array<AgenteSaldo & { quantitaTitoli?: number }> = [];

  agentiInfo?: { data: string; numAgenti: number; agenti: AgenteSaldo[] };
  numAgentiAttivi = 0;

  polling?: Subscription;
  pollingMs = 5000;

  form = this.fb.nonNullable.group({
    titoloCodice: ['', Validators.required],
    dataCompra: [this.todayIso(), [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
    importoTotale: [10000, [Validators.required, Validators.min(0.01)]],
    quantitaTotale: [1, [Validators.required, Validators.min(1)]],
  });

  /* --------- preview --------- */
  preview: PreviewResponse | null = null;
  previewVisible = false;

  /* --------- tema --------- */
  isDark = false;

  /* --------- init importe con saldo (una sola vez) --------- */
  private importoInizializzato = false;

  /* --------- Chart (PrimeNG Chart wrapper / Chart.js) --------- */
  chartData: any = { labels: [], datasets: [] };
  chartOptions: any;

  /* ==================== lifecycle ==================== */
  ngOnInit(): void {
    this.refreshSaldosUnifiedOnce();
    this.rebuildChartFromBackend(); // si el backend expone serie 15 días
    this.startUnifiedPolling();
    this.verAgentesActivos();
    this.initTheme();
    this.ensureChartPlaceholder();
    this.setDemoChart();//Quitar cuando tenga hecho el back point
    
    // Cargar títulos
    this.api.getTitoli().subscribe({
      next: (res) => {
        this.titoli = res ?? [];
        if (!this.form.get('titoloCodice')!.value && this.titoli.length) {
          this.form.patchValue({ titoloCodice: this.titoli[0].codice });
        }
      },
      error: (err) => this.setHttpError(err, 'No se pudieron cargar los títulos'),
    });

    // Si aún no tienes endpoint del gráfico, deja un demo inicial:
    // this.setChart(demoLabels, demoCompras, demoSaldo);
  }

  ngOnDestroy(): void {
    this.polling?.unsubscribe();
  }

  private setDemoChart(): void {
    const labels = Array.from({ length: 15 }, (_, i) => (i === 14 ? 'Hoy' : `${-14 + i}`));
    const compras = [0, 50, 0, 20, 0, 0, 60, 0, 0, 0, 80, 0, 0, 0, 0];
    const saldo = [
      4500, 4520, 4520, 4540, 4540, 4540, 4600, 4600, 4600, 4600, 4700, 4700, 4700, 4700, 4687.5,
    ];
    this.setChart(labels, compras, saldo);
  }

  /* ==================== Tema ==================== */
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
    // re-sincronizar estilos del chart
    this.buildChartOptions();
    queueMicrotask(() => this.chartComp?.refresh?.());
  }
  private applyThemeClass(): void {
    const root = document.documentElement;
    root.classList.toggle('dark', this.isDark);
    root.setAttribute('data-p-theme', this.isDark ? 'dark' : 'light');
  }

  /* ==================== Acciones ==================== */
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
          this.previewVisible = true;
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
          this.previewVisible = false;
          this.showToast('Compra confirmada', 'success');
          this.refreshSaldosUnifiedOnce();
          this.startUnifiedPolling();
          this.verAgentesActivos();
          this.listCmp?.load();
          // refrescar gráfico si el backend lo expone
          this.rebuildChartFromBackend();
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
        this.rebuildChartFromBackend();
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
      error: (err: HttpErrorResponse) =>
        this.setHttpError(err, 'No se pudo obtener agentes activos'),
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
    this.previewVisible = false;
  }

  /* ==================== Data ==================== */
  private refreshSaldosUnifiedOnce(): void {
    const dateIso = (this.form.get('dataCompra')?.value || '').trim();
    if (!dateIso) {
      this.rows = [];
      return;
    }

    if (this.isTodaySelected()) {
      this.api.getSaldiAgenti().subscribe({
        next: (res) => {
          this.rows = this.normalizeRows(res as Array<AgenteSaldo & { quantitaTitoli?: number }>);
          this.tryInitImportoTotaleConSaldo();
        },
        error: (err) => this.setHttpError(err, 'No se pudieron obtener saldos en vivo'),
      });
    } else {
      this.api.getAgentiAttiviAlla(dateIso).subscribe({
        next: (res) => {
          this.agentiInfo = res;
          this.numAgentiAttivi = res?.numAgenti ?? res?.agenti?.length ?? 0;
          this.rows = this.normalizeRows(
            (res.agenti ?? []) as Array<AgenteSaldo & { quantitaTitoli?: number }>
          );
          this.tryInitImportoTotaleConSaldo();
        },
        error: (err) => this.setHttpError(err, 'No se pudieron obtener saldos a la fecha'),
      });
    }
  }

  private tryInitImportoTotaleConSaldo(): void {
    if (this.importoInizializzato) return;
    const tot = this.saldoTotaleDisponibile;
    const iniziale = Math.max(0, Math.floor(tot));
    this.form.patchValue({ importoTotale: iniziale });
    this.importoInizializzato = true;
  }

  /** Obtiene serie de últimos 15 días y actualiza el chart (si la API existe). */
  private rebuildChartFromBackend(): void {
    const dataIso = (this.form.get('dataCompra')?.value || '').trim();
    // Si tu servicio aún no tiene este método, comenta este bloque:
    if ((this.api as any)?.getAttivitaUltimi15Giorni) {
      (this.api as any).getAttivitaUltimi15Giorni(dataIso).subscribe({
        next: (res: any) => {
          const labels: string[] = res?.labels ?? [];
          const compras: number[] = res?.compras ?? Array(labels.length).fill(0);
          const saldo: number[] = res?.saldo ?? Array(labels.length).fill(0);
          // asegúrate que el último label diga “Hoy” si corresponde
          if (this.isTodaySelected() && labels.length) labels[labels.length - 1] = 'Hoy';
          this.setChart(labels, compras, saldo);
        },
        error: () => {
          /* mantener gráfico actual */
        },
      });
    }
  }

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
        next: (res) => {
          this.rows = this.normalizeRows(res as Array<AgenteSaldo & { quantitaTitoli?: number }>);
          // refresca el gráfico si tu backend entrega serie live:
          this.rebuildChartFromBackend();
        },
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

  showToast(msg: string, type: 'success' | 'info' | 'error' = 'info', ms = 2500): void {
    this.ms.add({
      severity: type === 'error' ? 'error' : type,
      summary: type === 'success' ? 'OK' : type === 'error' ? 'Error' : 'Info',
      detail: msg,
      life: ms,
    });
  }

  /* ==================== helpers ==================== */
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
  private toIsoFromDmy(dmy: string): string {
    const [dd, mm, yyyy] = dmy.split('-');
    return `${yyyy}-${mm}-${dd}`;
  }

  /* ==================== Chart helpers ==================== */
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
    const todayIdx = (this.chartData.labels || []).length - 1;

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
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (ctx: any) => {
              const val = Number(ctx.raw?.y ?? ctx.parsed?.y ?? 0);
              let base = ` ${ctx.dataset.label}: ${this.fmtEUR(val)}`;
              const prev =
                ctx.dataIndex > 0 ? Number(ctx.dataset.data[ctx.dataIndex - 1]?.y ?? 0) : null;
              if (prev != null && ctx.dataset.label !== 'Compras (MA7)') {
                const delta = val - prev;
                base += ` (${delta >= 0 ? '+' : ''}${this.fmtEUR(delta)})`;
              }
              return base;
            },
          },
        },
        // Requiere registro de plugins en main.ts
        annotation: {
          annotations: {
            hoy: {
              type: 'line',
              xMin: todayIdx,
              xMax: todayIdx,
              borderColor: 'rgba(255,255,255,.35)',
              borderWidth: 1.5,
              borderDash: [6, 4],
              label: {
                display: true,
                content: 'HOY',
                position: 'start',
                color: '#bbb',
                backgroundColor: 'transparent',
                yAdjust: -12,
              },
            },
          },
        },
        zoom: {
          pan: { enabled: true, mode: 'x' },
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
        },
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

  /** Si no hay datos del backend, muestra un placeholder para no ver el canvas vacío */
  private ensureChartPlaceholder(): void {
    const hasData = Array.isArray(this.chartData?.datasets) && this.chartData.datasets.length > 0;
    if (hasData) return;

    const labels = Array.from({ length: 15 }, (_, i) => (i === 14 ? 'Hoy' : `${-14 + i}`));
    const compras = Array(15).fill(0);
    const saldoLineal = Array(15).fill(this.saldoTotaleDisponibile || 0);

    this.setChart(labels, compras, saldoLineal);
  }

  /* ==================== Getters ==================== */
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
  get dedupedRows(): Array<AgenteSaldo & { quantitaTitoli?: number }> {
    return this.normalizeRows(this.rows);
  }
  trackByIdCf(_i: number, r: AgenteSaldo & { codiceFiscale: string }): string {
    return `${r.id}|${r.codiceFiscale}`;
  }
  diffImporteSaldo(): number {
    const imp = Number(this.form.get('importoTotale')?.value) || 0;
    return this.saldoTotaleDisponibile - imp;
  }
}
