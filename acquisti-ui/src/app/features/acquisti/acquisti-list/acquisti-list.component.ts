import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';

import {
  AcquistiService,
  AgenteSaldo,
  // SuggestimentoData, // Solo importa si los usas
  // PreviewRequest,   // Solo importa si los usas
  // PreviewResponse   // Solo importa si los usas
} from '../../acquisti/acquisti.service'; // RUTA FINAL Y CORRECTA PARA ESTE COMPONENTE

@Component({
  selector: 'app-acquisti-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './acquisti-list.component.html',
  styleUrls: ['./acquisti-list.css']
})
export class AcquistiListComponent implements OnInit {
  items: AgenteSaldo[] = []; // Mejor tipado
  loading = false;
  error?: string;

  constructor(private api: AcquistiService, private router: Router) {}

  ngOnInit(): void {
    this.loading = true;
    this.api.getSaldiAgenti().subscribe({
      next: (res: AgenteSaldo[]) => {
        this.items = res;
        this.loading = false;
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error al obtener saldos:', err);
        this.error = `Error: ${err.statusText || 'Ocurrió un error desconocido'}`;
        this.loading = false;
      }
    });
  }
}