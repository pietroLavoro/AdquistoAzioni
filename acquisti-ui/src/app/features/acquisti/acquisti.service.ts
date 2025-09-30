import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

/* ===================== DTOs ===================== */
export interface Summary {
  id: number;
  titoloCodice: string;
  titoloDescrizione: string;
  dataCompra: string;         // yyyy-MM-dd
  quantitaTotale: number;
  importoTotale: number;
}

export interface Titolo {
  codice: string;
  descrizione: string;
}

export interface AgenteSaldo {
  id: number;
  cf: string;                 // codice fiscale
  disponibile: number;        // saldo disponible
}

export interface SuggestimentoData {
  date: string;               // yyyy-MM-dd
}

/** Forma “canónica” que usa el front nuevo */
export interface PreviewRequest {
  titoloCodice: string;
  data: string;               // yyyy-MM-dd
  importo: number;
  quantita: number;
}

/** Respuesta con aliases para que el template no falle si el back usa nombres viejos */
export interface PreviewResponse {
  // canónicos
  titoloCodice: string;
  data?: string;
  importo?: number;
  quantita?: number;

  // aliases (legacy / usados por el HTML)
  dataCompra?: string;
  importoTotale?: number;
  quantitaTotale?: number;

  riparto: Array<{
    agenteId: number;
    codiceFiscale: string;
    importoAgente: number;
    quantitaAgente: number;
  }>;
}

export interface Attivita15g {
  labels: string[];
  compras: number[];
  saldo: number[];
}

/* ===================== Service ===================== */
@Injectable({ providedIn: 'root' })
export class AcquistiService {
  private base = '/api';

  constructor(private http: HttpClient) {}

  /* -------- util error handler -------- */
  private handle = (err: HttpErrorResponse) => {
    const msg =
      (err?.error && (err.error.message || err.error.detail || err.error)) ||
      err.statusText ||
      err.message;
    return throwError(() => new Error((msg || 'Error de red').toString()));
  };

  /* -------- util normalizadores -------- */

  /** Adapta el body a lo que podría esperar un backend legacy */
  private toLegacyPayload(req: PreviewRequest) {
    return {
      // siempre enviamos los 4 nombres legacy
      titoloCodice: req.titoloCodice,
      dataCompra: (req as any).dataCompra ?? req.data,
      importoTotale: (req as any).importoTotale ?? req.importo,
      quantitaTotale: (req as any).quantitaTotale ?? req.quantita,
      // y, por compatibilidad, incluimos los nuevos también:
      data: req.data,
      importo: req.importo,
      quantita: req.quantita,
    };
  }

  /** Garantiza que la respuesta tenga también los alias usados por el HTML */
  private withResponseAliases = (resp: PreviewResponse): PreviewResponse => {
    const dataCompra = resp.dataCompra ?? resp.data;
    const importoTotale = resp.importoTotale ?? resp.importo;
    const quantitaTotale = resp.quantitaTotale ?? resp.quantita;
    return { ...resp, dataCompra, importoTotale, quantitaTotale };
  };

  /* ----------------- API ----------------- */

  list(): Observable<Summary[]> {
    return this.http.get<Summary[]>(`${this.base}/acquisto`).pipe(catchError(this.handle));
  }

  getTitoli(): Observable<Titolo[]> {
    return this.http.get<Titolo[]>(`${this.base}/titolo`).pipe(catchError(this.handle));
  }

  getSaldiAgenti(): Observable<AgenteSaldo[]> {
    return this.http.get<AgenteSaldo[]>(`${this.base}/analisi/saldi`).pipe(catchError(this.handle));
  }

  /** Detalle de agentes activos en una fecha */
  getAgentiAttiviAlla(dataIso: string) {
    const params = new HttpParams().set('data', dataIso);
    return this.http
      .get<{ data: string; numAgenti: number; agenti: AgenteSaldo[] }>(
        `${this.base}/analisi/agenti-attivi`,
        { params }
      )
      .pipe(catchError(this.handle));
  }

  /** Solo el número de agentes activos (alias para el componente) */
  getAgentiAttivi(dataIso: string): Observable<number> {
    return this.getAgentiAttiviAlla(dataIso).pipe(
      map(r => r?.numAgenti ?? 0),
      catchError(() => of(0))
    );
  }

  /** Sugerir fecha */
  suggestData(codiceTitolo: string, numAgenti: number): Observable<SuggestimentoData> {
    const params = new HttpParams()
      .set('codiceTitolo', codiceTitolo)
      .set('numAgenti', String(numAgenti));
    return this.http
      .get<SuggestimentoData>(`${this.base}/analisi/suggerisci-data`, { params })
      .pipe(catchError(this.handle));
  }

  /** Previsualizar compra */
  preview(req: PreviewRequest): Observable<PreviewResponse> {
    const payload = this.toLegacyPayload(req);
    return this.http
      .post<PreviewResponse>(`${this.base}/acquisto/preview`, payload)
      .pipe(
        map(this.withResponseAliases),
        catchError(this.handle)
      );
  }

  /** Confirmar compra */
  conferma(req: PreviewRequest): Observable<void> {
    const payload = this.toLegacyPayload(req);
    return this.http
      .post<void>(`${this.base}/acquisto/conferma`, payload)
      .pipe(catchError(this.handle));
  }

  /** Reiniciar saldos (testing) */
  resetSaldos(): Observable<void> {
    return this.http.post<void>(`${this.base}/analisi/reset`, {}).pipe(catchError(this.handle));
  }

  /** Actividad de los últimos 15 días (labels, compras, saldo) */
  getAttivita15g(dataIso?: string): Observable<Attivita15g> {
    const params = dataIso ? new HttpParams().set('data', dataIso) : undefined;
    return this.http
      .get<Attivita15g>(`${this.base}/analisi/ultimi-15-giorni`, { params })
      .pipe(catchError(this.handle));
  }
}
