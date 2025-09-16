import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AcquistiService, Summary } from '../../acquisti/acquisti.service'; // <-- usa Summary (no AgenteSaldo)

@Component({
  selector: 'app-acquisti-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './acquisti-list.component.html',
  styleUrls: ['./acquisti-list.css']
})
export class AcquistiListComponent implements OnInit {
  items: Summary[] = [];      // <-- OJO: Summary, no AgenteSaldo
  loading = false;
  error?: string;

  constructor(private api: AcquistiService, private router: Router) {}

  ngOnInit(): void {
    this.api.list().subscribe({
  next: (res: Summary[]) => { this.items = res; this.loading = false; },
  error: () => { this.error = 'ERROR'; this.loading = false; }
});

  }

  // <-- método que pide el template
  nuovo(): void {
    this.router.navigateByUrl('/acquisti/nuovo');
  }
}
