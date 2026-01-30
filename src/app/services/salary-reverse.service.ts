import { Injectable, inject } from '@angular/core';
import { CalculateNetSalaryService, MaritalStatus, LocationPT } from './calculate-net-salary-service.service';

export interface ReverseCalculationInput {
  targetNetSalary: number; // monthly
  location: LocationPT;
  maritalStatus: MaritalStatus;
  dependents: number;
  hasDuodecimos: boolean;
  mealAllowanceDaily: number;
  mealAllowanceDays: number;
  mealAllowanceMonths: number;
  ihtPercentage: number;
  tsu: number;
  ssRate: number;
}

export interface CalculationProposal {
  flexBenefitsPercentage: number;
  annualCost: number;
  monthlyBaseSalary: number;
  monthlyIHT: number;
  monthlyBenefits: number;
  monthlyMealAllowance: number;
  irs: number;
  socialSecurityMax: number;
  socialSecurityMin: number;
  totalNetMin: number;
  totalNetMax: number;
}

@Injectable({
  providedIn: 'root'
})
export class SalaryReverseService {
  private irsService = inject(CalculateNetSalaryService);

  getProposals(input: ReverseCalculationInput): CalculationProposal[] {
    const proposals: CalculationProposal[] = [];

    for (let pct = 0; pct <= 30; pct += 5) {
      let flexPct = pct == 0 ? 0 : (pct / 100);
      proposals.push(this.solveForAnnualCost(input, flexPct));
    }

    return proposals;
  }

  private solveForAnnualCost(input: ReverseCalculationInput, flexPct: number): CalculationProposal {
    // Binary search to find annualCost
    let low = 0;
    let high = 1000000; // 1 million annual cost
    let mid = 0;
    let bestResult: CalculationProposal | null = null;
    
    // Tolerance of 0.01 in net salary
    for (let i = 0; i < 50; i++) { // 50 iterations is plenty for binary search to sub-cent precision
      mid = (low + high) / 2;
      const result = this.calculateOutputs(input, mid, flexPct);
      
      if (result.totalNetMax < input.targetNetSalary) {
        low = mid;
      } else {
        high = mid;
      }
      bestResult = result;
    }

    return bestResult!;
  }

  private calculateOutputs(input: ReverseCalculationInput, annualCost: number, flexPct: number): CalculationProposal {
    const monthsToMultiply = input.hasDuodecimos ? 12 : 14;
    const annualDailyMealAllowance = input.mealAllowanceDaily * input.mealAllowanceDays * input.mealAllowanceMonths;
    const monthlyMealAllowance = input.mealAllowanceDaily * input.mealAllowanceDays;

    const valueSubjectToTsu = Math.max(0, annualCost - annualDailyMealAllowance);
    const totalValueAfterTsu = valueSubjectToTsu / (1 + input.tsu / 100);
    const monthlyValueToDistribute = totalValueAfterTsu / monthsToMultiply;

    const monthlyValueToBenefits = (totalValueAfterTsu * flexPct) / 12;
    const monthlyValueWithoutBenefits = monthlyValueToDistribute - monthlyValueToBenefits;

    const monthlyIHT = (monthlyValueWithoutBenefits * input.ihtPercentage) / 100;
    const monthlyBaseSalary = monthlyValueWithoutBenefits - monthlyIHT;

    const grossSalary = monthlyBaseSalary + monthlyIHT;

    // Max Case (Benefits exempt)
    const calculationMax = this.irsService.calculate({
      grossSalary: grossSalary,
      maritalStatus: input.maritalStatus,
      location: input.location,
      dependents: input.dependents,
      socialSecurityRate: input.ssRate
    });

    const totalNetMax = calculationMax.netSalary + monthlyMealAllowance + monthlyValueToBenefits;

    // Min Case (Benefits subject to IRS)
    const calculationMinIRS = this.irsService.calculate({
      grossSalary: grossSalary + monthlyValueToBenefits,
      maritalStatus: input.maritalStatus,
      location: input.location,
      dependents: input.dependents,
      socialSecurityRate: 0
    });

    const ssForMin = this.irsService.calculate({
      grossSalary: grossSalary,
      maritalStatus: input.maritalStatus,
      location: input.location,
      dependents: input.dependents,
      socialSecurityRate: input.ssRate
    }).socialSecurity;

    const netSalaryMin = (grossSalary + monthlyValueToBenefits) - calculationMinIRS.irsWithheld - ssForMin;
    const totalNetMin = netSalaryMin + monthlyMealAllowance;

    return {
      flexBenefitsPercentage: flexPct * 100,
      annualCost: annualCost,
      monthlyBaseSalary: monthlyBaseSalary,
      monthlyIHT: monthlyIHT,
      monthlyBenefits: monthlyValueToBenefits,
      monthlyMealAllowance: monthlyMealAllowance,
      irs: calculationMax.irsWithheld,
      socialSecurityMax: calculationMax.socialSecurity,
      socialSecurityMin: ssForMin,
      totalNetMin: totalNetMin,
      totalNetMax: totalNetMax
    };
  }
}
