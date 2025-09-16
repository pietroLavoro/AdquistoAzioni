import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { interval, Subscription } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
import { inject } from '@angular/core';

// 👇 Importa el servicio y los DTOs desde el archivo del servicio (ruta relativa)
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
  imports: [CommonModule, ReactiveFormsModule, DecimalPipe],
  templateUrl: './acquisto-form.component.html',
  styleUrls: ['./acquisto-form.component.css'],
})
export class AcquistoFormComponent implements OnInit, OnDestroy {
  // --- estado general ---
  private fb = inject(FormBuilder);
  loading = false;
  error?: string;

  // --- panel derecho: saldos “tiempo real” ---
  saldiLive: AgenteSaldo[] = [];
  polling?: Subscription;
  pollingMs = 5000;

  // --- tabla agentes activos a la fecha (referencia) ---
  agentiInfo?: { data: string; numAgenti: number; agenti: AgenteSaldo[] };

  // --- formulario fuertemente tipado y non-nullable ---
  form = this.fb.nonNullable.group({
    titoloCodice: ['', Validators.required],
    dataCompra:   ['', [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
    importoTotale:[10000, [Validators.required, Validators.min(0.01)]],
    quantitaTotale:[1, [Validators.required, Validators.min(1)]],
  });

  constructor(private api: AcquistiService) {}

  // ------------------------------
  // Ciclo de vida
  // ------------------------------
  ngOnInit(): void {
    // 1) Carga saldos “ahora” y arranca el polling
    this.refreshSaldiLiveOnce();
    this.startPollingLive();

    // 2) Carga agentes activos si ya hay fecha
    this.verAgentesActivos();
  }

  ngOnDestroy(): void {
    this.polling?.unsubscribe();
  }

  // ------------------------------
  // Acciones de UI
  // ------------------------------

  doPreview(): void {
    this.error = undefined;
    const req = this.buildRequest();
    if (!req) return;

    this.loading = true;
    this.api.preview(req).subscribe({
      next: (_resp: PreviewResponse) => {
        this.loading = false;
        alert('Previsualización OK');
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        this.error = err.error?.code ?? 'ERROR';
      },
    });
  }

  doConferma(): void {
    this.error = undefined;
    const req = this.buildRequest();
    if (!req) return;

    this.loading = true;
    this.api.conferma(req).subscribe({
      next: () => {
        this.loading = false;
        alert('Compra confirmada');
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        this.error = err.error?.code ?? 'ERROR';
      },
    });
  }

  // Sugerir fecha en base al título elegido y la cantidad de agentes activos mostrada
  sugerirFecha(): void {
    this.error = undefined;

    const titolo = this.form.get('titoloCodice')?.value as string | undefined;
    if (!titolo) {
      this.error = 'Debe seleccionar un título';
      return;
    }

    const numAgenti = this.agentiInfo?.numAgenti ?? 0;

    this.api.suggestData(titolo, numAgenti).subscribe({
      next: (sug: SuggestimentoData) => {
        this.form.patchValue({ dataCompra: sug.dataSuggerita });
        this.verAgentesActivos(); // refresca la tabla con la nueva fecha sugerida
      },
      error: (err: HttpErrorResponse) => {
        this.error = err.error?.code ?? 'ERROR';
      },
    });
  }

  // Pide al backend los agentes activos a la fecha del formulario
  verAgentesActivos(): void {
    this.error = undefined;

    const data = this.form.get('dataCompra')?.value as string | undefined;
    if (!data) return;

    this.api.getAgentiAttiviAlla(data).subscribe({
      next: (res: { data: string; numAgenti: number; agenti: AgenteSaldo[] }) => {
        this.agentiInfo = res;
      },
      error: (err: HttpErrorResponse) => {
        this.error = err.error?.code ?? 'ERROR';
      },
    });
  }

  // Botón para testing: reinicia saldos y refresca
  doResetSaldi(): void {
    this.error = undefined;
    this.api.resetSaldi().subscribe({
      next: () => this.refreshSaldiLiveOnce(),
      error: (err: HttpErrorResponse) => {
        this.error = err.error?.code ?? 'ERROR';
      },
    });
  }

  // ------------------------------
  // Helpers
  // ------------------------------

  private buildRequest(): PreviewRequest | null {
    const v = this.form.getRawValue();

    const titolo = String(v.titoloCodice ?? '').trim();
    const data = String(v.dataCompra ?? '').trim();
    const imp = Number(v.importoTotale);
    const qta = Number(v.quantitaTotale);

    if (!titolo || !data || !isFinite(imp) || !isFinite(qta)) {
      this.error = 'Formulario inválido';
      return null;
    }

    const req: PreviewRequest = {
      titoloCodice: titolo,
      dataCompra: data,
      importoTotale: imp,
      quantitaTotale: qta,
    };
    return req;
    }

  private startPollingLive(): void {
    this.polling?.unsubscribe();
    this.polling = interval(this.pollingMs)
      .pipe(startWith(0), switchMap(() => this.api.getSaldiAgenti()))
      .subscribe({
        next: (res: AgenteSaldo[]) => (this.saldiLive = res),
        error: (err: HttpErrorResponse) => {
          this.error = err.error?.code ?? 'ERROR';
        },
      });
  }

  private refreshSaldiLiveOnce(): void {
    this.api.getSaldiAgenti().subscribe({
      next: (res: AgenteSaldo[]) => (this.saldiLive = res),
      error: (err: HttpErrorResponse) => {
        this.error = err.error?.code ?? 'ERROR';
      },
    });
  }
}
