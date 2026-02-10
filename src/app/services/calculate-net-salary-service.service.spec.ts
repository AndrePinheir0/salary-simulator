import { TestBed } from '@angular/core/testing';
import { CalculateNetSalaryService, IrsInput, MaritalStatus } from './calculate-net-salary-service.service';
import irsData from '../data/irs_2026_continente.json';

describe('CalculateNetSalaryService', () => {
  let service: CalculateNetSalaryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CalculateNetSalaryService);
    // Use real data for these tests
    service.setDataset(irsData as any);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Table Selection (pickTableId)', () => {
    // Helper to call private method
    const getTableId = (status: MaritalStatus, deps: number, disability: boolean = false) => {
      return (service as any).pickTableId(status, deps, disability);
    };

    describe('Non-Disabled (Sem Deficiência)', () => {
      it('should return Table I for Single/Married 2 holders with 0 dependents', () => {
        expect(getTableId('single', 0)).toBe('I');
        expect(getTableId('married_two_holders', 0)).toBe('I');
      });

      it('should return Table II for Single/Married 2 holders with 1+ dependents', () => {
        expect(getTableId('single', 1)).toBe('II');
        expect(getTableId('single', 3)).toBe('II');
        expect(getTableId('married_two_holders', 1)).toBe('II');
      });

      it('should return Table III for Married 1 holder (any dependents)', () => {
        expect(getTableId('married_one_holder', 0)).toBe('III');
        expect(getTableId('married_one_holder', 2)).toBe('III');
      });
    });

    describe('Disabled (Com Deficiência)', () => {
      it('should return Table IV for Single/Married 2 holders with 0 dependents', () => {
        expect(getTableId('single', 0, true)).toBe('IV');
        expect(getTableId('married_two_holders', 0, true)).toBe('IV');
      });

      it('should return Table V for Single with 1+ dependents', () => {
        expect(getTableId('single', 1, true)).toBe('V');
      });

      it('should return Table VI for Married 2 holders with 1+ dependents', () => {
        expect(getTableId('married_two_holders', 1, true)).toBe('VI');
      });

      it('should return Table VII for Married 1 holder (any dependents)', () => {
        expect(getTableId('married_one_holder', 0, true)).toBe('VII');
        expect(getTableId('married_one_holder', 2, true)).toBe('VII');
      });
    });
  });

  describe('Real Calculation Examples (2026 Tables)', () => {
    it('should calculate 0 IRS for 900€ (under minimum of 920€)', () => {
      const input: IrsInput = {
        grossSalary: 900,
        maritalStatus: 'single',
        location: 'continente',
        dependents: 0
      };
      const result = service.calculate(input);
      expect(result.irsWithheld).toBe(0);
      expect(result.socialSecurity).toBe(99);
      expect(result.netSalary).toBe(801);
    });

    it('should calculate correctly for 1200€ (Table I)', () => {
      const input: IrsInput = {
        grossSalary: 1200,
        maritalStatus: 'single',
        location: 'continente',
        dependents: 0
      };
      // 1200 is in Band 5: rate 0.212, deduction 158.18
      // IRS = 1200 * 0.212 - 158.18 = 254.4 - 158.18 = 96.22
      const result = service.calculate(input);
      expect(result.irsWithheld).toBe(96.22);
      expect(result.socialSecurity).toBe(132);
      expect(result.netSalary).toBe(971.78);
    });

    it('should apply dependent deduction correctly (Table II)', () => {
      const input: IrsInput = {
        grossSalary: 1200,
        maritalStatus: 'single',
        location: 'continente',
        dependents: 2
      };
      // Table II, Band 5: rate 0.212, deduction 158.18, additional per dependent 34.29
      // IRS = (1200 * 0.212) - 158.18 - (2 * 34.29) = 254.4 - 158.18 - 68.58 = 27.64
      const result = service.calculate(input);
      expect(result.irsWithheld).toBe(27.64);
      expect(result.netSalary).toBe(1040.36);
    });
  });
});


