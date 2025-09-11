import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AcquistiService, Summary } from '../../acquisti.service';

@Component({
  selector: 'app-acquisti-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './acquisti-list.component.html'
})
export class AcquistiListComponent implements OnInit {
  items: Summary[] = [];
  loading = false;

  constructor(private api: AcquistiService, private router: Router) {}

  ngOnInit(): void {
    this.loading = true;
    this.api.list().subscribe({
      next: res => { this.items = res; this.loading = false; },
      error: () => this.loading = false
    });
  }

  nuovo() { this.router.navigate(['/acquisti/nuovo']); }
}
