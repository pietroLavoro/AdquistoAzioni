import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, interval, startWith, switchMap } from 'rxjs';
import { AcquistiService } from '../acquisti.service';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';

// Interfaces que usa este componente
interface AgenteSaldo {
  agenteId: number;        // <- coincide con el backend
  codiceFiscale: string;
  saldoDisponibile: number;
}

interface SuggestimentoData {
  codiceTitolo: string;
  dataSuggerita: string;
  numAgenti: number;
}

@Component({
  selector: 'app-acquisto-form',
  standalone: true,
  templateUrl: './acquisto-form.component.html',
  styleUrls: ['./acquisto-form.component.css'],
  imports: [
    CommonModule,            // <= NECESARIO para el pipe "number" (y *ngIf, *ngFor, etc.)
    ReactiveFormsModule,
  ],
})
export class AcquistoFormComponent implements OnInit, OnDestroy {

  loading = false;
  error?: string;

  // --- formulario reactivo ---
  form!: FormGroup;

  // --- panel de saldos "en tiempo real" ---
  saldiLive: AgenteSaldo[] = [];
  polling?: Subscription;
  pollingMs = 5000;

  // --- tabla de agentes activos a la fecha elegida ---
  agentiInfo?: { data: string; numAgenti: number; agenti: AgenteSaldo[] };

  constructor(
    private fb: FormBuilder,
    private api: AcquistiService
  ) {
    // inicializamos el form aquí para evitar error "fb used before initialization"
    this.form = this.fb.group({
      titoloCodice: ['', Validators.required],
      dataCompra: ['', [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
      importoTotale: [10000, [Validators.required, Validators.min(0.01)]],
      quantitaTotale: [237, [Validators.required, Validators.min(1)]],
    });
  }

  // ================= Ciclo de vida =====================

  ngOnInit(): void {
    this.startPollingLive(); // arranca polling de saldos en tiempo real
  }

  ngOnDestroy(): void {
    this.polling?.unsubscribe();
  }

  // ================= Lógica =====================

  /** polling periódico para saldos */
  private startPollingLive(): void {
    this.polling = interval(this.pollingMs)
      .pipe(
        startWith(0),
        switchMap(() => this.api.getSaldiAgenti()) // <-- endpoint que debes tener en tu service
      )
      .subscribe({
        next: (res) => this.saldiLive = res,
        error: (err) => console.error('Error al obtener saldos', err)
      });
  }

  /** Previsualizar compra */
  doPreview(): void {
    this.error = undefined;
    const v = this.form.getRawValue();
    const req = {
      titoloCodice: v.titoloCodice,
      dataCompra: v.dataCompra,
      importoTotale: Number(v.importoTotale),
      quantitaTotale: Number(v.quantitaTotale),
    };
    this.api.preview(req).subscribe({
      next: () => alert('Preview ok'),
      error: () => this.error = 'ERROR'
    });
  }

  /** Pide al backend la fecha sugerida con agentes disponibles */
  sugerirFecha(): void {
  this.error = undefined;

  const titolo = this.form.get('titoloCodice')?.value as string | undefined;
  if (!titolo) { return; }

  // usa el número de agentes activos (si ya se cargó) o 0/3 como fallback
  const numAgenti = this.agentiInfo?.numAgenti ?? 0;

  this.api.suggestData(titolo, numAgenti).subscribe({
    next: (sug: SuggestimentoData) => {
      this.form.patchValue({ dataCompra: sug.dataSuggerita });
      this.verAgentesActivos();   // refresca el panel de agentes/saldos
    },
    error: (err: unknown) => { this.error = 'ERROR'; }
  });
}


  /** Pide al backend los agentes activos a la fecha del formulario */
  verAgentesActivos(): void {
    this.error = undefined;
    const data = this.form.get('dataCompra')?.value as string | undefined;
    if (!data) return;

    this.api.getAgentiAttiviAlla(data).subscribe({
      next: (res: { data: string; numAgenti: number; agenti: AgenteSaldo[] }) => {
        this.agentiInfo = res;
      },
      error: (err) => {
        console.error(err);
        this.error = 'ERROR';
      }
    });
  }

  /** Reinicia saldos de agentes (modo testing) */
  doResetSaldi(): void {
    this.api.resetSaldi().subscribe({
      next: () => this.refreshSaldiLiveOnce(),
      error: () => this.error = 'ERROR'
    });
  }

  /** Refresca tabla de saldos una vez */
  private refreshSaldiLiveOnce(): void {
    this.api.getSaldiAgenti().subscribe({
      next: (res) => this.saldiLive = res
    });
  }
}
