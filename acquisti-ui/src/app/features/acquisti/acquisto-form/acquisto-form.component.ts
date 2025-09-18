import { Component, OnInit, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { interval, Subscription } from 'rxjs';
import { startWith, switchMap, finalize } from 'rxjs/operators';

// Subcomponente de lista (compras registradas)
import { AcquistiListComponent } from '../acquisti-list/acquisti-list.component';

// Servicio + DTOs
import {
  AcquistiService,
  AgenteSaldo,
  SuggestimentoData,
  PreviewRequest,
  PreviewResponse,
  Titolo,
} from '../../acquisti/acquisti.service';

@Component({
  selector: 'app-acquisto-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DecimalPipe, AcquistiListComponent],
  templateUrl: './acquisto-form.component.html',
  styleUrls: ['./acquisto-form.component.css'],
})
export class AcquistoFormComponent implements OnInit, OnDestroy {
  // -------------------- estado base --------------------
  private fb = inject(FormBuilder);
  constructor(private api: AcquistiService) {}

  @ViewChild(AcquistiListComponent) listCmp?: AcquistiListComponent;

  loading = false;                // bloquea botones mientras hay request en curso
  error: string | null = null;    // mensaje de error visible en la UI

  // -------------------- combos / datos maestros --------------------
  titoli: Titolo[] = [];

  // -------------------- panel unificado de saldos --------------------
  /** Filas que muestra la tabla unificada (en vivo si es HOY; “a la fecha” si no) */
  rows: AgenteSaldo[] = [];

  /** Polling de saldos en vivo (solo si la fecha seleccionada es HOY) */
  polling?: Subscription;
  pollingMs = 5000;

  // -------------------- “agentes activos a la fecha” (para badge y sugerencia) --------------------
  agentiInfo?: { data: string; numAgenti: number; agenti: AgenteSaldo[] };
  numAgentiAttivi = 0;

  // -------------------- formulario (FECHA en **ISO yyyy-MM-dd**) --------------------
  form = this.fb.nonNullable.group({
    titoloCodice: ['', Validators.required],
    dataCompra: [this.todayIso(), [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
    importoTotale: [10000, [Validators.required, Validators.min(0.01)]],
    quantitaTotale: [1, [Validators.required, Validators.min(1)]],
  });

  // -------------------- bloque de previsualización --------------------
  preview: PreviewResponse | null = null;

  // -------------------- mini-toast básico --------------------
  toastMsg = '';
  toastType: 'success' | 'info' | 'error' = 'info';
  toastVisible = false;
  private toastTimer?: any;

  // ======================================================
  // ciclo de vida
  // ======================================================
  ngOnInit(): void {
    // tabla unificada inicial (si hoy → en vivo; si no → a la fecha)
    this.refreshSaldosUnifiedOnce();

    // activa polling solo si la fecha seleccionada es HOY
    this.startUnifiedPolling();

    // agentes activos a la fecha (para badge + sugerir fecha)
    this.verAgentesActivos();

    // cargar títulos y seleccionar el primero si no hay selección
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

  // ======================================================
  // acciones de UI
  // ======================================================

  /** ¿la fecha del form es “hoy”? (para decidir si hay polling y qué mostrar) */
  isTodaySelected(): boolean {
    const d = (this.form.get('dataCompra')?.value || '').trim();
    return !!d && d === this.todayIso();
  }

  /** Previsualiza la compra y muestra el bloque de reparto. */
  doPreview(): void {
    this.error = null;
    const req = this.buildRequest(); // construye payload (fecha ISO, numéricos validados)
    if (!req) return;

    this.loading = true;
    this.api
      .preview(req)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (resp: PreviewResponse) => {
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

  /** Confirma la compra (flujo directo). Recomendado confirmar desde el bloque de preview. */
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
          // refrescos inmediatos
          this.refreshSaldosUnifiedOnce();
          this.startUnifiedPolling();
          this.verAgentesActivos();
          this.listCmp?.load(); // recarga “compras registradas”
        },
        error: (err) => {
          this.setHttpError(err, 'Error al confirmar compra');
          this.showToast(this.error || 'Error al confirmar compra', 'error', 4000);
        },
      });
  }

  /** Click del botón “Sugerir fecha”. */
  onSuggerisciData(): void {
    this.sugerirFecha();
  }

  /**
   * Sugerir fecha:
   * - valida título
   * - usa #agentes activos (badge) para esa fecha
   * - llama al backend (devuelve dd-MM-yyyy)
   * - convierte a ISO yyyy-MM-dd para el `<input type="date">`
   * - refresca agentes y la tabla unificada
   */
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
        // backend devuelve dd-MM-yyyy → convierto a ISO para el input type="date"
        const iso = this.toIsoFromDmy(sug.dataSuggerita);
        this.form.patchValue({ dataCompra: iso });

        // refrescos
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

  /** Obtiene agentes activos a la fecha del formulario (ISO). */
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

  /** Resetea los saldos de prueba y refresca ambos paneles + lista. */
  resetSaldos(): void {
    this.error = null;
    this.api.resetSaldos().subscribe({
      next: () => {
        this.showToast('Saldos reiniciados', 'success');
        this.preview = null;

        this.refreshSaldosUnifiedOnce();
        this.startUnifiedPolling();
        this.verAgentesActivos();
        this.listCmp?.load(); // limpia/recarga lista
      },
      error: (err) => {
        this.setHttpError(err, 'Error al reiniciar saldos');
        this.showToast(this.error || 'Error al reiniciar saldos', 'error', 4000);
      },
    });
  }

  /** Confirma desde el bloque de preview. */
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
          this.showToast(this.error || 'Error al confirmar compra', 'error', 4000);
        },
      });
  }

  /** Cierra el bloque de previsualización. */
  cancelarPreview(): void {
    this.preview = null;
  }

  // ======================================================
  // helpers de datos y fechas
  // ======================================================

  /**
   * Refresca la tabla unificada:
   * - Si la fecha es HOY → llama saldos “en vivo”
   * - Si la fecha NO es hoy → llama “agentes a la fecha”
   */
  private refreshSaldosUnifiedOnce(): void {
    const dateIso = (this.form.get('dataCompra')?.value || '').trim();

    if (!dateIso) {
      this.rows = [];
      return;
    }

    if (this.isTodaySelected()) {
      // en vivo
      this.api.getSaldiAgenti().subscribe({
        next: (res) => (this.rows = res),
        error: (err) => this.setHttpError(err, 'No se pudieron obtener saldos en vivo'),
      });
    } else {
      // a la fecha
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

  /** Convierte “dd-MM-yyyy” → “yyyy-MM-dd” (para el `<input type="date">`). */
  private toIsoFromDmy(dmy: string): string {
    const [dd, mm, yyyy] = dmy.split('-');
    return `${yyyy}-${mm}-${dd}`;
  }

  /** “Hoy” en ISO (`yyyy-MM-dd`) para inputs y endpoints. */
  private todayIso(): string {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  /**
   * Construye el payload para preview/conferma:
   * - Usa fecha ISO (yyyy-MM-dd) tal cual (tu backend ya la acepta en JSON)
   * - Valida números
   */
  private buildRequest(): PreviewRequest | null {
    const v = this.form.getRawValue();

    const titolo = String(v.titoloCodice ?? '').trim();
    const dataIso = String(v.dataCompra ?? '').trim(); // SIEMPRE ISO en el form
    const imp = Number(v.importoTotale);
    const qta = Number(v.quantitaTotale);

    if (!titolo || !dataIso || !/^\d{4}-\d{2}-\d{2}$/.test(dataIso) || !isFinite(imp) || !isFinite(qta)) {
      this.error = !dataIso ? 'Fecha inválida.' : 'Formulario inválido';
      return null;
    }

    const req: PreviewRequest = {
      titoloCodice: titolo,
      dataCompra: dataIso,     // tu backend espera ISO en JSON
      importoTotale: imp,
      quantitaTotale: qta,
    };
    return req;
  }

  /** Activa polling únicamente si la fecha seleccionada es HOY. */
  private startUnifiedPolling(): void {
    this.polling?.unsubscribe();

    if (!this.isTodaySelected()) return; // solo hay polling si es HOY

    this.polling = interval(this.pollingMs)
      .pipe(startWith(0), switchMap(() => this.api.getSaldiAgenti()))
      .subscribe({
        next: (res) => (this.rows = res),
        error: (err) => this.setHttpError(err, 'No se pudieron obtener saldos (polling)'),
      });
  }

  // ======================================================
  // manejo de errores (HTTP → mensaje amigable)
  // ======================================================
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

  // ======================================================
  // mini-toast
  // ======================================================
  showToast(msg: string, type: 'success' | 'info' | 'error' = 'info', ms = 2500): void {
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

  // ======================================================
  // utilidades para el badge de saldo total
  // ======================================================
  /** Suma de saldos (lo que se ve en la tabla unificada). */
  get saldoTotaleDisponibile(): number {
    return (this.rows || []).reduce((acc, a) => acc + (a?.saldoDisponibile ?? 0), 0);
  }

  /** Color del badge según si el importe solicitado supera el saldo. */
  get badgeType(): 'ok' | 'warn' | 'neg' {
    const tot = this.saldoTotaleDisponibile;
    if (tot < 0) return 'neg';
    const imp = Number(this.form.get('importoTotale')?.value) || 0;
    return imp > tot ? 'warn' : 'ok';
  }
}
