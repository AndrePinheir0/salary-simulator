import { TestBed } from '@angular/core/testing';
import { SalaryReverseService, ReverseCalculationInput } from './salary-reverse.service';
import { CalculateNetSalaryService, IrsResult } from './calculate-net-salary-service.service';

describe('SalaryReverseService', () => {
  let service: SalaryReverseService;
  let mockIrsService: jasmine.SpyObj<CalculateNetSalaryService>;

  const mockIrsResult: IrsResult = {
    tableId: 'I',
    band: { rate: 0.1, deduction: 0 },
    rate: 0.1,
    deduction: 0,
    additionalPerDependent: 0,
    irsWithheld: 100,
    socialSecurity: 110,
    netSalary: 790
  };

  beforeEach(() => {
    mockIrsService = jasmine.createSpyObj('CalculateNetSalaryService', ['calculate']);
    
    // Simple dynamic mock: net salary is roughly 80% of gross
    mockIrsService.calculate.and.callFake((input) => ({
      tableId: 'I',
      band: { rate: 0.1, deduction: 0 },
      rate: 0.1,
      deduction: 0,
      additionalPerDependent: 0,
      irsWithheld: input.grossSalary * 0.1,
      socialSecurity: input.grossSalary * 0.11,
      netSalary: input.grossSalary * 0.79
    }));

    TestBed.configureTestingModule({
      providers: [
        SalaryReverseService,
        { provide: CalculateNetSalaryService, useValue: mockIrsService }
      ]
    });
    service = TestBed.inject(SalaryReverseService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should generate multiple proposals', () => {
    const input: ReverseCalculationInput = {
      targetNetSalary: 1500,
      location: 'continente',
      maritalStatus: 'single',
      dependents: 0,
      hasDuodecimos: false,
      mealAllowanceDaily: 10,
      mealAllowanceDays: 22,
      mealAllowanceMonths: 11,
      ihtPercentage: 25,
      tsu: 23.75,
      ssRate: 0.11
    };

    const proposals = service.getProposals(input);
    
    expect(proposals.length).toBe(7);
    expect(proposals[0].flexBenefitsPercentage).toBe(0);
    expect(proposals[6].flexBenefitsPercentage).toBe(30);
  });

  it('should solve for target net salary using binary search', () => {
    const targetNet = 1500;
    const input: ReverseCalculationInput = {
      targetNetSalary: targetNet,
      location: 'continente',
      maritalStatus: 'single',
      dependents: 0,
      hasDuodecimos: false,
      mealAllowanceDaily: 9.60,
      mealAllowanceDays: 22,
      mealAllowanceMonths: 11,
      ihtPercentage: 0,
      tsu: 23.75,
      ssRate: 0.11
    };

    const proposals = service.getProposals(input);
    const firstProposal = proposals[0];

    // The binary search aims for totalNetMax to be >= targetNetSalary
    // With our mock netSalary = gross * 0.79, we expect a solution to exist.
    expect(firstProposal.totalNetMax).toBeGreaterThanOrEqual(targetNet - 1); 
    expect(firstProposal.totalNetMax).toBeLessThan(targetNet + 1);
  });
});

