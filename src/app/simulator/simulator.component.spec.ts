import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { SimulatorComponent } from './simulator.component';
import { CalculateNetSalaryService, IrsResult, MaritalStatus } from '../services/calculate-net-salary-service.service';
import { SalaryReverseService } from '../services/salary-reverse.service';
import { NetSalaryEndpointService } from '../services/net-salary-endpoint.service';
import { of } from 'rxjs';

describe('SimulatorComponent', () => {
  let component: SimulatorComponent;
  let fixture: ComponentFixture<SimulatorComponent>;
  let mockIrsService: jasmine.SpyObj<CalculateNetSalaryService>;
  let mockReverseService: jasmine.SpyObj<SalaryReverseService>;
  let mockEndpointService: jasmine.SpyObj<NetSalaryEndpointService>;

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
    mockEndpointService = jasmine.createSpyObj('NetSalaryEndpointService', ['calculateNetSalary', 'extractCalculationResult']);

    // 2. Setup spy return values
    mockIrsService.calculate.and.returnValue(mockIrsResult);
    mockReverseService.getProposals.and.returnValue(mockProposals);
    mockEndpointService.calculateNetSalary.and.returnValue(of({ data: {} }));
    mockEndpointService.extractCalculationResult.and.returnValue({
      netSalary: 890,
      grossSalary: 1000,
      irsWithheld: 100,
      socialSecurity: 110,
    });

    await TestBed.configureTestingModule({
      imports: [SimulatorComponent], // Component is standalone
      providers: [
        { provide: CalculateNetSalaryService, useValue: mockIrsService },
        { provide: SalaryReverseService, useValue: mockReverseService },
        { provide: NetSalaryEndpointService, useValue: mockEndpointService },
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
      flushMicrotasks();
      
      expect(component.isLoading).toBeFalse();
      expect(component.liquidSalarySimulations.length).toBeGreaterThan(0);
      expect(mockEndpointService.calculateNetSalary).toHaveBeenCalled();
      
      // Check structure of one result
      const result = component.liquidSalarySimulations[0];
      expect(result.salaryBase).toBeDefined();
      expect(result.netSalary).toBeDefined();
    }));
  });

  describe('Calculation by Gross Salary', () => {
    it('should calculate one direct endpoint-backed simulation from gross salary', fakeAsync(() => {
      component.calculateBy = 'grossSalary';
      component.grossSalary = 1800;

      component.calculate();
      tick(1500);
      flushMicrotasks();

      expect(component.liquidSalarySimulations.length).toBe(1);
      expect(mockEndpointService.calculateNetSalary).toHaveBeenCalledWith(jasmine.objectContaining({
        base_salary: 1800,
      }));
    }));
  });

  describe('Calculation by Target Net Salary', () => {
    it('should use endpoint-backed binary search and map results', fakeAsync(() => {
      component.calculateBy = 'targetNetSalary';
      component.targetNetSalary = 1500;
      
      component.calculate();
      tick(1500);
      flushMicrotasks();

      expect(mockEndpointService.calculateNetSalary).toHaveBeenCalled();
      expect(mockReverseService.getProposals).not.toHaveBeenCalled();
      expect(component.liquidSalarySimulations.length).toBeGreaterThan(0);
    }));

    it('should not request the min scenario on every binary-search iteration', fakeAsync(() => {
      component.calculateBy = 'targetNetSalary';
      component.targetNetSalary = 1500;

      component.calculate();
      tick(1500);
      flushMicrotasks();

      expect(mockEndpointService.calculateNetSalary.calls.count()).toBeLessThanOrEqual(119);
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
      flushMicrotasks();

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
      flushMicrotasks();
      
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
      flushMicrotasks();
      expect(component.isLoading).toBeFalse();
    }));
  });

  describe('Meal Allowance Logic', () => {
    it('should include meal allowance when includeMealAllowance is true', fakeAsync(() => {
      component.includeMealAllowance = true;
      component.calculate();
      tick(1500);
      flushMicrotasks();

      // Value should be (10.46 * 22) = 230.12 for 2026 card allowance.
      expect(component.monthlyMealAllowance).toBe(230.12);
      expect(component.annualDailyMealAllowance).toBeGreaterThan(0);
    }));

    it('should set meal allowance to 0 when includeMealAllowance is false', fakeAsync(() => {
      component.includeMealAllowance = false;
      component.calculate();
      tick(1500);
      flushMicrotasks();

      expect(component.monthlyMealAllowance).toBe(0);
      expect(component.annualDailyMealAllowance).toBe(0);
    }));
  });

  describe('Marital Status and Dependents Mapping', () => {

    it('should map "single" and 0 dependents to Table I', fakeAsync(() => {
      component.maritalStatus = 'single';
      component.dependents = 0;
      
      component.calculate();
      tick(1500);
      flushMicrotasks();

      expect(mockEndpointService.calculateNetSalary).toHaveBeenCalledWith(jasmine.objectContaining({
        marital_status: 'SOL',
        number_of_dependents: 0
      }));
    }));

    it('should map "single" and 2 dependents to Table II', fakeAsync(() => {
      component.maritalStatus = 'single';
      component.dependents = 2;
      
      component.calculate();
      tick(1500);
      flushMicrotasks();

      expect(mockEndpointService.calculateNetSalary).toHaveBeenCalledWith(jasmine.objectContaining({
        marital_status: 'SOL',
        number_of_dependents: 2
      }));
    }));

    it('should map "married_one_holder" to CAS1', fakeAsync(() => {
      component.maritalStatus = 'married_one_holder';
      component.dependents = 1;
      
      component.calculate();
      tick(1500);
      flushMicrotasks();

      expect(mockEndpointService.calculateNetSalary).toHaveBeenCalledWith(jasmine.objectContaining({
        marital_status: 'CAS1',
        number_of_dependents: 1
      }));
    }));

    it('should map "married_two_holders" to CAS2', fakeAsync(() => {
      component.maritalStatus = 'married_two_holders';
      component.dependents = 2;
      
      component.calculate();
      tick(1500);
      flushMicrotasks();

      expect(mockEndpointService.calculateNetSalary).toHaveBeenCalledWith(jasmine.objectContaining({
        marital_status: 'CAS2',
        number_of_dependents: 2
      }));
    }));

    it('should send all official simulator options to the endpoint payload', fakeAsync(() => {
      component.calculateBy = 'grossSalary';
      component.grossSalary = 2100;
      component.location = 'acores';
      component.maritalStatus = 'married_two_holders';
      component.dependents = 2;
      component.disabilityAbove60 = true;
      component.spouseHasDisability = true;
      component.dependentsHaveDisability = true;
      component.dependentsWithDisability = 1;
      component.extraordinaryCompensation = 150;
      component.otherIrsSsIncome = 25;
      component.otherIrsIncome = 30;
      component.otherExemptIncome = 40;
      component.socialSecurityRate = 9.3;
      component.twelfths = '1x50%';
      component.mealCardType = 'cash';
      component.subsRefeicaoDaily = 6.15;
      component.subsRefeicaoDays = 20;
      component.year = 2025;
      component.month = '07';
      component.applyIrsJovem = 'true';
      component.activityStartYear = '3';

      component.calculate();
      tick(1500);
      flushMicrotasks();

      expect(mockEndpointService.calculateNetSalary).toHaveBeenCalledWith(jasmine.objectContaining({
        location: 'acores',
        marital_status: 'CAS2',
        number_of_dependents: 2,
        disability_above_60: true,
        spouse_has_disability: true,
        dependents_have_disability: true,
        number_of_dependents_with_disability: 1,
        base_salary: 2100,
        extraordinary_compensation: 150,
        other_irs_ss_income: 25,
        other_irs_income: 30,
        other_exempt_income: 40,
        social_security_rate: 9.3,
        twelfths: '1x50%',
        meal_card_type: 'cash',
        daily_meal_card_value: 6.15,
        meal_card_days: 20,
        year: 2025,
        month: '07',
        apply_irs_jovem: 'true',
        activity_start_year: '3',
      }));
    }));
  });
});
