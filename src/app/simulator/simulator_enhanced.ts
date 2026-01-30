import { Component, inject, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbAccordionModule } from '@ng-bootstrap/ng-bootstrap';
import { CalculateNetSalaryService, MaritalStatus } from '../services/calculate-net-salary-service.service';
import { SalaryReverseService } from '../services/salary-reverse.service';
import irsData from '../data/irs_2026_continente.json';

interface SimulationResult {
  flexBenefitsPercentage: number;
  salaryBase: number;
  IHT: number;
  duodecimoSF: number;
  duodecimoSN: number;
  irsSF: number;
  irsSN: number;
  irs: number;
  netSalary: number;
  monthlyValueToBenefits: number;
  monthlyMealAllowance: number;
  totalMax: number;
  totalMin: number;
  salaryBaseAndIHT: number;
  rendimento: number;
  custoAnualParaEmpresa: number;
}

type CalculateBy = 'annualCost' | 'targetNetSalary';
type MaritalStatusOption = 'single' | 'married';
type LocationOption = 'continente' | 'acores' | 'madeira';

@Component({
  selector: 'app-simulator',
  standalone: true,
  imports: [FormsModule, NgbAccordionModule],
  templateUrl: './simulator.component.html',
  styleUrl: './simulator.component.scss',
})
export class SimulatorComponent implements OnDestroy {
  // Loading state
  isLoading = false;
  loadingStatus = '';

  // Calculated values
  annualDailyMealAllowance = 0;
  monthlyMealAllowance = 0;
  pickedIHTPercentage = 0;

  // Form inputs
  hasDuodecimos = false;
  includeMealAllowance = true;
  IhtPercentage = 25;
  calculateBy: CalculateBy = 'annualCost';
  annualCost = 30000;
  targetNetSalary = 1000;
  maritalStatus: MaritalStatusOption = 'single';
  location: LocationOption = 'continente';
  dependents = 0;

  // Constants
  readonly subsRefeicaoDaily = 10.22;
  readonly subsRefeicaoDays = 22;
  readonly subsRefeicaoMonths = 11;
  readonly tsu = 23.75;
  readonly segSocialRegimeGeral = 11;
  readonly maxFlexBenefitsPercentage = 30;
  readonly flexBenefitsStep = 5;

  // Results
  liquidSalarySimulations: SimulationResult[] = [];
  results: any[] = [];

  // Discount information (consider moving to a constant file)
  readonly discounts = {
    irs_only: ['flexibleBenefits'],
    irs_and_ss: ['salaryBase', 'IHT'],
    no_discount: ['mealAllowance']
  } as const;

  private readonly irsService = inject(CalculateNetSalaryService);
  private readonly reverseService = inject(SalaryReverseService);
  private loadingTimer?: number;

  constructor() {
    this.irsService.setDataset(irsData as any);
  }

  ngOnDestroy(): void {
    this.clearLoadingTimer();
  }

  calculate(): void {
    this.resetResults();
    this.isLoading = true;
    this.pickedIHTPercentage = this.IhtPercentage;
    this.annualDailyMealAllowance = this.calculateAnnualMealAllowance();
    this.monthlyMealAllowance = this.calculateMonthlyMealAllowance();

    // Execute calculation immediately (remove artificial delay)
    if (this.calculateBy === 'annualCost') {
      this.calculateByAnnualCost();
    } else {
      this.calculateByNetSalaryTarget();
    }
    
    this.isLoading = false;
  }

  private calculateByAnnualCost(): void {
    const monthsToMultiply = this.getMonthsMultiplier();
    const tsuFactor = this.tsu / 100;
    const budget = this.annualCost - this.annualDailyMealAllowance;

    for (let percentage = 0; percentage <= this.maxFlexBenefitsPercentage; percentage += this.flexBenefitsStep) {
      const normalizedPercentage = percentage / 100;
      const factor = (1 - normalizedPercentage) * (1 + tsuFactor) + normalizedPercentage;
      const distributable = budget / factor;

      const annualValueToBenefits = distributable * normalizedPercentage;
      const annualGross = distributable * (1 - normalizedPercentage);

      const monthlyValueToBenefits = annualValueToBenefits / 12;
      const monthlyGross = annualGross / monthsToMultiply;

      const IHT = this.calculateIHT(monthlyGross);
      const valueWithoutIHT = monthlyGross - IHT;
      const rendimento = monthlyGross + monthlyValueToBenefits;
      
      const custoAnualParaEmpresa = this.calculateAnnualCostToCompany(
        monthlyGross, 
        monthlyValueToBenefits
      );

      const result = {
        salaryBase: this.roundToCents(valueWithoutIHT),
        IHT: this.roundToCents(IHT),
        salaryBaseAndIHT: this.roundToCents(monthlyGross),
        monthlyMealAllowance: this.monthlyMealAllowance,
        flexBenefitsPercentage: percentage,
        monthlyValueToBenefits: this.roundToCents(monthlyValueToBenefits),
        rendimento: this.roundToCents(rendimento),
        custoAnualPAraEmpresaSemSR: this.roundToCents(custoAnualParaEmpresa - this.annualDailyMealAllowance),
        custoAnualPAraEmpresaComSR: this.roundToCents(custoAnualParaEmpresa)
      };
      
      this.results.push(result);
      this.calculateNetSalary(result);
    }
  }

  private calculateNetSalary(result: any): void {
    const grossSalary = Number(result.salaryBaseAndIHT);
    const monthlyValueToBenefits = Number(result.monthlyValueToBenefits);
    const mappedMaritalStatus = this.getMappedMaritalStatus();

    // Max scenario: Benefits não sujeitos a IRS nem SS
    const calculationMax = this.irsService.calculate({
      grossSalary,
      maritalStatus: mappedMaritalStatus,
      location: this.location,
      dependents: Number(this.dependents) || 0,
      socialSecurityRate: this.segSocialRegimeGeral / 100
    });

    // Min scenario: Benefits sujeitos a IRS mas não SS
    const calculationMin = this.irsService.calculate({
      grossSalary: grossSalary + monthlyValueToBenefits,
      maritalStatus: mappedMaritalStatus,
      location: this.location,
      dependents: Number(this.dependents) || 0,
      socialSecurityRate: 0
    });

    const ssForMin = this.irsService.calculate({
      grossSalary,
      maritalStatus: mappedMaritalStatus,
      location: this.location,
      dependents: Number(this.dependents) || 0,
      socialSecurityRate: this.segSocialRegimeGeral / 100
    }).socialSecurity;

    const netSalaryMin = (grossSalary + monthlyValueToBenefits) - calculationMin.irsWithheld - ssForMin;

    const duodecimoSF = this.hasDuodecimos ? Number(result.salaryBase) / 12 : 0;
    const custoAnualParaEmpresa = this.calculateAnnualCostToCompany(
      grossSalary, 
      monthlyValueToBenefits
    );

    this.liquidSalarySimulations.push({
      flexBenefitsPercentage: result.flexBenefitsPercentage,
      salaryBase: Number(result.salaryBase),
      IHT: Number(result.IHT),
      duodecimoSF,
      duodecimoSN: duodecimoSF,
      irsSF: 0,
      irsSN: 0,
      irs: calculationMax.irsWithheld,
      netSalary: calculationMax.netSalary,
      monthlyMealAllowance: result.monthlyMealAllowance,
      monthlyValueToBenefits,
      totalMax: calculationMax.netSalary + result.monthlyMealAllowance + monthlyValueToBenefits,
      totalMin: netSalaryMin + result.monthlyMealAllowance,
      salaryBaseAndIHT: result.salaryBaseAndIHT,
      rendimento: result.rendimento,
      custoAnualParaEmpresa
    });
  }

  private calculateByNetSalaryTarget(): void {
    const mappedMaritalStatus = this.getMappedMaritalStatus();

    const proposals = this.reverseService.getProposals({
      targetNetSalary: this.targetNetSalary,
      location: this.location,
      maritalStatus: mappedMaritalStatus,
      dependents: Number(this.dependents) || 0,
      hasDuodecimos: this.hasDuodecimos,
      mealAllowanceDaily: this.subsRefeicaoDaily,
      mealAllowanceDays: this.subsRefeicaoDays,
      mealAllowanceMonths: this.subsRefeicaoMonths,
      ihtPercentage: this.IhtPercentage,
      tsu: this.tsu,
      ssRate: this.segSocialRegimeGeral / 100
    });

    this.liquidSalarySimulations = proposals.map(proposal => 
      this.mapToSimulationResult(proposal)
    );
  }

  private getMappedMaritalStatus(): MaritalStatus {
    if (this.maritalStatus === 'married') {
      return this.dependents === 1 ? 'married_one_holder' : 'married_two_holders';
    }
    return 'single';
  }

  private mapToSimulationResult(element: any): SimulationResult {
    const baseSalary = Number(element.monthlyBaseSalary);
    const iht = Number(element.monthlyIHT);
    const irs = Number(element.irs);
    const socialSecurityMax = Number(element.socialSecurityMax);

    return {
      flexBenefitsPercentage: element.flexBenefitsPercentage,
      salaryBase: baseSalary,
      IHT: iht,
      duodecimoSF: 0,
      duodecimoSN: 0,
      irsSF: 0,
      irsSN: 0,
      irs,
      netSalary: baseSalary + iht - irs - socialSecurityMax,
      monthlyMealAllowance: Number(element.monthlyMealAllowance),
      monthlyValueToBenefits: Number(element.monthlyBenefits),
      totalMax: Number(element.totalNetMax),
      totalMin: Number(element.totalNetMin),
      salaryBaseAndIHT: baseSalary + iht,
      rendimento: baseSalary + iht + Number(element.monthlyBenefits),
      custoAnualParaEmpresa: Number(element.annualCost)
    };
  }

  private calculateAnnualCostToCompany(
    grossSalary: number,
    valueToBenefits: number
  ): number {
    const monthsToMultiply = this.getMonthsMultiplier();
    const annualGross = grossSalary * monthsToMultiply;
    const annualBenefits = valueToBenefits * 12;
    const tsuFactor = 1 + this.tsu / 100;

    return annualGross * tsuFactor + annualBenefits + this.annualDailyMealAllowance;
  }

  // Helper methods
  private getMonthsMultiplier(): number {
    return this.hasDuodecimos ? 12 : 14;
  }

  private calculateIHT(monthlyGross: number): number {
    return (monthlyGross * this.IhtPercentage) / (100 + this.IhtPercentage);
  }

  private calculateMonthlyMealAllowance(): number {
    return this.subsRefeicaoDaily * this.subsRefeicaoDays;
  }

  private calculateAnnualMealAllowance(): number {
    return this.subsRefeicaoDaily * this.subsRefeicaoDays * this.subsRefeicaoMonths;
  }

  private roundToCents(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private resetResults(): void {
    this.results = [];
    this.liquidSalarySimulations = [];
  }

  private clearLoadingTimer(): void {
    if (this.loadingTimer) {
      window.clearTimeout(this.loadingTimer);
      this.loadingTimer = undefined;
    }
  }
}