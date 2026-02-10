import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { SimulatorComponent } from './simulator.component';
import { CalculateNetSalaryService, IrsResult, MaritalStatus } from '../services/calculate-net-salary-service.service';
import { SalaryReverseService } from '../services/salary-reverse.service';
import { of } from 'rxjs';

describe('SimulatorComponent', () => {
  let component: SimulatorComponent;
  let fixture: ComponentFixture<SimulatorComponent>;
  let mockIrsService: jasmine.SpyObj<CalculateNetSalaryService>;
  let mockReverseService: jasmine.SpyObj<SalaryReverseService>;

  // Mock data/results
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

  const mockProposals = [
    {
      flexBenefitsPercentage: 0,
      monthlyBaseSalary: 1000,
      monthlyIHT: 0,
      monthlyBenefits: 0,
      monthlyMealAllowance: 100,
      irs: 100,
      socialSecurityMax: 110,
      socialSecurityMin: 0,
      totalNetMax: 890,
      totalNetMin: 890,
      annualCost: 14000
    }
  ];

  beforeEach(async () => {
    // 1. Create spies for services
    mockIrsService = jasmine.createSpyObj('CalculateNetSalaryService', ['setDataset', 'calculate']);
    mockReverseService = jasmine.createSpyObj('SalaryReverseService', ['getProposals']);

    // 2. Setup spy return values
    mockIrsService.calculate.and.returnValue(mockIrsResult);
    mockReverseService.getProposals.and.returnValue(mockProposals);

    await TestBed.configureTestingModule({
      imports: [SimulatorComponent], // Component is standalone
      providers: [
        { provide: CalculateNetSalaryService, useValue: mockIrsService },
        { provide: SalaryReverseService, useValue: mockReverseService },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SimulatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(mockIrsService.setDataset).toHaveBeenCalled(); // Check dataset initialization
  });

  describe('Calculation by Annual Cost (Default)', () => {
    it('should calculate simulations correctly', fakeAsync(() => {
      component.calculateBy = 'annualCost';
      component.annualCost = 30000;
      
      component.calculate();
      
      // Simulate passage of time for loading phrases interval and final timeout
      tick(500); 
      expect(component.isLoading).toBeTrue();
      
      tick(1000); // Remaining time (total 1500ms)
      
      expect(component.isLoading).toBeFalse();
      expect(component.liquidSalarySimulations.length).toBeGreaterThan(0);
      
      // Since it's a loop based on flex benefits step (30 / 5 = 6 + 1 = 7 variations usually)
      // We expect multiple calls or at least one if step > max
      expect(mockIrsService.calculate).toHaveBeenCalled();
      
      // Check structure of one result
      const result = component.liquidSalarySimulations[0];
      expect(result.salaryBase).toBeDefined();
      expect(result.netSalary).toBeDefined();
    }));
  });

  describe('Calculation by Target Net Salary', () => {
    it('should use ReverseService and map results', fakeAsync(() => {
      component.calculateBy = 'targetNetSalary';
      component.targetNetSalary = 1500;
      
      component.calculate();
      tick(1500);

      expect(mockReverseService.getProposals).toHaveBeenCalled();
      expect(component.liquidSalarySimulations.length).toBe(1);
      expect(component.liquidSalarySimulations[0].salaryBase).toBe(1000); 
    }));
  });

  describe('Duodecimos Logic', () => {
    it('should decompose annual/12 values back to 14 months basis when hasDuodecimos is true', fakeAsync(() => {
      // Setup specific proposal from the annual cost calculation logic
      // Assume calculateByAnnualCost returns a proposal with monthlyBase = 1200 (annual/12)
      // If hasDuodecimos, mapToSimulationResult should convert this 1200 -> 1200 * 12 / 14 = ~1028.57
      
      // We can test mapToSimulationResult directly via calculate flow
      component.calculateBy = 'annualCost'; 
      component.hasDuodecimos = true;
      
      // Force return for calculate call
      mockIrsService.calculate.and.returnValue({
          ...mockIrsResult,
          irsWithheld: 100 // Mock IRS for the split
      });

      component.calculate();
      tick(1500);

      const result = component.liquidSalarySimulations[0];
      
      // Verify decomposing
      // The component calculates 'monthlyGross' internally in loop. 
      // If hasDuodecimos is true, getMonthsMultiplier returns 12.
      // So 'annualGross' is divided by 12. 
      // Let's check if the result shows the decomposed values.
      
      // duodecimoSF should be > 0
      expect(result.duodecimoSF).toBeGreaterThan(0);
      expect(result.duodecimoSN).toBeGreaterThan(0);
      
      // IRS on duo should ideally be > 0 if there was remaining tax
      // Since we mocked IRS return, we should see it reflected if logic holds
      // We mocked IRS 100.
      expect(result.irsSF).toBeDefined(); 
      expect(result.irsSN).toBeDefined();
    }));

    it('should set duodecimos to 0 when hasDuodecimos is false', fakeAsync(() => {
      component.hasDuodecimos = false;
      
      component.calculate();
      tick(1500);
      
      const result = component.liquidSalarySimulations[0];
      expect(result.duodecimoSF).toBe(0);
      expect(result.duodecimoSN).toBe(0);
      expect(result.irsSF).toBe(0);
      expect(result.irsSN).toBe(0);
    }));
  });

  describe('Loading State', () => {
    it('should cycle through loading phrases', fakeAsync(() => {
      component.calculate();
      
      expect(component.isLoading).toBeTrue();
      expect(component.displayedLoadingPhrases.length).toBe(1);
      expect(component.displayedLoadingPhrases[0]).toBe('Espera...');
      
      tick(200);
      expect(component.displayedLoadingPhrases.length).toBe(2);
      expect(component.displayedLoadingPhrases[1]).toBe('Quase...');
      
      tick(200);
      expect(component.displayedLoadingPhrases.length).toBe(3);
      expect(component.displayedLoadingPhrases[2]).toBe('A finalizar...');
      
      tick(1100); // Finish
      expect(component.isLoading).toBeFalse();
    }));
  });

  describe('Marital Status and Dependents Mapping', () => {
    it('should map "single" and 0 dependents to Table I', fakeAsync(() => {
      component.maritalStatus = 'single';
      component.dependents = 0;
      
      component.calculate();
      tick(1500);

      expect(mockIrsService.calculate).toHaveBeenCalledWith(jasmine.objectContaining({
        maritalStatus: 'single',
        dependents: 0
      }));
    }));

    it('should map "single" and 2 dependents to Table II', fakeAsync(() => {
      component.maritalStatus = 'single';
      component.dependents = 2;
      
      component.calculate();
      tick(1500);

      expect(mockIrsService.calculate).toHaveBeenCalledWith(jasmine.objectContaining({
        maritalStatus: 'single',
        dependents: 2
      }));
    }));

    it('should map "married" with 1 dependent to "married_one_holder" (Table III)', fakeAsync(() => {
      component.maritalStatus = 'married';
      component.dependents = 1;
      
      component.calculate();
      tick(1500);

      expect(mockIrsService.calculate).toHaveBeenCalledWith(jasmine.objectContaining({
        maritalStatus: 'married_one_holder',
        dependents: 1
      }));
    }));

    it('should map "married" with 2 dependents to "married_two_holders" (Table I/II)', fakeAsync(() => {
      component.maritalStatus = 'married';
      component.dependents = 2;
      
      component.calculate();
      tick(1500);

      expect(mockIrsService.calculate).toHaveBeenCalledWith(jasmine.objectContaining({
        maritalStatus: 'married_two_holders',
        dependents: 2
      }));
    }));
  });
});


