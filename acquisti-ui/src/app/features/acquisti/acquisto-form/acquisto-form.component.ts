import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { interval, Subscription } from 'rxjs';
import { startWith, switchMap, take, finalize } from 'rxjs/operators';
import { inject } from '@angular/core';
import { ViewChild } from '@angular/core';
import { AcquistiListComponent } from '../acquisti-list/acquisti-list.component';

// Servicio + DTOs
import {
  AcquistiService,
  AgenteSaldo,
  SuggestimentoData,
  PreviewRequest,
  PreviewResponse,
} from '../../acquisti/acquisti.service';

@Component({
  selector: 'app-acquisto-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DecimalPipe, AcquistiListComponent],
  templateUrl: './acquisto-form.component.html',
  styleUrls: ['./acquisto-form.component.css'],
})
export class AcquistoFormComponent implements OnInit, OnDestroy {
  titoli = [
    { code: 'ENEL2025', label: 'ENEL2025 - Obligazione ENEL 2025' },
    { code: 'ENEL2030', label: 'ENEL2030 - Obligazione ENEL 2030' }, // ← el que faltaba
  ];

  @ViewChild(AcquistiListComponent) listCmp?: AcquistiListComponent;
  // ===== Estado base =====
  private fb = inject(FormBuilder);
  loading = false; // bloquea botones mientras hay request en curso
  error?: string; // mensaje de error mostrado en pantalla

  // ===== Panel “saldos en vivo” =====
  saldiLive: AgenteSaldo[] = [];
  polling?: Subscription;
  pollingMs = 5000; // refresco cada 5s

  // ===== Agentes activos a la fecha =====
  agentiInfo?: { data: string; numAgenti: number; agenti: AgenteSaldo[] };
  numAgentiAttivi = 0; // usado por el template para avisar “sin agentes activos”

  // ===== Formulario (fecha en ISO: yyyy-MM-dd) =====
  form = this.fb.nonNullable.group({
    titoloCodice: ['', Validators.required],
    dataCompra: ['', [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
    importoTotale: [10000, [Validators.required, Validators.min(0.01)]],
    quantitaTotale: [1, [Validators.required, Validators.min(1)]],
  });

  // ===== Preview en pantalla =====
  preview: PreviewResponse | null = null;

  // ===== Toast (notificaciones simple) =====
  toastMsg = '';
  toastType: 'success' | 'info' | 'error' = 'info';
  toastVisible = false;
  private toastTimer?: any;

  constructor(private api: AcquistiService) {}
  rows: AgenteSaldo[] = [];

  // ================= Ciclo de vida =================

  isTodaySelected(): boolean {
    const d = (this.form.get('dataCompra')?.value || '').trim();
    return !!d && d === this.todayStr();
  }

  ngOnInit(): void {
    // ✅ Fecha hoy por defecto
    if (!this.form.get('dataCompra')?.value) {
      this.form.patchValue({ dataCompra: this.todayStr() });
    }

    this.refreshSaldosUnifiedOnce();
    this.startUnifiedPolling();

    // refrescar al cambiar de fecha
    this.form.get('dataCompra')?.valueChanges.subscribe(() => {
      this.refreshSaldosUnifiedOnce();
      this.startUnifiedPolling();
    });

    this.verAgentesActivos();
  }

  ngOnDestroy(): void {
    this.polling?.unsubscribe();
    this.hideToast();
  }

  // ================= Acciones de UI =================

  /**
   * Previsualiza (dry-run) y pinta la tabla de reparto en pantalla.
   * Convierte la fecha a yyyyMMdd antes de enviar.
   */
  doPreview(): void {
    this.error = undefined;
    const req = this.buildRequest(); // convierte fecha a yyyyMMdd
    if (!req) return;

    this.loading = true;
    this.api
      .preview(req)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (resp: PreviewResponse) => {
          this.preview = resp; // muestra el bloque de previsualización
          this.showToast('Previsualización OK', 'info');
        },
        error: (err: HttpErrorResponse) => {
          this.preview = null;
          this.setHttpError(err, 'Error al previsualizar');
          this.showToast(this.error || 'Error al previsualizar', 'error', 4000);
        },
      });
  }

  /**
   * Confirmación directa (fuera del preview). Mantengo por compatibilidad.
   * Flujo recomendado: confirmar desde el bloque de preview.
   */
  doConferma(): void {
    this.error = undefined;
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
          // 🔄 refrescos inmediatos de la UI
          this.refreshSaldosUnifiedOnce();
          this.startUnifiedPolling();
          this.verAgentesActivos();
          this.listCmp?.load(); // compras registradas
        },
        error: (err) => {
          this.setHttpError(err, 'Error al confirmar compra');
          this.showToast(this.error || 'Error al confirmar compra', 'error', 4000);
        },
      });
  }

  /**
   * Alias usado por el template (click)="onSuggerisciData()".
   */
  onSuggerisciData(): void {
    this.sugerirFecha();
  }

  /**
   * Sugerir fecha:
   * 1) Verifica título
   * 2) Obtiene #agentes activos para la fecha actual del form (o “hoy”)
   * 3) Llama a suggestData con n >= 1
   * 4) Parchea la fecha del form y refresca agentes activos
   */
  sugerirFecha(): void {
    this.error = undefined;

    const titolo = (this.form.get('titoloCodice')?.value as string | undefined)?.trim();
    if (!titolo) {
      this.error = 'Debe seleccionar un título';
      return;
    }

    const data =
      (this.form.get('dataCompra')?.value as string | undefined)?.trim() || this.todayStr();

    this.loading = true;
    this.api
      .getAgentiAttiviAlla(data)
      .pipe(
        take(1),
        switchMap((res) => {
          this.agentiInfo = res;
          const n = res?.numAgenti ?? res?.agenti?.length ?? 0;
          this.numAgentiAttivi = n;
          if (n <= 0) throw new Error('No hay agentes activos para sugerir una fecha.');
          return this.api.suggestData(titolo!, n);
        }),
        finalize(() => (this.loading = false))
      )
      .subscribe({
        next: (sug: SuggestimentoData) => {
          this.form.patchValue({ dataCompra: sug.dataSuggerita }); // ISO yyyy-MM-dd
          this.verAgentesActivos(); // refresca tabla de agentes con la nueva fecha
          this.showToast('Fecha sugerida aplicada', 'info');
        },
        error: (err: HttpErrorResponse | Error) => {
          if (err instanceof HttpErrorResponse) {
            this.setHttpError(err, 'Error al sugerir fecha');
            this.showToast(this.error || 'Error al sugerir fecha', 'error', 4000);
          } else {
            this.error = err.message || 'Error al sugerir fecha';
            this.showToast(this.error, 'error', 4000);
          }
        },
      });
  }

  /**
   * Carga agentes activos en la fecha del form (si la hay).
   */
  verAgentesActivos(): void {
    this.error = undefined;
    const data = (this.form.get('dataCompra')?.value as string | undefined)?.trim();
    if (!data) return;

    this.api.getAgentiAttiviAlla(data).subscribe({
      next: (res) => {
        this.agentiInfo = res;
        this.numAgentiAttivi = res?.numAgenti ?? res?.agenti?.length ?? 0;
      },
      error: (err: HttpErrorResponse) => {
        this.setHttpError(err, 'No se pudo obtener agentes activos');
      },
    });
  }

  /**
   * Carga única de saldos “en vivo”.
   */
  verSaldosLiveOnce(): void {
    this.api.getSaldiAgenti().subscribe({
      next: (res: AgenteSaldo[]) => {
        this.saldiLive = res;
      },
      error: (err: HttpErrorResponse) => {
        this.setHttpError(err, 'No se pudieron obtener saldos');
      },
    });
  }

  /**
   * Botón de testing: resetea saldos y refresca paneles.
   */
  resetSaldos(): void {
    this.error = undefined;
    this.api.resetSaldos().subscribe({
      next: () => {
        this.showToast('Saldos reiniciados', 'success');
        this.preview = null;
        // 🔄 refrescos
        this.refreshSaldosUnifiedOnce();
        this.startUnifiedPolling();
        this.verAgentesActivos();
        this.listCmp?.load(); // ← limpia/recarga lista
      },
      error: (err) => {
        this.setHttpError(err, 'Error al reiniciar saldos');
        this.showToast(this.error || 'Error al reiniciar saldos', 'error', 4000);
      },
    });
  }

  /**
   * Confirmación desde el bloque de previsualización.
   */
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
          // 🔄 refrescos
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

  /**
   * Cierra el bloque de previsualización sin confirmar.
   */
  cancelarPreview(): void {
    this.preview = null;
  }

  // ================= Helpers =================
  private refreshSaldosUnifiedOnce(): void {
    const dateIso = (this.form.get('dataCompra')?.value || '').trim();

    // si no hay fecha, no hacemos nada
    if (!dateIso) {
      this.rows = [];
      return;
    }

    if (this.isTodaySelected()) {
      // Modo EN VIVO
      this.api.getSaldiAgenti().subscribe({
        next: (res) => (this.rows = res),
        error: (err) => this.setHttpError(err, 'No se pudieron obtener saldos en vivo'),
      });
    } else {
      // Modo A LA FECHA
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

  /**
   * Construye el payload para preview/conferma:
   * - Toma fecha en ISO (yyyy-MM-dd) del form y la convierte a yyyyMMdd (requisito backend).
   * - Valida numéricos.
   */
  private buildRequest(): PreviewRequest | null {
    const v = this.form.getRawValue();

    const titolo = String(v.titoloCodice ?? '').trim();
    const dataIso = String(v.dataCompra ?? '').trim(); // yyyy-MM-dd
    const imp = Number(v.importoTotale);
    const qta = Number(v.quantitaTotale);

    if (!titolo || !dataIso || !isFinite(imp) || !isFinite(qta)) {
      this.error = 'Formulario inválido';
      return null;
    }

    const dataCompact = this.isoToCompact(dataIso); // yyyyMMdd

    const req: PreviewRequest = {
      titoloCodice: titolo,
      dataCompra: dataCompact,
      importoTotale: imp,
      quantitaTotale: qta,
    };
    return req;
  }

  /**
   * Inicia/renueva el polling para el panel de saldos.
   */
  private startUnifiedPolling(): void {
    this.polling?.unsubscribe();

    if (!this.isTodaySelected()) return; // solo hay polling si es HOY

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

  /**
   * Carga inicial única de saldos.
   */
  private refreshSaldiLiveOnce(): void {
    this.api.getSaldiAgenti().subscribe({
      next: (res: AgenteSaldo[]) => (this.saldiLive = res),
      error: (err: HttpErrorResponse) => {
        this.setHttpError(err, 'No se pudieron obtener saldos');
      },
    });
  }

  /**
   * Normaliza el error HTTP en un mensaje amigable.
   */
  private setHttpError(err: HttpErrorResponse, fallback: string): void {
    // Si el backend devolvió texto plano (Blob), léelo:
    const blob = err?.error;
    if (blob instanceof Blob) {
      blob.text().then((t) => {
        this.error = (t && t.trim()) || fallback;
        this.showToast(this.error, 'error', 4000);
      });
      return;
    }

    // Si devolvió JSON con message / code
    if (err?.error) {
      const e = err.error;
      const msg =
        (typeof e === 'string' && e.trim()) || e.message || e.code || e.detail || e.error || '';
      if (msg) {
        this.error = msg;
        return;
      }
    }

    // Fallbacks
    this.error = err.statusText || err.message || fallback;
  }

  /**
   * Devuelve “hoy” en ISO para inputs y endpoints analíticos (yyyy-MM-dd).
   */
  private todayStr(): string {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  /**
   * Convierte 'yyyy-MM-dd' → 'yyyyMMdd' (backend preview/conferma).
   */
  private isoToCompact(iso: string): string {
    return iso.replace(/-/g, '');
  }

  // ===== Toast helpers =====
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

  // Suma de saldos de la tabla unificada
  get saldoTotaleDisponibile(): number {
    return (this.rows || []).reduce((acc, a) => acc + (a?.saldoDisponibile ?? 0), 0);
  }

  // Para colorear el badge según el estado
  get badgeType(): 'ok' | 'warn' | 'neg' {
    const tot = this.saldoTotaleDisponibile;
    if (tot < 0) return 'neg';
    const imp = Number(this.form.get('importoTotale')?.value) || 0;
    return imp > tot ? 'warn' : 'ok';
  }
}
