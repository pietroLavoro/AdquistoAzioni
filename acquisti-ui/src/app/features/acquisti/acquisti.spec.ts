import { TestBed } from '@angular/core/testing';

import { Acquisti } from './acquisti';

describe('Acquisti', () => {
  let service: Acquisti;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Acquisti);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
