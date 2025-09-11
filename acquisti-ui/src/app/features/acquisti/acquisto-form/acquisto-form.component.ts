import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AcquistiService, PreviewRequest, PreviewResponse } from '../acquisti.service';


@Component({
  selector: 'app-acquisto-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './acquisto-form.component.html',
  styleUrls: ['./acquisto-form.component.css']
})
export class AcquistoFormComponent {
  loading = false;
  previewData?: PreviewResponse;
  error?: string;

  form = this.fb.group({
    titoloCodice: ['ENEL2025', [Validators.required]],
    dataCompra: ['20250201', [Validators.required, Validators.pattern(/^\d{8}$/)]],
    importoTotale: [10000, [Validators.required, Validators.min(0.01)]],
    quantitaTotale: [237, [Validators.required, Validators.min(1)]],
  });

  constructor(private fb: FormBuilder, private api: AcquistiService) {}

  doPreview(): void {
    this.error = undefined;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading = true;
    const req = this.form.value as unknown as PreviewRequest;

    this.api.preview(req).subscribe({
      next: (res: PreviewResponse) => {
        this.previewData = res;
        this.loading = false;
      },
      error: (err: HttpErrorResponse) => {
        this.error = (err.error as any)?.code ?? 'ERROR';
        this.loading = false;
      },
    });
  }

  doConferma(): void {
    if (!this.previewData) return;
    const req = this.form.value as unknown as PreviewRequest;

    this.api.conferma(req).subscribe({
      next: (): void => alert('Compra confirmada'),
      error: (err: HttpErrorResponse): void =>
        alert('Error: ' + ((err.error as any)?.code ?? 'ERROR')),
    });
  }
}
