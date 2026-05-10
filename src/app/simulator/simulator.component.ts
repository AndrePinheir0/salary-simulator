import { Component, inject, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DfAccordionComponent, DfInputSelectComponent, DfInputTextComponent } from '@doutorfinancas/ui';
import { firstValueFrom } from 'rxjs';
import {
  CalculateNetSalaryService,
  MaritalStatus,
} from '../services/calculate-net-salary-service.service';
import {
  EndpointActivityStartYear,
  EndpointBooleanString,
  EndpointMealCardType,
  EndpointTwelfths,
  NetSalaryCalculationResult,
  NetSalaryEndpointRequest,
  NetSalaryEndpointService,
} from '../services/net-salary-endpoint.service';
import { CurrencyPtPipe } from '../pipes/currency-pt.pipe';
import { DfCurrencyMaskDirective } from '../directives/df-currency-mask.directive';
import { SimulationResult } from '../models/simulation.model';
import irsData from '../data/irs_2026_continente.json';

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

interface SelectOption<T = unknown> {
  id: T;
  title: string;
  dataOption?: {
    icon?: string;
    disabled?: boolean;
    showIconRight?: boolean;
  };
}

type CalculateBy = 'annualCost' | 'targetNetSalary' | 'grossSalary';
type MaritalStatusOption = MaritalStatus;
type LocationOption = 'continente' | 'acores' | 'madeira';

@Component({
  selector: 'app-simulator',
  standalone: true,
  imports: [FormsModule, DfAccordionComponent, DfInputSelectComponent, DfInputTextComponent, CurrencyPtPipe, DfCurrencyMaskDirective],
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
  pickedHasDuodecimos = false;
  includeMealAllowance = true;
  IhtPercentage = 25;
  calculateBy: CalculateBy = 'annualCost';
  annualCost = 30000;
  grossSalary = 1500;
  targetNetSalary = 2000;
  maritalStatus: MaritalStatusOption = 'single';
  location: LocationOption = 'continente';
  dependents = 0;
  disabilityAbove60 = false;
  spouseHasDisability = false;
  dependentsHaveDisability = false;
  dependentsWithDisability = 0;
  extraordinaryCompensation = 0;
  otherIrsSsIncome = 0;
  otherIrsIncome = 0;
  otherExemptIncome = 0;
  socialSecurityRate = 11;
  twelfths: EndpointTwelfths = '';
  mealCardType: EndpointMealCardType = 'voucher_card';
  year = 2026;
  month = '';
  applyIrsJovem: EndpointBooleanString = 'false';
  activityStartYear: EndpointActivityStartYear = '';

  readonly calculateByOptions: SelectOption<CalculateBy>[] = [
    { id: 'annualCost', title: 'Custo anual para empresa' },
    { id: 'targetNetSalary', title: 'Salário líquido pretendido' },
    { id: 'grossSalary', title: 'Salário bruto' },
  ];

  readonly locationOptions: SelectOption<LocationOption>[] = [
    { id: 'continente', title: 'Portugal Continental' },
    { id: 'acores', title: 'Açores' },
    { id: 'madeira', title: 'Madeira' },
  ];

  readonly maritalStatusOptions: SelectOption<MaritalStatusOption>[] = [
    { id: 'single', title: 'Não casado' },
    { id: 'married_one_holder', title: 'Casado, único titular' },
    { id: 'married_two_holders', title: 'Casado, dois titulares' },
  ];

  readonly ihtPercentageOptions: SelectOption<number>[] = [30, 25, 20, 15, 10, 5, 0]
    .map((value) => ({ id: value, title: `${value}%` }));

  readonly twelfthsOptions: SelectOption<EndpointTwelfths>[] = [
    { id: '', title: 'Sem duodécimos' },
    { id: '1x50%', title: '50% de um subsídio' },
    { id: '2x50%', title: '50% dos dois subsídios' },
    { id: '2x100%', title: 'Dois subsídios por inteiro' },
  ];

  readonly mealCardTypeOptions: SelectOption<EndpointMealCardType>[] = [
    { id: 'not_available', title: 'Não disponível' },
    { id: 'voucher_card', title: 'Vale/cartão refeição' },
    { id: 'cash', title: 'Dinheiro' },
  ];

  readonly monthOptions: SelectOption<string>[] = [
    { id: '', title: 'Sem mês' },
    { id: 'default', title: 'Default' },
    { id: '01', title: 'Janeiro' },
    { id: '02', title: 'Fevereiro' },
    { id: '03', title: 'Março' },
    { id: '04', title: 'Abril' },
    { id: '05', title: 'Maio' },
    { id: '06', title: 'Junho' },
    { id: '07', title: 'Julho' },
    { id: '08', title: 'Agosto' },
    { id: '09', title: 'Setembro' },
    { id: '10', title: 'Outubro' },
    { id: '11', title: 'Novembro' },
    { id: '12', title: 'Dezembro' },
  ];

  readonly booleanOptions: SelectOption<EndpointBooleanString>[] = [
    { id: 'false', title: 'Não' },
    { id: 'true', title: 'Sim' },
  ];

  readonly activityStartYearOptions: SelectOption<EndpointActivityStartYear>[] = [
    { id: '', title: 'Selecionar' },
    { id: '1', title: '1.º ano' },
    { id: '3', title: '3.º ano' },
    { id: '4', title: '4.º ano' },
    { id: '5', title: '5.º ano' },
  ];

  // Constants
  subsRefeicaoDaily = 10.46;
  subsRefeicaoDays = 22;
  subsRefeicaoMonths = 11;
  tsu = 23.75;
  segSocialRegimeGeral = 11;
  readonly maxFlexBenefitsPercentage = 30;
  readonly flexBenefitsStep = 1;

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
  private readonly netSalaryEndpoint = inject(NetSalaryEndpointService);
  private loadingTimer?: number;

  constructor() {
    this.irsService.setDataset(irsData as any);
  }

  ngOnDestroy(): void {
    this.clearLoadingTimer();
  }

  displayedLoadingPhrases: string[] = [];

  get hasDuodecimos(): boolean {
    return this.twelfths !== '';
  }

  set hasDuodecimos(value: boolean) {
    this.twelfths = value ? '2x100%' : '';
  }

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
  
    setTimeout(async () => {
      this.clearLoadingTimer();

      try {
        this.pickedIHTPercentage = this.IhtPercentage;
        this.annualDailyMealAllowance = this.calculateAnnualMealAllowance();
        this.monthlyMealAllowance = this.calculateMonthlyMealAllowance();

        // Ambos os caminhos geram ProposalData[]
        let proposals: ProposalData[] =
          this.calculateBy === 'annualCost'
            ? await this.calculateByAnnualCost()
            : this.calculateBy === 'targetNetSalary'
              ? await this.calculateByNetSalaryTarget()
              : await this.calculateByGrossSalary();

        // Conversão unificada para SimulationResult[]
        this.liquidSalarySimulations = proposals.map((proposal) =>
          this.mapToSimulationResult(proposal),
        );
      } catch (error) {
        console.error('Error calculating salary simulation:', error);
        this.resetResults();
      }

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
  private async calculateByAnnualCost(): Promise<ProposalData[]> {
    const monthsToMultiply = this.getMonthsMultiplier();
    const tsuFactor = this.tsu / 100;
    const budget = this.annualCost - this.annualDailyMealAllowance;
    const proposals: Array<Promise<ProposalData>> = [];
    const mappedMaritalStatus = this.getMappedMaritalStatus();

    for (
      let percentage = 0;
      percentage <= this.maxFlexBenefitsPercentage;
      percentage += this.flexBenefitsStep
    ) {
      proposals.push(
        this.buildEndpointProposalFromAnnualCost(
          budget,
          percentage,
          monthsToMultiply,
          tsuFactor,
          mappedMaritalStatus,
        ),
      );
    }

    return Promise.all(proposals);
  }

  private calculateByGrossSalary(): Promise<ProposalData[]> {
    return this.calculateEndpointProposal({
      percentage: 0,
      monthlyGross: this.grossSalary,
      monthlyBaseSalary: this.grossSalary,
      monthlyIHT: 0,
      monthlyBenefits: 0,
      annualCost: this.calculateAnnualCostToCompany(this.grossSalary, 0),
      maritalStatus: this.getMappedMaritalStatus(),
    }).then((proposal) => [proposal]);
  }

  private buildEndpointProposalFromAnnualCost(
    budget: number,
    percentage: number,
    monthsToMultiply: number,
    tsuFactor: number,
    maritalStatus: MaritalStatus,
  ): Promise<ProposalData> {
    const proposalInput = this.buildProposalInputFromAnnualCost(
      budget,
      percentage,
      monthsToMultiply,
      tsuFactor,
    );

    return this.calculateEndpointProposal({
      percentage,
      ...proposalInput,
      maritalStatus,
    });
  }

  private buildProposalInputFromAnnualCost(
    budget: number,
    percentage: number,
    monthsToMultiply: number,
    tsuFactor: number,
  ): {
    monthlyGross: number;
    monthlyBaseSalary: number;
    monthlyIHT: number;
    monthlyBenefits: number;
    annualCost: number;
  } {
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

    const custoAnualParaEmpresa = this.calculateAnnualCostToCompany(
      monthlyGross,
      monthlyValueToBenefits,
    );

    return {
      monthlyGross,
      monthlyBaseSalary: valueWithoutIHT,
      monthlyIHT: IHT,
      monthlyBenefits: monthlyValueToBenefits,
      annualCost: custoAnualParaEmpresa,
    };
  }

  private async calculateEndpointProposal(input: {
    percentage: number;
    monthlyGross: number;
    monthlyBaseSalary: number;
    monthlyIHT: number;
    monthlyBenefits: number;
    annualCost: number;
    maritalStatus: MaritalStatus;
  }): Promise<ProposalData> {
    const [maxResult, minResult] = await Promise.all([
      this.calculateEndpointResult(
        this.buildEndpointRequest(input.monthlyGross, input.maritalStatus, {
          otherExemptIncome: input.monthlyBenefits,
        }),
      ),
      this.calculateEndpointResult(
        this.buildEndpointRequest(input.monthlyGross, input.maritalStatus, {
          otherIrsIncome: input.monthlyBenefits,
        }),
      ),
    ]);

    return {
      flexBenefitsPercentage: input.percentage,
      monthlyBaseSalary: this.roundToCents(input.monthlyBaseSalary),
      monthlyIHT: this.roundToCents(input.monthlyIHT),
      monthlyBenefits: this.roundToCents(input.monthlyBenefits),
      monthlyMealAllowance: this.monthlyMealAllowance,
      irs: this.roundToCents(maxResult.irsWithheld),
      socialSecurityMax: this.roundToCents(maxResult.socialSecurity),
      socialSecurityMin: this.roundToCents(minResult.socialSecurity),
      totalNetMax: this.roundToCents(maxResult.netSalary),
      totalNetMin: this.roundToCents(minResult.netSalary),
      annualCost: this.roundToCents(input.annualCost),
    };
  }

  private async calculateEndpointProposalFromResults(input: {
    percentage: number;
    monthlyGross: number;
    monthlyBaseSalary: number;
    monthlyIHT: number;
    monthlyBenefits: number;
    annualCost: number;
    maritalStatus: MaritalStatus;
    maxResult: NetSalaryCalculationResult;
  }): Promise<ProposalData> {
    const minResult = await this.calculateEndpointResult(
      this.buildEndpointRequest(input.monthlyGross, input.maritalStatus, {
        otherIrsIncome: input.monthlyBenefits,
      }),
    );

    return {
      flexBenefitsPercentage: input.percentage,
      monthlyBaseSalary: this.roundToCents(input.monthlyBaseSalary),
      monthlyIHT: this.roundToCents(input.monthlyIHT),
      monthlyBenefits: this.roundToCents(input.monthlyBenefits),
      monthlyMealAllowance: this.monthlyMealAllowance,
      irs: this.roundToCents(input.maxResult.irsWithheld),
      socialSecurityMax: this.roundToCents(input.maxResult.socialSecurity),
      socialSecurityMin: this.roundToCents(minResult.socialSecurity),
      totalNetMax: this.roundToCents(input.maxResult.netSalary),
      totalNetMin: this.roundToCents(minResult.netSalary),
      annualCost: this.roundToCents(input.annualCost),
    };
  }

  private async calculateEndpointResult(
    request: NetSalaryEndpointRequest,
  ): Promise<NetSalaryCalculationResult> {
    const response = await firstValueFrom(
      this.netSalaryEndpoint.calculateNetSalary(request),
    );

    return this.netSalaryEndpoint.extractCalculationResult(response);
  }

  private buildEndpointRequest(
    monthlyGross: number,
    maritalStatus: MaritalStatus,
    income: {
      otherExemptIncome?: number;
      otherIrsIncome?: number;
      otherIrsSsIncome?: number;
    } = {},
  ): NetSalaryEndpointRequest {
    const hasMealAllowance = this.monthlyMealAllowance > 0;

    return {
      location: this.location,
      marital_status: this.toEndpointMaritalStatus(maritalStatus),
      number_of_dependents: Number(this.dependents) || 0,
      disability_above_60: this.disabilityAbove60,
      spouse_has_disability: this.spouseHasDisability,
      dependents_have_disability: this.dependentsHaveDisability,
      number_of_dependents_with_disability:
        Number(this.dependentsWithDisability) || 0,
      base_salary: monthlyGross,
      extraordinary_compensation: Number(this.extraordinaryCompensation) || 0,
      other_irs_ss_income:
        (Number(this.otherIrsSsIncome) || 0) + (income.otherIrsSsIncome ?? 0),
      other_irs_income:
        (Number(this.otherIrsIncome) || 0) + (income.otherIrsIncome ?? 0),
      other_exempt_income:
        (Number(this.otherExemptIncome) || 0) + (income.otherExemptIncome ?? 0),
      social_security_rate: Number(this.socialSecurityRate) || 0,
      twelfths: this.twelfths,
      meal_card_type: hasMealAllowance ? this.mealCardType : 'not_available',
      daily_meal_card_value: hasMealAllowance ? this.subsRefeicaoDaily : 0,
      meal_card_days: hasMealAllowance ? this.subsRefeicaoDays : 0,
      year: this.year,
      month: this.month,
      apply_irs_jovem: this.applyIrsJovem,
      activity_start_year: this.activityStartYear,
    };
  }

  private toEndpointMaritalStatus(status: MaritalStatus): 'SOL' | 'CAS1' | 'CAS2' {
    if (status === 'married_one_holder') return 'CAS1';
    if (status === 'married_two_holders') return 'CAS2';
    return 'SOL';
  }

  private async calculateByNetSalaryTarget(): Promise<ProposalData[]> {
    const mappedMaritalStatus = this.getMappedMaritalStatus();
    const monthsToMultiply = this.getMonthsMultiplier();
    const tsuFactor = this.tsu / 100;
    const proposals: Array<Promise<ProposalData>> = [];

    for (let percentage = 0; percentage <= this.maxFlexBenefitsPercentage; percentage += 5) {
      proposals.push(
        this.solveEndpointProposalForTargetNet(
          percentage,
          monthsToMultiply,
          tsuFactor,
          mappedMaritalStatus,
        ),
      );
    }

    return Promise.all(proposals);
  }

  private async solveEndpointProposalForTargetNet(
    percentage: number,
    monthsToMultiply: number,
    tsuFactor: number,
    maritalStatus: MaritalStatus,
  ): Promise<ProposalData> {
    let low = 0;
    let high = 1000000;
    let bestInput: {
      monthlyGross: number;
      monthlyBaseSalary: number;
      monthlyIHT: number;
      monthlyBenefits: number;
      annualCost: number;
    } | null = null;
    let bestMaxResult: NetSalaryCalculationResult | null = null;

    for (let i = 0; i < 16; i++) {
      const annualCost = (low + high) / 2;
      const budget = annualCost - this.annualDailyMealAllowance;
      const proposalInput = this.buildProposalInputFromAnnualCost(
        budget,
        percentage,
        monthsToMultiply,
        tsuFactor,
      );
      const maxResult = await this.calculateEndpointResult(
        this.buildEndpointRequest(proposalInput.monthlyGross, maritalStatus, {
          otherExemptIncome: proposalInput.monthlyBenefits,
        }),
      );

      if (maxResult.netSalary < this.targetNetSalary) {
        low = annualCost;
      } else {
        high = annualCost;
      }

      bestInput = proposalInput;
      bestMaxResult = maxResult;
    }

    return this.calculateEndpointProposalFromResults({
      percentage,
      monthlyGross: bestInput!.monthlyGross,
      monthlyBaseSalary: bestInput!.monthlyBaseSalary,
      monthlyIHT: bestInput!.monthlyIHT,
      monthlyBenefits: bestInput!.monthlyBenefits,
      annualCost: bestInput!.annualCost,
      maritalStatus,
      maxResult: bestMaxResult!,
    });
  }

  private getMappedMaritalStatus(): MaritalStatus {
    return this.maritalStatus;
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
    return this.includeMealAllowance && this.mealCardType !== 'not_available'
      ? this.subsRefeicaoDaily * this.subsRefeicaoDays
      : 0;
  }

  private calculateAnnualMealAllowance(): number {
    if (!this.includeMealAllowance || this.mealCardType === 'not_available') return 0;

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
    return value;
    // return Number((Math.ceil(value * 100) / 100).toFixed(2));
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
