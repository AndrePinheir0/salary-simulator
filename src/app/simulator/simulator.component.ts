import { Component, inject, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbAccordionModule } from '@ng-bootstrap/ng-bootstrap';
import {
  CalculateNetSalaryService,
  MaritalStatus,
} from '../services/calculate-net-salary-service.service';
import { SalaryReverseService } from '../services/salary-reverse.service';
import { CurrencyPtPipe } from '../pipes/currency-pt.pipe';
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
  imports: [FormsModule, NgbAccordionModule, CurrencyPtPipe],
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
  pickedHasDuodecimos = false;
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
    no_discount: ['mealAllowance'],
  } as const;

  loadingPhrases = [
    'Espera...',
    'Quase...',
    'A finalizar...',
  ];
  private readonly irsService = inject(CalculateNetSalaryService);
  private readonly reverseService = inject(SalaryReverseService);
  private loadingTimer?: number;

  constructor() {
    this.irsService.setDataset(irsData as any);
  }

  ngOnDestroy(): void {
    this.clearLoadingTimer();
  }

  displayedLoadingPhrases: string[] = [];

  calculate(): void {
    this.pickedHasDuodecimos = this.hasDuodecimos;
    this.resetResults();
    this.isLoading = true;
    
    let phraseIndex = 0;
    this.displayedLoadingPhrases = [this.loadingPhrases[0]];
    
    // Cycle through loading phrases
    this.loadingTimer = window.setInterval(() => {
      phraseIndex++;
      if (phraseIndex < this.loadingPhrases.length) {
        this.displayedLoadingPhrases.push(this.loadingPhrases[phraseIndex]);
      }
    }, 200);
  
    setTimeout(() => {
      this.clearLoadingTimer();
      
      this.pickedIHTPercentage = this.IhtPercentage;
      this.annualDailyMealAllowance = this.calculateAnnualMealAllowance();
      this.monthlyMealAllowance = this.calculateMonthlyMealAllowance();

      // Ambos os caminhos geram ProposalData[]
      let proposals: ProposalData[] =
        this.calculateBy === 'annualCost'
          ? this.calculateByAnnualCost()
          : this.calculateByNetSalaryTarget();

      if (this.calculateBy === 'targetNetSalary') {
        proposals = proposals.map((p) => this.recalculateAnnualCost(p));
      }

      // Conversão unificada para SimulationResult[]
      this.liquidSalarySimulations = proposals.map((proposal) =>
        this.mapToSimulationResult(proposal),
      );

      this.isLoading = false;
    }, 1000);
  }

  // Novo método
  private recalculateAnnualCost(proposal: ProposalData): ProposalData {
    const monthlyGross = proposal.monthlyBaseSalary + proposal.monthlyIHT;
    const correctAnnualCost = this.calculateAnnualCostToCompany(
      monthlyGross,
      proposal.monthlyBenefits,
    );

    return {
      ...proposal,
      annualCost: correctAnnualCost,
    };
  }
  private calculateByAnnualCost(): ProposalData[] {
    const monthsToMultiply = this.getMonthsMultiplier();
    const tsuFactor = this.tsu / 100;
    const budget = this.annualCost - this.annualDailyMealAllowance;
    const proposals: ProposalData[] = [];

    for (
      let percentage = 0;
      percentage <= this.maxFlexBenefitsPercentage;
      percentage += this.flexBenefitsStep
    ) {
      const normalizedPercentage = percentage / 100;
      const factor =
        (1 - normalizedPercentage) * (1 + tsuFactor) + normalizedPercentage;
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
        socialSecurityRate: this.segSocialRegimeGeral / 100,
      });

      // Cálculo Min: Benefits sujeitos a IRS mas não SS
      const calculationMin = this.irsService.calculate({
        grossSalary: monthlyGross + monthlyValueToBenefits,
        maritalStatus: mappedMaritalStatus,
        location: this.location,
        dependents: Number(this.dependents) || 0,
        socialSecurityRate: 0,
      });

      const ssForMin = this.irsService.calculate({
        grossSalary: monthlyGross,
        maritalStatus: mappedMaritalStatus,
        location: this.location,
        dependents: Number(this.dependents) || 0,
        socialSecurityRate: this.segSocialRegimeGeral / 100,
      }).socialSecurity;

      const netSalaryMin =
        monthlyGross +
        monthlyValueToBenefits -
        calculationMin.irsWithheld -
        ssForMin;

      const custoAnualParaEmpresa = this.calculateAnnualCostToCompany(
        monthlyGross,
        monthlyValueToBenefits,
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
        totalNetMax: this.roundToCents(
          calculationMax.netSalary +
            this.monthlyMealAllowance +
            monthlyValueToBenefits,
        ),
        totalNetMin: this.roundToCents(
          netSalaryMin + this.monthlyMealAllowance,
        ),
        annualCost: this.roundToCents(custoAnualParaEmpresa),
      });
    }

    return proposals;
  }

  private calculateByNetSalaryTarget(): ProposalData[] {
    const mappedMaritalStatus = this.getMappedMaritalStatus();

    console.log('=== DEBUG REVERSE ===');
    console.log('Target Net:', this.targetNetSalary);
    console.log('Meal Daily:', this.subsRefeicaoDaily);
    console.log('Meal Days:', this.subsRefeicaoDays);
    console.log('Meal Months:', this.subsRefeicaoMonths);
    console.log('Annual Meal:', this.annualDailyMealAllowance);
    console.log('Annual Cost:', this.annualCost);
    //iht
    console.log('IHT Percentage:', this.IhtPercentage);
    console.log('IHT:', this.pickedIHTPercentage);
    //tsu
    console.log('TSU:', this.tsu);
    //ss
    console.log('Social Security:', this.segSocialRegimeGeral);
    console.log('=====================');

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
      ssRate: this.segSocialRegimeGeral / 100,
    });

    // Retorna diretamente as proposals do serviço
    // (assumindo que já vêm no formato ProposalData)
    return proposals;
  }

  private getMappedMaritalStatus(): MaritalStatus {
    if (this.maritalStatus === 'married') {
      return this.dependents === 1
        ? 'married_one_holder'
        : 'married_two_holders';
    }
    return 'single';
  }

  /**
   * Método central que converte ProposalData para SimulationResult
   * Todos os cálculos passam por aqui
   */
  private mapToSimulationResult(proposal: ProposalData): SimulationResult {
    let baseSalary = Number(proposal.monthlyBaseSalary.toFixed(2));
    let iht = Number(proposal.monthlyIHT.toFixed(2));
    const totalIrs = Number(proposal.irs.toFixed(2));
    const socialSecurityMax = Number(proposal.socialSecurityMax.toFixed(2));
    const monthlyBenefits = Number(proposal.monthlyBenefits.toFixed(2));

    let duodecimoSF = 0;
    let duodecimoSN = 0;
    let irsSF = 0;
    let irsSN = 0;
    let irsBase = totalIrs;

    if (this.hasDuodecimos) {
      // Deconstruct the values into 14-month basis
      // The proposal values are currently (Annual / 12), so we convert back to (Annual / 14)
      const baseSalary14 = (proposal.monthlyBaseSalary * 12) / 14;
      const iht14 = (proposal.monthlyIHT * 12) / 14;

      duodecimoSF = baseSalary14 / 12;
      duodecimoSN = baseSalary14 / 12;

      // Recalculate IRS just for the base part (14 months perspective)
      // We assume IHT is also part of the base tax calculation
      const mappedMaritalStatus = this.getMappedMaritalStatus();
      const calculationBase = this.irsService.calculate({
        grossSalary: baseSalary14 + iht14,
        maritalStatus: mappedMaritalStatus,
        location: this.location,
        dependents: Number(this.dependents) || 0,
        socialSecurityRate: this.segSocialRegimeGeral / 100,
      });

      irsBase = Number(calculationBase.irsWithheld.toFixed(2));
      const irsRemanescente = Math.max(0, totalIrs - irsBase);
      
      // Split remaining IRS between the two duodecimos
      irsSF = Number((irsRemanescente / 2).toFixed(2));
      irsSN = Number((irsRemanescente / 2).toFixed(2));
      
      // Update displayed base values to be the 14-month values
      baseSalary = Number(baseSalary14.toFixed(2));
      iht = Number(iht14.toFixed(2));
    }

    return {
      flexBenefitsPercentage: proposal.flexBenefitsPercentage,
      salaryBase: baseSalary,
      IHT: iht,
      duodecimoSF: Number(duodecimoSF.toFixed(2)),
      duodecimoSN: Number(duodecimoSN.toFixed(2)),
      irsSF,
      irsSN,
      irs: irsBase,
      netSalary: Number(
        (
          proposal.monthlyBaseSalary + 
          proposal.monthlyIHT - 
          totalIrs - 
          socialSecurityMax
        ).toFixed(2),
      ),
      monthlyMealAllowance: Number(proposal.monthlyMealAllowance),
      monthlyValueToBenefits: monthlyBenefits,
      totalMax: Number(proposal.totalNetMax.toFixed(2)),
      totalMin: Number(proposal.totalNetMin.toFixed(2)),
      salaryBaseAndIHT: baseSalary + iht,
      rendimento: baseSalary + iht + monthlyBenefits,
      custoAnualParaEmpresa: Number(proposal.annualCost.toFixed(2)),
    };
  }

  private calculateAnnualCostToCompany(
    grossSalary: number,
    valueToBenefits: number,
  ): number {
    const monthsToMultiply = this.getMonthsMultiplier();
    const annualGross = grossSalary * monthsToMultiply;
    const annualBenefits = valueToBenefits * 12;
    const tsuFactor = 1 + this.tsu / 100;

    console.log('=== DEBUG CUSTO ===');
    console.log('Gross Mensal:', grossSalary);
    console.log('Benefícios Mensais:', valueToBenefits);
    console.log('Meses (Gross):', monthsToMultiply);
    console.log('Gross Anual:', annualGross);
    console.log('TSU Factor:', tsuFactor);
    console.log('TSU Amount:', annualGross * (tsuFactor - 1));
    console.log('Benefícios Anuais:', annualBenefits);
    console.log('Subsídio Anual:', this.annualDailyMealAllowance);

    const total =
      annualGross * tsuFactor + annualBenefits + this.annualDailyMealAllowance;
    console.log('TOTAL:', total);
    console.log('==================');

    return total;
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
    console.log('=== DEBUG MEAL ===');
    console.log('Daily:', this.subsRefeicaoDaily);
    console.log('Days:', this.subsRefeicaoDays);
    console.log('Months:', this.subsRefeicaoMonths);
    console.log(
      'Result:',
      this.subsRefeicaoDaily * this.subsRefeicaoDays * this.subsRefeicaoMonths,
    );
    console.log('==================');
    return (
      this.subsRefeicaoDaily * this.subsRefeicaoDays * this.subsRefeicaoMonths
    );
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
