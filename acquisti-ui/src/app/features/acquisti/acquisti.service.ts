import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { HttpParams } from '@angular/common/http';

/** --- DTOs compartidos --- */

export interface Summary {
  id: number;
  titoloCodice: string;
  titoloDescrizione: string;
  dataCompra: string; // yyyy-MM-dd
  quantitaTotale: number;
  importoTotale: number;
}

export interface AgenteSaldo {
  id: number;
  codiceFiscale: string;
  saldoDisponibile: number;
}

export interface SuggestimentoData {
  dataSuggerita: string; // con doble “g”
}

export interface PreviewRequest {
  titoloCodice: string;
  dataCompra: string; // 'yyyy-MM-dd'
  importoTotale: number;
  quantitaTotale: number;
}

export interface PreviewResponse {
  titoloCodice: string;
  dataCompra: string;
  importoTotale: number;
  quantitaTotale: number;
  riparto: {
    agenteId: number;
    codiceFiscale: string;
    importoAgente: number;
    quantitaAgente: number;
  }[];
}

export interface ConfermaRequest extends PreviewRequest {} // misma forma por ahora

@Injectable({
  providedIn: 'root',
})
export class AcquistiService {
  private baseUrl = '/api';

  constructor(private http: HttpClient) {}

  list(): Observable<Summary[]> {
    return this.http.get<Summary[]>(`${this.baseUrl}/acquisto`).pipe(
      catchError((err: HttpErrorResponse) => {
        // Un solo mensaje claro
        const msg = err.error?.message || err.statusText || 'Fallo al cargar compras';
        return throwError(() => new Error(`${err.status || 0} ${msg}`.trim()));
      })
    );
  }

  /** 🟢 Obtiene saldos actuales de todos los agentes */
  getSaldiAgenti(): Observable<AgenteSaldo[]> {
    return this.http.get<AgenteSaldo[]>(`${this.baseUrl}/analisi/saldi`);
  }

  /** 🟢 Obtiene agentes activos a una fecha */
  getAgentiAttiviAlla(
    data: string
  ): Observable<{ data: string; numAgenti: number; agenti: AgenteSaldo[] }> {
    return this.http.get<{ data: string; numAgenti: number; agenti: AgenteSaldo[] }>(
      `${this.baseUrl}/analisi/agenti-attivi?data=${encodeURIComponent(data)}`
    );
  }

  /** 🟢 Sugiere una fecha de compra dada la cantidad de agentes */
  suggestData(codiceTitolo: string, numAgenti: number): Observable<SuggestimentoData> {
    const params = new HttpParams()
      .set('codiceTitolo', codiceTitolo)
      .set('numAgenti', String(numAgenti)); // debe ser >= 1

    return this.http.get<SuggestimentoData>(`${this.baseUrl}/analisi/suggerisci-data`, { params });
  }

  /** 🟢 Previsualiza la compra antes de confirmar */
  preview(req: PreviewRequest): Observable<PreviewResponse> {
    return this.http.post<PreviewResponse>(`${this.baseUrl}/acquisto/preview`, req);
  }

  /** 🟢 Confirma la compra */
  conferma(req: ConfermaRequest): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/acquisto/conferma`, req);
  }

  /** 🟢 Reinicia los saldos para testing */
  resetSaldos(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/analisi/reset`, {});
  }
}
