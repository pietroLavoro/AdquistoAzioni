import { Component, Input, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { AcquistiService, Summary } from '../acquisti.service';

/* Si en el HTML usas <p-table>, deja esta importación.
   Si NO usas PrimeNG Table, puedes eliminarla. */
import { TableModule } from 'primeng/table';

@Component({
  selector: 'app-acquisti-list',
  standalone: true,
  imports: [
    CommonModule,
    DecimalPipe,
    TableModule // ← quítalo si no usas <p-table>
  ],
  templateUrl: './acquisti-list.component.html',
  styleUrls: ['./acquisti-list.css'] // ← ruta corregida
})
export class AcquistiListComponent implements OnInit {
  @Input() embedded = false;

  items: Summary[] = [];
  loading = false;
  error?: string;

  constructor(private api: AcquistiService, private router: Router) {}

  ngOnInit(): void {
    this.load();
  }

  // público para que el padre pueda refrescar
  load(): void {
    this.loading = true;
    this.error = undefined;

    this.api.list().subscribe({
      next: (res) => {
        this.items = res ?? [];
        this.loading = false;
      },
      error: () => {
        this.error = 'ERROR';
        this.loading = false;
      }
    });
  }

  nuovo(): void {
    if (this.embedded) return; // en modo incrustado no navegamos
    this.router.navigateByUrl('/acquisti/nuovo');
  }
}
