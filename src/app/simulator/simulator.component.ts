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

// Formato intermediário comum para ambos os cálculos
interface ProposalData {
  flexBenefitsPercentage: number;
  monthlyBaseSalary: number;
  monthlyIHT: number;
  monthlyBenefits: number;
  monthlyMealAllowance: number;
  irs: number;
  socialSecurityMax: number;
  socialSecurityMin: number;
  totalNetMax: number;
  totalNetMin: number;
  annualCost: number;
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
  targetNetSalary = 2000;
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

  // Discount information
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

    // Ambos os caminhos geram ProposalData[]
    const proposals: ProposalData[] = this.calculateBy === 'annualCost' 
      ? this.calculateByAnnualCost() 
      : this.calculateByNetSalaryTarget();

    // Conversão unificada para SimulationResult[]
    this.liquidSalarySimulations = proposals.map(proposal => 
      this.mapToSimulationResult(proposal)
    );
    
    this.isLoading = false;
  }

  private calculateByAnnualCost(): ProposalData[] {
    const monthsToMultiply = this.getMonthsMultiplier();
    const tsuFactor = this.tsu / 100;
    const budget = this.annualCost - this.annualDailyMealAllowance;
    const proposals: ProposalData[] = [];

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
      
      const mappedMaritalStatus = this.getMappedMaritalStatus();

      // Cálculo Max: Benefits não sujeitos a IRS nem SS
      const calculationMax = this.irsService.calculate({
        grossSalary: monthlyGross,
        maritalStatus: mappedMaritalStatus,
        location: this.location,
        dependents: Number(this.dependents) || 0,
        socialSecurityRate: this.segSocialRegimeGeral / 100
      });

      // Cálculo Min: Benefits sujeitos a IRS mas não SS
      const calculationMin = this.irsService.calculate({
        grossSalary: monthlyGross + monthlyValueToBenefits,
        maritalStatus: mappedMaritalStatus,
        location: this.location,
        dependents: Number(this.dependents) || 0,
        socialSecurityRate: 0
      });

      const ssForMin = this.irsService.calculate({
        grossSalary: monthlyGross,
        maritalStatus: mappedMaritalStatus,
        location: this.location,
        dependents: Number(this.dependents) || 0,
        socialSecurityRate: this.segSocialRegimeGeral / 100
      }).socialSecurity;

      const netSalaryMin = (monthlyGross + monthlyValueToBenefits) - calculationMin.irsWithheld - ssForMin;
      
      const custoAnualParaEmpresa = this.calculateAnnualCostToCompany(
        monthlyGross,
        monthlyValueToBenefits
      );

      // Formato ProposalData padronizado
      proposals.push({
        flexBenefitsPercentage: percentage,
        monthlyBaseSalary: this.roundToCents(valueWithoutIHT),
        monthlyIHT: this.roundToCents(IHT),
        monthlyBenefits: this.roundToCents(monthlyValueToBenefits),
        monthlyMealAllowance: this.monthlyMealAllowance,
        irs: this.roundToCents(calculationMax.irsWithheld),
        socialSecurityMax: this.roundToCents(calculationMax.socialSecurity),
        socialSecurityMin: this.roundToCents(ssForMin),
        totalNetMax: this.roundToCents(calculationMax.netSalary + this.monthlyMealAllowance + monthlyValueToBenefits),
        totalNetMin: this.roundToCents(netSalaryMin + this.monthlyMealAllowance),
        annualCost: this.roundToCents(custoAnualParaEmpresa)
      });
    }

    return proposals;
  }

  private calculateByNetSalaryTarget(): ProposalData[] {
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

    // Retorna diretamente as proposals do serviço
    // (assumindo que já vêm no formato ProposalData)
    return proposals;
  }

  private getMappedMaritalStatus(): MaritalStatus {
    if (this.maritalStatus === 'married') {
      return this.dependents === 1 ? 'married_one_holder' : 'married_two_holders';
    }
    return 'single';
  }

  /**
   * Método central que converte ProposalData para SimulationResult
   * Todos os cálculos passam por aqui
   */
  private mapToSimulationResult(proposal: ProposalData): SimulationResult {
    const baseSalary = Number(proposal.monthlyBaseSalary.toFixed(2));
    const iht = Number(proposal.monthlyIHT.toFixed(2));
    const irs = Number(proposal.irs.toFixed(2));
    const socialSecurityMax = Number(proposal.socialSecurityMax.toFixed(2));
    const monthlyBenefits = Number(proposal.monthlyBenefits.toFixed(2));

    const duodecimoSF = this.hasDuodecimos ? baseSalary / 12 : 0;
    console.log(proposal.annualCost);

    return {
      flexBenefitsPercentage: proposal.flexBenefitsPercentage,
      salaryBase: baseSalary,
      IHT: iht,
      duodecimoSF,
      duodecimoSN: duodecimoSF,
      irsSF: 0,
      irsSN: 0,
      irs,
      netSalary: Number((baseSalary + iht - irs - socialSecurityMax).toFixed(2)),
      monthlyMealAllowance: Number(proposal.monthlyMealAllowance),
      monthlyValueToBenefits: monthlyBenefits,
      totalMax: Number(proposal.totalNetMax.toFixed(2)),
      totalMin: Number(proposal.totalNetMin.toFixed(2)),
      salaryBaseAndIHT: baseSalary + iht,
      rendimento: baseSalary + iht + monthlyBenefits,
      custoAnualParaEmpresa: Number(proposal.annualCost.toFixed(2))
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
    return Number((Math.ceil(value * 100) / 100).toFixed(2));
  }

  private resetResults(): void {
    this.liquidSalarySimulations = [];
  }

  private clearLoadingTimer(): void {
    if (this.loadingTimer) {
      window.clearTimeout(this.loadingTimer);
      this.loadingTimer = undefined;
    }
  }
}