import { TestBed } from '@angular/core/testing';
import { CalculateNetSalaryService, IrsDataset, IrsInput } from './calculate-net-salary-service.service';

describe('CalculateNetSalaryService', () => {
  let service: CalculateNetSalaryService;

  // Mock dataset for testing
  const mockDataset: IrsDataset = {
    meta: {
      country: 'PT',
      region: 'continente',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      period: 'monthly',
      unit: 'EUR'
    },
    tables: [
      {
        id: 'I',
        name: 'Tabela I',
        audience: 'Single',
        hasDisability: false,
        assumesDependents: '0+',
        bands: [
          { upTo: 920, rate: 0, deduction: 0 },
          { 
            upTo: 1042, 
            rate: 0.125, 
            deduction: { type: 'formula', expression: '0.125 * 2.60 * (1273.85 - R)' },
            additionalPerDependent: 21.43
          },
          { over: 1042, rate: 0.2, deduction: 100 }
        ]
      },
      {
        id: 'II',
        name: 'Tabela II',
        audience: 'Single 1+',
        hasDisability: false,
        assumesDependents: '1+',
        bands: [{ upTo: 5000, rate: 0.1, deduction: 0 }]
      },
      {
        id: 'III',
        name: 'Tabela III',
        audience: 'Married 1 holder',
        hasDisability: false,
        assumesDependents: '0+',
        bands: [{ upTo: 5000, rate: 0.1, deduction: 0 }]
      },
      {
        id: 'IV',
        name: 'Tabela IV',
        audience: 'Disability 0 dependents',
        hasDisability: true,
        assumesDependents: '0',
        bands: [{ upTo: 5000, rate: 0.1, deduction: 0 }]
      },
      {
        id: 'V',
        name: 'Tabela V',
        audience: 'Disability 1+ dependents single',
        hasDisability: true,
        assumesDependents: '1+',
        bands: [{ upTo: 5000, rate: 0.1, deduction: 0 }]
      },
      {
        id: 'VI',
        name: 'Tabela VI',
        audience: 'Disability 1+ dependents married 2 holders',
        hasDisability: true,
        assumesDependents: '1+',
        bands: [{ upTo: 5000, rate: 0.1, deduction: 0 }]
      },
      {
        id: 'VII',
        name: 'Tabela VII',
        audience: 'Disability married 1 holder',
        hasDisability: true,
        assumesDependents: '0+',
        bands: [{ upTo: 5000, rate: 0.1, deduction: 0 }]
      }
    ]
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CalculateNetSalaryService);
    service.setDataset(mockDataset);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('pickTableId', () => {
    it('should pick Table I for single without dependents and no disability', () => {
      expect((service as any).pickTableId('single', 0, false)).toBe('I');
    });

    it('should pick Table II for single with dependents and no disability', () => {
      expect((service as any).pickTableId('single', 1, false)).toBe('II');
    });

    it('should pick Table III for married one holder and no disability', () => {
      expect((service as any).pickTableId('married_one_holder', 0, false)).toBe('III');
    });

    it('should pick Table VII for married one holder and disability', () => {
      expect((service as any).pickTableId('married_one_holder', 0, true)).toBe('VII');
    });
  });

  describe('resolveDeduction', () => {
    it('should return number for numeric deduction', () => {
      expect((service as any).resolveDeduction(94.71, 1000)).toBe(94.71);
    });

    it('should resolve formula deduction: 0.125 * 2.60 * (1273.85 - R)', () => {
      const R = 1000;
      const expected = 0.125 * 2.60 * (1273.85 - R);
      const formula = { type: 'formula', expression: '0.125 * 2.60 * (1273.85 - R)' };
      expect((service as any).resolveDeduction(formula, R)).toBeCloseTo(expected, 5);
    });

    it('should throw error for unsupported formula', () => {
      const formula = { type: 'formula', expression: '2 * R' };
      expect(() => (service as any).resolveDeduction(formula, 1000)).toThrowError(/Unsupported deduction formula/);
    });
  });

  describe('calculate', () => {
    it('should throw error if dataset is not set', () => {
      const newService = new CalculateNetSalaryService();
      expect(() => newService.calculate({} as any)).toThrowError(/IRS dataset not set/);
    });

    it('should calculate 0% IRS for wage under the first band (920)', () => {
      const input: IrsInput = {
        grossSalary: 900,
        maritalStatus: 'single',
        location: 'continente',
        dependents: 0
      };
      const result = service.calculate(input);
      expect(result.irsWithheld).toBe(0);
      expect(result.socialSecurity).toBe(99); // 11% of 900
      expect(result.netSalary).toBe(801);
    });

    it('should calculate IRS using formula for second band', () => {
      const input: IrsInput = {
        grossSalary: 1000,
        maritalStatus: 'single',
        location: 'continente',
        dependents: 1
      };
      // Table II (picked for single + 1 dependent): rate 0.1, deduction 0
      // irsRaw = (1000 * 0.1) - 0 - (0 * 1) = 100
      const result = service.calculate(input);
      expect(result.irsWithheld).toBe(100);
      expect(result.socialSecurity).toBe(110);
      expect(result.netSalary).toBe(790);
    });

  });
});

