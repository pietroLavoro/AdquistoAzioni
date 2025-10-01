import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

// ---- API base ----
const API_BASE = '/api'; // use Angular proxy to route to http://localhost:8080

/* ================== DTOs del backend ================== */
export interface Titolo {
  id: number;
  codice: string;
  descrizione: string;
  dataEmissione: string; // ISO yyyy-MM-dd
}

export interface PreviewRequest {
  dataAcquisto: string;     // ISO yyyy-MM-dd
  quantitaTotale: number;
  importoTotale: number;
  titoloId: number;
}

export interface RipartoItem {
  agenteId: number;
  quantita: number;
  importo: number;
  movimentoId?: number | null;
}

export interface BackendPreviewResponse {
  movimentoTitoloId?: number | null;
  titoloId: number;
  dataAcquisto: string; // ISO
  quantitaTotale: number;
  importoTotale: number;
  riparti: RipartoItem[];
}

export interface BackendAgenteSaldo {
  id: number;
  codiceFiscale: string;
  saldoDisponibile: number;
  quantitaTitoli?: number;
}

/* ================== Tipos esperados por tus componentes ================== */
// Visto en errores: Summary, SuggestionData y propiedades como titoloCodice, dataCompra, disponibile, list(), suggestData(), resetSaldos()
export type Summary = Titolo[];

export interface SuggestionData {
  data: string;         // ISO yyyy-MM-dd sugerida
  titoloCodice?: string;
}

// Respuesta que usan los componentes (extiende y agrega alias legibles)
export interface PreviewResponse extends BackendPreviewResponse {
  titoloCodice?: string | null;  // alias para UI
  dataCompra?: string | null;    // alias para UI (igual a dataAcquisto)
}

export interface AgenteSaldo extends BackendAgenteSaldo {
  disponibile: number; // alias de saldoDisponibile para la UI
}

@Injectable({ providedIn: 'root' })
export class AcquistiService {
  constructor(private http: HttpClient) {}

  /* ================== Titoli ================== */
  listTitoli(): Observable<Titolo[]> {
    return this.http.get<Titolo[]>(`${API_BASE}/titoli`).pipe(catchError(this.handle));
  }
  // Alias para componentes que llaman service.list()
  list(): Observable<Summary> { return this.listTitoli(); }

  /* ================== Preview / Conferma ================== */
  preview(req: PreviewRequest): Observable<PreviewResponse> {
    return this.http
      .post<BackendPreviewResponse>(`${API_BASE}/acquisti/preview`, req)
      .pipe(
        map((resp) => ({
          ...resp,
          dataCompra: resp.dataAcquisto,
          // titoloCodice: podría setearse en el componente cuando tenga el título seleccionado
          titoloCodice: null,
        })),
        catchError(this.handle)
      );
  }

  conferma(req: PreviewRequest): Observable<PreviewResponse> {
    return this.http
      .post<BackendPreviewResponse>(`${API_BASE}/acquisti`, req)
      .pipe(
        map((resp) => ({
          ...resp,
          dataCompra: resp.dataAcquisto,
          titoloCodice: null,
        })),
        catchError(this.handle)
      );
  }

  /* ================== Saldos ================== */
  getSaldiAgenti(dataIso?: string): Observable<AgenteSaldo[]> {
    const params = dataIso ? new HttpParams().set('data', dataIso) : undefined;
    return this.http
      .get<BackendAgenteSaldo[]>(`${API_BASE}/agenti/saldi`, { params })
      .pipe(
        map(rows => rows.map(r => ({ ...r, disponibile: r.saldoDisponibile }))),
        catchError(this.handle)
      );
  }
  // Helpers que tus componentes podrían estar invocando
  getSaldiTotaleDisponibile(dataIso?: string): Observable<number> {
    return this.getSaldiAgenti(dataIso).pipe(
      map(rows => rows.reduce((acc, r) => acc + (r.disponibile || 0), 0))
    );
  }
  resetSaldos(): void { /* no-op para compatibilidad */ }

  /* ================== Sugerencias ================== */
  suggestData(titolo?: Titolo): Observable<SuggestionData> {
    if (!titolo) return of({ data: this.todayIso(), titoloCodice: undefined });
    // Sugerimos max(hoy, dataEmissione del titolo)
    const d = new Date(titolo.dataEmissione);
    const t = new Date();
    const sug = (t > d ? t : d);
    return of({ data: this.toIsoDate(sug), titoloCodice: titolo.codice });
  }

  /* ================== util ================== */
  private handle = (err: HttpErrorResponse) => {
    const msg =
      (typeof err.error === 'string' && err.error.trim()) ||
      (err.error && (err.error.message || err.error.detail || err.error.error)) ||
      err.statusText ||
      err.message ||
      'Errore';
    return throwError(() => new Error(msg));
  };

  private pad(n: number): string { return n < 10 ? '0' + n : '' + n; }
  private todayIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${this.pad(d.getMonth()+1)}-${this.pad(d.getDate())}`;
  }
  private toIsoDate(d: Date): string {
    return `${d.getFullYear()}-${this.pad(d.getMonth()+1)}-${this.pad(d.getDate())}`;
  }
}
