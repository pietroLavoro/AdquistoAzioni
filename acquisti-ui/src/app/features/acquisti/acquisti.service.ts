import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** --- DTOs compartidos --- */
export interface AgenteSaldo {
  id: number;
  codiceFiscale: string;
  saldoDisponibile: number;
}

export interface SuggestimentoData {
  dataSuggerita: string; // formato 'yyyy-MM-dd'
}

export interface PreviewRequest {
  titoloCodice: string;
  dataCompra: string;      // 'yyyy-MM-dd'
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
  providedIn: 'root'
})
export class AcquistiService {
  private readonly baseUrl = '/api'; // <-- adapta si usas otro prefijo

  constructor(private http: HttpClient) {}

  /** 🟢 Obtiene saldos actuales de todos los agentes */
  getSaldiAgenti(): Observable<AgenteSaldo[]> {
    return this.http.get<AgenteSaldo[]>(`${this.baseUrl}/analisi/saldi`);
  }

  /** 🟢 Obtiene agentes activos a una fecha */
  getAgentiAttiviAlla(data: string): Observable<{ data: string; numAgenti: number; agenti: AgenteSaldo[] }> {
    return this.http.get<{ data: string; numAgenti: number; agenti: AgenteSaldo[] }>(
      `${this.baseUrl}/analisi/agenti-attivi?data=${encodeURIComponent(data)}`
    );
  }

  /** 🟢 Sugiere una fecha de compra dada la cantidad de agentes */
  suggestData(codiceTitolo: string, numAgenti: number): Observable<SuggestimentoData> {
    return this.http.get<SuggestimentoData>(
      `${this.baseUrl}/analisi/suggerimento-data?codiceTitolo=${encodeURIComponent(codiceTitolo)}&numAgenti=${numAgenti}`
    );
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
  resetSaldi(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/analisi/reset-saldi`, {});
  }
}
