import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// ====== Tipos compartidos con el componente ======
export interface AgenteSaldo {
  agenteId: number;
  codiceFiscale: string;
  saldoDisponibile: number;
}

export interface PreviewRequest {
  titoloCodice: string;
  dataCompra: string;       // ISO yyyy-MM-dd
  importoTotale: number;
  quantitaTotale: number;
}

export interface PreviewResponse {
  titoloCodice: string;
  dataCompra: string;
  importoTotale: number;
  quantitaTotale: number;
  riparto: RigaDTO[];
}

export interface RigaDTO {
  agenteId: number;
  codiceFiscale: string;
  importoAgente: number;
  quantitaAgente: number;
}

export interface SuggestimentoData {
  dataSuggerita: string;  // ISO yyyy-MM-dd
  numAgenti: number;
}

// Respuesta “agentes activos a la fecha”
export interface AgentiAttiviAllaResponse {
  data: string;           // ISO de la fecha consultada
  numAgenti: number;
  agenti: AgenteSaldo[];
}

@Injectable({ providedIn: 'root' })
export class AcquistiService {

  // Si en tu proxy usas otro prefijo, cámbialo aquí
  private readonly base = '/api';

  constructor(private http: HttpClient) {}

  // ---------- PREVIEW / CONFERMA ----------
  preview(req: PreviewRequest): Observable<PreviewResponse> {
    // POST /api/acquisto/preview
    return this.http.post<PreviewResponse>(`${this.base}/acquisto/preview`, req);
  }

  conferma(req: PreviewRequest): Observable<void> {
    // POST /api/acquisto/conferma
    return this.http.post<void>(`${this.base}/acquisto/conferma`, req);
  }

  // ---------- PANEL DERECHO: SALDOS EN VIVO ----------
  getSaldiAgenti(): Observable<AgenteSaldo[]> {
    // GET /api/analisi/saldi-agenti
    return this.http.get<AgenteSaldo[]>(`${this.base}/analisi/saldi-agenti`);
  }

  // ---------- TABLA: AGENTES ACTIVOS A LA FECHA ----------
  getAgentiAttiviAlla(allaData: string): Observable<AgentiAttiviAllaResponse> {
    // GET /api/analisi/agenti-attivi?allaData=YYYY-MM-DD
    return this.http.get<AgentiAttiviAllaResponse>(
      `${this.base}/analisi/agenti-attivi`,
      { params: { allaData } }
    );
  }

  // Si en tu backend el nombre era distinto (por ejemplo /analisi/agentiAttiviAllaData),
  // puedes dejar este wrapper con el nombre que espera el componente:
  // getAgentiAttiviAlla(allaData: string): Observable<AgentiAttiviAllaResponse> {
  //   return this.http.get<AgentiAttiviAllaResponse>(
  //     `${this.base}/analisi/agentiAttiviAllaData`,
  //     { params: { allaData } }
  //   );
  // }

  // ---------- SUGERIR FECHA VÁLIDA ----------
  suggestData(codiceTitolo: string, numAgenti: number): Observable<SuggestimentoData> {
    // GET /api/analisi/suggest-data?codiceTitolo=...&numAgenti=1
    return this.http.get<SuggestimentoData>(
      `${this.base}/analisi/suggest-data`,
      { params: { codiceTitolo, numAgenti } }
    );
  }

  // ---------- RESET SALDOS (para testing) ----------
  resetSaldi(): Observable<void> {
    // POST /api/analisi/reset-saldi
    return this.http.post<void>(`${this.base}/analisi/reset-saldi`, {});
  }
}
