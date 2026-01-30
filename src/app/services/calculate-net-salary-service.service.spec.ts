import { TestBed } from '@angular/core/testing';

import { CalculateNetSalaryServiceService } from './calculate-net-salary-service.service';

describe('CalculateNetSalaryServiceService', () => {
  let service: CalculateNetSalaryServiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CalculateNetSalaryServiceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
