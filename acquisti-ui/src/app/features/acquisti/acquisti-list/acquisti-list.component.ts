import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AcquistiService, Summary } from '../acquisti.service';

@Component({
  selector: 'app-acquisti-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './acquisti-list.component.html',
  styleUrls: ['./acquisti-list.css'],
})
export class AcquistiListComponent implements OnInit {
  @Input() embedded = false; // ← modo incrustado

  items: Summary[] = [];
  loading = false;
  error?: string;

  constructor(private api: AcquistiService, private router: Router) {}

  ngOnInit(): void {
    this.load();
  }

  // ← público para que el padre pueda refrescar
  load(): void {
    this.loading = true;
    this.error = undefined;
    this.api.list().subscribe({
      next: (res) => {
        this.items = res;
        this.loading = false;
      },
      error: () => {
        this.error = 'ERROR';
        this.loading = false;
      },
    });
  }

  nuovo(): void {
    if (this.embedded) return; // en modo incrustado no navegamos
    this.router.navigateByUrl('/acquisti/nuovo');
  }
}
