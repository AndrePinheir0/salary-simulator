import { AfterViewChecked, Component, ElementRef, inject, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DfAccordionComponent, DfInputSelectComponent, DfInputTextComponent, DFModalV2Service } from '@doutorfinancas/ui';
import { firstValueFrom } from 'rxjs';
import { ProposalDetailComponent } from '../proposal-detail/proposal-detail.component';
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
export class SimulatorComponent implements OnDestroy, AfterViewChecked {
  @ViewChild('proposalTableRef') proposalTableRef?: ElementRef<HTMLElement>;
  private shouldScrollToResults = false;

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
  customFlexBenefitsPercentage: number | string | null = null;
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
  subsRefeicaoDaily = 10.2;
  subsRefeicaoDays = 22;
  subsRefeicaoMonths = 11;
  tsu = 23.75;
  segSocialRegimeGeral = 11;
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
    'A calcular...',
  ];
  private readonly irsService = inject(CalculateNetSalaryService);
  private readonly netSalaryEndpoint = inject(NetSalaryEndpointService);
  private readonly modalService = inject(DFModalV2Service);
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

  openDetail(item: SimulationResult): void {
    this.modalService.open({
      content: ProposalDetailComponent,
      componentData: item,
      title: 'Detalhes da proposta',
      hideCloseButton: false,
      
      size: 'xl',
    } as any);
  }

  calculate(): void {
    this.pickedHasDuodecimos = this.hasDuodecimos;
    this.resetResults();
    this.netSalaryEndpoint.clearCache();
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
        this.shouldScrollToResults = this.liquidSalarySimulations.length > 0;
      } catch (error) {
        console.error('Error calculating salary simulation:', error);
        this.resetResults();
      }

      this.isLoading = false;
    }, 1000);
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToResults && this.proposalTableRef) {
      this.shouldScrollToResults = false;
      this.proposalTableRef.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
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
  /**
   * Percentagens de benefícios flexíveis a simular. Se o utilizador introduziu
   * uma percentagem personalizada (0–100), devolve apenas essa; caso contrário
   * devolve o intervalo 0 → maxFlexBenefitsPercentage com o passo configurado.
   */
  private getFlexBenefitsPercentages(): number[] {
    // O input pode ligar como string (campo vazio = '' ou null); normaliza.
    const raw = this.customFlexBenefitsPercentage as number | string | null;
    const custom =
      raw === null || raw === '' || raw === undefined ? null : Number(raw);
    if (custom !== null && !Number.isNaN(custom) && custom >= 0 && custom <= 100) {
      return [custom];
    }

    const percentages: number[] = [];
    for (
      let percentage = 0;
      percentage <= this.maxFlexBenefitsPercentage;
      percentage += this.flexBenefitsStep
    ) {
      percentages.push(percentage);
    }
    return percentages;
  }

  private async calculateByAnnualCost(): Promise<ProposalData[]> {
    const monthsToMultiply = this.getMonthsMultiplier();
    const tsuFactor = this.tsu / 100;
    const budget = this.annualCost - this.annualDailyMealAllowance;
    const proposals: Array<Promise<ProposalData>> = [];
    const mappedMaritalStatus = this.getMappedMaritalStatus();

    for (const percentage of this.getFlexBenefitsPercentages()) {
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
    const mappedMaritalStatus = this.getMappedMaritalStatus();
    const proposals: Array<Promise<ProposalData>> = [];

    for (const percentage of this.getFlexBenefitsPercentages()) {
      // O bruto introduzido é o rendimento total; cada linha desvia % para
      // benefícios flexíveis, reduzindo o salário em cash na mesma proporção.
      const normalizedPercentage = percentage / 100;
      const monthlyBenefits = this.grossSalary * normalizedPercentage;
      const monthlyGross = this.grossSalary * (1 - normalizedPercentage);

      proposals.push(
        this.calculateEndpointProposal({
          percentage,
          monthlyGross,
          monthlyBaseSalary: monthlyGross,
          monthlyIHT: 0,
          monthlyBenefits,
          annualCost: this.calculateAnnualCostToCompany(monthlyGross, monthlyBenefits),
          maritalStatus: mappedMaritalStatus,
        }),
      );
    }

    return Promise.all(proposals);
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

    for (const percentage of this.getFlexBenefitsPercentages()) {
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
    // O líquido alvo a atingir é apenas salário+IHT (refeição e benefícios
    // entram à parte no totalMax/Min). Como o servidor devolve totalNetMax
    // a incluir refeição+benefícios, comparamos contra esse valor ajustado.
    const targetForComparison =
      this.targetNetSalary + this.monthlyMealAllowance;

    // Estimativa inicial: assume taxa efetiva combinada (~35%) sobre o bruto
    // anual para chegar a um custo anual de partida.
    let annualCost =
      ((this.targetNetSalary * monthsToMultiply) / 0.65) * (1 + tsuFactor) +
      this.annualDailyMealAllowance;

    let prevAnnualCost: number | null = null;
    let prevNet: number | null = null;
    let proposalInput!: ReturnType<typeof this.buildProposalInputFromAnnualCost>;
    let maxResult!: NetSalaryCalculationResult;

    const maxIterations = 5;
    const tolerance = 0.5; // 0,50€ de líquido mensal

    for (let i = 0; i < maxIterations; i++) {
      const budget = annualCost - this.annualDailyMealAllowance;
      proposalInput = this.buildProposalInputFromAnnualCost(
        budget,
        percentage,
        monthsToMultiply,
        tsuFactor,
      );

      maxResult = await this.calculateEndpointResult(
        this.buildEndpointRequest(proposalInput.monthlyGross, maritalStatus, {
          otherExemptIncome: proposalInput.monthlyBenefits,
        }),
      );

      // totalNetMax do servidor inclui refeição + benefícios isentos.
      // Para comparar com targetNetSalary (líquido de salário+IHT), subtrai
      // benefícios mas mantém refeição (que já está no targetForComparison).
      const netForCompare =
        maxResult.netSalary - proposalInput.monthlyBenefits;
      const delta = targetForComparison - netForCompare;

      if (Math.abs(delta) < tolerance) {
        break;
      }

      // Newton-Raphson empírico: usa o declive entre as duas últimas iterações.
      // Primeira iteração não tem histórico, usa declive teórico aproximado.
      let slope: number;
      if (prevAnnualCost !== null && prevNet !== null) {
        const denom = annualCost - prevAnnualCost;
        slope = denom !== 0 ? (netForCompare - prevNet) / denom : 0.05;
      } else {
        // declive teórico: 1€ de custo anual ≈ 0.05€ de líquido mensal
        // (descontados SS empresa, SS trabalhador, IRS, ÷ meses)
        slope = 0.65 / (monthsToMultiply * (1 + tsuFactor));
      }

      if (!Number.isFinite(slope) || slope <= 0) {
        slope = 0.05;
      }

      prevAnnualCost = annualCost;
      prevNet = netForCompare;
      annualCost = Math.max(0, annualCost + delta / slope);
    }

    return this.calculateEndpointProposalFromResults({
      percentage,
      monthlyGross: proposalInput.monthlyGross,
      monthlyBaseSalary: proposalInput.monthlyBaseSalary,
      monthlyIHT: proposalInput.monthlyIHT,
      monthlyBenefits: proposalInput.monthlyBenefits,
      annualCost: proposalInput.annualCost,
      maritalStatus,
      maxResult,
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
    const monthlyBenefits = Number(proposal.monthlyBenefits.toFixed(2));

    let duodecimoSF = 0;
    let duodecimoSN = 0;
    let irsSF = 0;
    let irsSN = 0;
    let irsBase = totalIrs;

    if (this.hasDuodecimos) {
      // A base e o IHT mantêm-se; os duodécimos são os subsídios diluídos a 1/12.
      // Cada subsídio (férias e Natal) vale um mês de retribuição (base + IHT).
      const monthlyGross = baseSalary + iht;
      duodecimoSF = monthlyGross / 12;
      duodecimoSN = monthlyGross / 12;

      // IRS da base (sem subsídios); o excedente de IRS retido por causa dos
      // duodécimos é repartido pelos dois subsídios.
      const mappedMaritalStatus = this.getMappedMaritalStatus();
      const calculationBase = this.irsService.calculate({
        grossSalary: monthlyGross,
        maritalStatus: mappedMaritalStatus,
        location: this.location,
        dependents: Number(this.dependents) || 0,
        socialSecurityRate: this.segSocialRegimeGeral / 100,
      });

      irsBase = Number(calculationBase.irsWithheld.toFixed(2));
      const irsRemanescente = Math.max(0, totalIrs - irsBase);

      irsSF = Number((irsRemanescente / 2).toFixed(2));
      irsSN = Number((irsRemanescente / 2).toFixed(2));
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
          proposal.totalNetMax -
          proposal.monthlyBenefits -
          proposal.monthlyMealAllowance
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
    const tsuFactor = 1 + this.tsu / 100;

    // Base sujeita a SS: salário+IHT + compensação extraordinária + outros rendimentos IRS+SS
    const monthlySsBase =
      grossSalary +
      (Number(this.extraordinaryCompensation) || 0) +
      (Number(this.otherIrsSsIncome) || 0);
    const annualSsBase = monthlySsBase * monthsToMultiply;

    // Rendimentos isentos de SS: flex benefits + outros rendimentos só IRS + isentos (× 12)
    const monthlyNonSs =
      valueToBenefits +
      (Number(this.otherIrsIncome) || 0) +
      (Number(this.otherExemptIncome) || 0);
    const annualNonSs = monthlyNonSs * 12;

    return annualSsBase * tsuFactor + annualNonSs + this.annualDailyMealAllowance;
  }

  // Helper methods
  private getMonthsMultiplier(): number {
    // Sempre 14 (12 vencimentos + 2 subsídios). Os duodécimos só diluem os
    // subsídios pelos meses; não alteram a remuneração anual nem o custo da empresa.
    return 14;
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
    return this.subsRefeicaoDaily * this.subsRefeicaoDays * this.subsRefeicaoMonths;
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
