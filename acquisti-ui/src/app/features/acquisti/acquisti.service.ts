import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API = '/api/acquisto'; // gracias al proxy.conf.json

export interface PreviewRequest {
  titoloCodice: string;
  dataCompra: string;       // formato yyyyMMdd
  importoTotale: number;
  quantitaTotale: number;
}

export interface RigaPreview {
  agenteId: number;
  codiceFiscale: string;
  importoAgente: number;
  quantitaAgente: number;
}

export interface PreviewResponse {
  titoloCodice: string;
  dataCompra: string;
  importoTotale: number;
  quantitaTotale: number;
  riparto: RigaPreview[];
  importoSommato: number;
  quantitaSommata: number;
}

export interface Summary {
  id: number;
  titoloCodice: string;
  titoloDescrizione: string;
  dataCompra: string;
  quantitaTotale: number;
  importoTotale: number;
}

export interface Dettaglio extends Summary {
  riparto: {
    agenteId: number;
    codiceFiscale: string;
    quantitaAgente: number;
    importoAgente: number;
  }[];
}

@Injectable({ providedIn: 'root' })
export class AcquistiService {
  constructor(private http: HttpClient) {}

  preview(req: PreviewRequest): Observable<PreviewResponse> {
    return this.http.post<PreviewResponse>(`${API}/preview`, req);
  }

  conferma(req: PreviewRequest): Observable<any> {
    return this.http.post(`${API}/conferma`, req);
  }

  list(): Observable<Summary[]> {
    return this.http.get<Summary[]>(API);
  }

  dettaglio(id: number): Observable<Dettaglio> {
    return this.http.get<Dettaglio>(`${API}/${id}`);
  }
}
