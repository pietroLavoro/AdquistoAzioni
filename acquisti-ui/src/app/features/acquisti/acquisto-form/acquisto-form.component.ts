import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { interval, Subscription } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';

import {
  AcquistiService,
  AgenteSaldo,
  SuggestimentoData,
  PreviewRequest,
  PreviewResponse,
  AgentiAttiviAllaResponse,   // <-- añade este si lo tienes en el servicio
} from '@app/acquisti.service';


@Component({
  selector: 'app-acquisto-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DecimalPipe],
  templateUrl: './acquisto-form.component.html',
  styleUrls: ['./acquisto-form.component.css']
})
export class AcquistoFormComponent implements OnInit, OnDestroy {
  // --- estado general ---
  loading = false;
  error?: string;

  // --- formulario ---
  form = this.fb.group({
    titoloCodice: ['', Validators.required],
    dataCompra: ['', [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]], // yyyy-MM-dd
    importoTotale: [10000, [Validators.required, Validators.min(0.01)]],
    quantitaTotale: [237, [Validators.required, Validators.min(1)]],
  });

  // --- panel derecho: saldos en vivo ---
  saldiLive: AgenteSaldo[] = [];
  polling?: Subscription;
  pollingMs = 5000;

  // --- tabla de agentes activos a la fecha elegida ---
  agentiInfo?: { data: string; numAgenti: number; agenti: AgenteSaldo[] };

  constructor(private fb: FormBuilder, private api: AcquistiService) {}

  // ==============================
  // Ciclo de vida
  // ==============================

  ngOnInit(): void {
    this.startPollingLive();
  }

  ngOnDestroy(): void {
    this.polling?.unsubscribe();
  }

  // ==============================
  // Métodos principales
  // ==============================

  /** Polling periódico de saldos en vivo */
  private startPollingLive(): void {
    this.polling = interval(this.pollingMs)
      .pipe(
        startWith(0),
        switchMap(() => this.api.getSaldiAgenti())
      )
      .subscribe({
        next: (res) => this.saldiLive = res,
        error: (err) => console.error('Error al obtener saldos', err)
      });
  }

  /** Previsualiza la compra */
  doPreview(): void {
    if (this.form.invalid) return;

    const req: PreviewRequest = this.form.value as PreviewRequest;

    this.api.preview(req).subscribe({
      next: (res: PreviewResponse) => {
        console.log('Preview ok', res);
        alert('Preview realizada correctamente');
      },
      error: () => this.error = 'ERROR'
    });
  }

  /** Confirma la compra (opcional si ya tienes implementado en el back) */
  doConferma(): void {
    if (this.form.invalid) return;

    const req: PreviewRequest = this.form.value as PreviewRequest;

    this.api.conferma(req).subscribe({
      next: () => alert('Compra confirmada'),
      error: () => this.error = 'ERROR'
    });
  }

  /** Pide al backend los agentes activos a la fecha del formulario */
  verAgentesActivos(): void {
    this.error = undefined;
    const data = this.form.get('dataCompra')?.value as string | undefined;
    if (!data) return;

    this.api.getAgentiAttiviAlla(data).subscribe({
      next: (res) => this.agentiInfo = res,
      error: () => this.error = 'ERROR'
    });
  }

  /** Pide al backend una sugerencia de fecha de compra */
  sugerirFecha(): void {
    const titolo = this.form.get('titoloCodice')?.value as string | undefined;
    if (!titolo) return;

    const numAgenti = this.agentiInfo?.numAgenti ?? 0;

    this.api.suggestData(titolo, numAgenti).subscribe({
      next: (sug: SuggestimentoData) => {
        this.form.patchValue({ dataCompra: sug.dataSuggerita });
        this.verAgentesActivos();
      },
      error: () => this.error = 'ERROR'
    });
  }

  /** Reinicia los saldos de testing */
  doResetSaldi(): void {
    this.api.resetSaldi().subscribe({
      next: () => this.refreshSaldiLiveOnce(),
      error: () => this.error = 'ERROR'
    });
  }

  /** Refresca manualmente los saldos en vivo una vez */
  private refreshSaldiLiveOnce(): void {
    this.api.getSaldiAgenti().subscribe({
      next: (res) => this.saldiLive = res,
      error: () => this.error = 'ERROR'
    });
  }
}
