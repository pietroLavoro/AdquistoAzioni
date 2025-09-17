import { Component, OnInit } from '@angular/core';
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
  items: Summary[] = [];
  loading = false;
  error?: string;

  constructor(private api: AcquistiService, private router: Router) {}

  ngOnInit(): void {
    this.loading = true;
    this.api.list().subscribe({
      next: (res: Summary[]) => {
        this.items = res;
        this.loading = false;
      },
      error: (e: Error) => {
        this.error = e.message || 'Error desconocido';
        this.loading = false;
      },
    });
  }

  nuovo(): void {
    this.router.navigateByUrl('/acquisti/nuovo');
  }
}
