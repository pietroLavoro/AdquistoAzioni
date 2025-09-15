import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AcquistiService, Summary } from '../acquisti.service';

@Component({
  selector: 'app-acquisti-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './acquisti-list.component.html',
  styleUrls: ['./acquisti-list.css']
})
export class AcquistiListComponent implements OnInit {
  items: Summary[] = [];
  loading = false;
  error?: string;

  constructor(private api: AcquistiService, private router: Router) {}

  ngOnInit(): void {
    this.loading = true;
    this.api.list().subscribe({
      next: (res: Summary[]): void => {
        this.items = res;
        this.loading = false;
      },
      error: (err: HttpErrorResponse): void => {
        this.error = (err.error as any)?.code ?? 'ERROR';
        this.loading = false;
      }
    });
  }

  nuovo(): void {
    this.router.navigate(['/acquisti/nuovo']);
  }
}
