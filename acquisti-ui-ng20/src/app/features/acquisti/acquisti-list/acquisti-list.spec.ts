import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AcquistiList } from './acquisti-list';

describe('AcquistiList', () => {
  let component: AcquistiList;
  let fixture: ComponentFixture<AcquistiList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AcquistiList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AcquistiList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
