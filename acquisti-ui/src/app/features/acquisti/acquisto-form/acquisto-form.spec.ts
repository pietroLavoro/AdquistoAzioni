import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AcquistoForm } from './acquisto-form';

describe('AcquistoForm', () => {
  let component: AcquistoForm;
  let fixture: ComponentFixture<AcquistoForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AcquistoForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AcquistoForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
