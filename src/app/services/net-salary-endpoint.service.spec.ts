import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NetSalaryEndpointService } from './net-salary-endpoint.service';

describe('NetSalaryEndpointService', () => {
  let service: NetSalaryEndpointService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        NetSalaryEndpointService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(NetSalaryEndpointService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('posts normalized form data to the net salary endpoint', () => {
    service.calculateNetSalary({
      location: 'continente',
      marital_status: 'SOL',
      number_of_dependents: '',
      disability_above_60: false,
      spouse_has_disability: false,
      dependents_have_disability: false,
      number_of_dependents_with_disability: '2',
      base_salary: '1500',
      extraordinary_compensation: '',
      other_irs_ss_income: '',
      other_irs_income: '',
      other_exempt_income: '',
      social_security_rate: '',
      twelfths: '',
      meal_card_type: 'not_available',
      daily_meal_card_value: '10.22',
      meal_card_days: '22',
      year: 2026,
      month: '05',
      apply_irs_jovem: 'false',
      activity_start_year: '',
    }).subscribe();

    const req = httpMock.expectOne('https://simulator.do.doutorfinancas.pt/api/simulators/net-salary');
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBeTrue();

    const body = req.request.body as FormData;
    expect(body.get('year')).toBe('2026');
    expect(body.has('month')).toBeFalse();
    expect(body.get('number_of_dependents')).toBe('0');
    expect(body.get('number_of_dependents_with_disability')).toBe('0');
    expect(body.get('extraordinary_compensation')).toBe('0');
    expect(body.get('social_security_rate')).toBe('0');
    expect(body.get('daily_meal_card_value')).toBe('0');
    expect(body.get('meal_card_days')).toBe('0');

    req.flush({ data: { ok: true } });
  });

  it('posts normalized form data to the IRS table endpoint', () => {
    service.getIrsTable({
      location: 'continente',
      marital_status: 'CAS2',
      number_of_dependents: 1,
      disability_above_60: false,
      spouse_has_disability: false,
      dependents_have_disability: false,
      number_of_dependents_with_disability: 0,
      base_salary: 1200,
      extraordinary_compensation: 0,
      other_irs_ss_income: 0,
      other_irs_income: 0,
      other_exempt_income: 0,
      social_security_rate: 11,
      twelfths: '2x50%',
      meal_card_type: 'cash',
      daily_meal_card_value: 6,
      meal_card_days: 22,
      year: 2025,
      month: 'default',
      apply_irs_jovem: 'false',
      activity_start_year: '',
    }).subscribe();

    const req = httpMock.expectOne('https://simulator.do.doutorfinancas.pt/api/simulators/net-salary-irs-table');
    const body = req.request.body as FormData;
    expect(req.request.method).toBe('POST');
    expect(body.get('month')).toBe('');
    expect(body.get('twelfths')).toBe('2x50%');
    expect(body.get('social_security_rate')).toBe('11');

    req.flush({ data: [] });
  });

  it('extracts calculation totals from the Laravel net salary response shape', () => {
    const result = service.extractCalculationResult({
      data: {
        salary_simulation: {
          raw_data: {
            net_salary: {
              total_net_salary: 1785.5,
              twelfths_withholding: 12.25,
            },
            gross_salary: {
              total_gross_salary: 2300,
            },
            deductions: {
              irs_withholding: 240.75,
              social_security_contribution: 261.5,
            },
          },
        },
      },
    });

    expect(result.netSalary).toBe(1785.5);
    expect(result.grossSalary).toBe(2300);
    expect(result.irsWithheld).toBe(253);
    expect(result.socialSecurity).toBe(261.5);
  });
});
