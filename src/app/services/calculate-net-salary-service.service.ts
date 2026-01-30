// src/app/services/irs-withholding.service.ts
import { Injectable } from '@angular/core';

/**
 * ✅ Drop-in Angular service to calculate:
 * - IRS withholding (retenção na fonte) using your JSON tables (Continent 2026)
 * - Social Security (11% default)
 * - Net salary (gross - IRS - SS)
 *
 * Assumes your JSON matches the structure you posted earlier:
 * {
 *   meta: {...},
 *   tables: [{ id, audience, hasDisability, bands: [...] }]
 * }
 *
 * Important:
 * - This calculates *retention tables* withholding, not yearly IRS settlement.
 * - Location is validated but only "continente" is supported by this dataset.
 */

export type LocationPT = 'continente' | 'madeira' | 'acores';
export type MaritalStatus =
  | 'single'                 // não casado
  | 'married_one_holder'     // casado, único titular
  | 'married_two_holders';   // casado 2 titulares

export interface IrsInput {
  grossSalary: number;           // R
  maritalStatus: MaritalStatus;
  location: LocationPT;
  dependents: number;
  hasDisability?: boolean;
  socialSecurityRate?: number;   // default 0.11
}

export interface IrsResult {
  tableId: string;
  band: Band;
  rate: number;
  deduction: number;
  additionalPerDependent: number;
  irsWithheld: number;
  socialSecurity: number;
  netSalary: number;
}

type Deduction =
  | number
  | { type: 'formula'; expression: string };

export interface Band {
  upTo?: number;                 // inclusive upper bound
  over?: number;                 // lower bound (exclusive / "superior a")
  rate: number;                  // e.g. 0.157
  deduction: Deduction;          // number OR formula expression "a * b * (c - R)"
  additionalPerDependent?: number;
  effectiveRateAtLimit?: number | null;
  notes?: string;
}

export interface IrsDataset {
  meta: {
    country: 'PT';
    region: 'continente';
    validFrom: string;
    validTo: string;
    period: 'monthly';
    unit: 'EUR';
  };
  tables: Array<{
    id: string; // I..VII
    name: string;
    audience: string;
    hasDisability: boolean;
    assumesDependents: '0' | '0+' | '1+';
    bands: Band[];
  }>;
}

@Injectable({ providedIn: 'root' })
export class CalculateNetSalaryService {
  /**
   * 🔧 Put your JSON here by importing it:
   *   import dataset from 'src/assets/irs/pt-continente-2026.json';
   *   private readonly data: IrsDataset = dataset as IrsDataset;
   *
   * Or inject via constructor. For simplicity this is a setter.
   */
  private data?: IrsDataset;

  setDataset(dataset: IrsDataset) {
    this.data = dataset;
  }

  calculate(input: IrsInput): IrsResult {
    // Passo 1: Verificar se os dados das tabelas de IRS foram carregados
    if (!this.data) {
      throw new Error('IRS dataset not set. Call setDataset(dataset) once at app startup.');
    }

    const {
      grossSalary,
      maritalStatus,
      location,
      dependents,
      hasDisability = false,
      socialSecurityRate = 0.11,
    } = input;

    // Passo 2: Validar os dados de entrada
    if (grossSalary <= 0 || !Number.isFinite(grossSalary)) {
      throw new Error('grossSalary must be a positive number.');
    }
    if (dependents < 0 || !Number.isInteger(dependents)) {
      throw new Error('dependents must be an integer >= 0.');
    }
    if (location !== 'continente') {
      // O dataset fornecido é explicitamente para o "continente 2026"
      throw new Error(`Location "${location}" not supported by this dataset (continente only).`);
    }

    // Passo 3: Determinar qual a tabela de IRS a aplicar (I a VII) com base no estado civil e dependentes
    const tableId = this.pickTableId(maritalStatus, dependents, hasDisability);
    const table = this.data.tables.find(t => t.id === tableId);
    if (!table) throw new Error(`Table "${tableId}" not found in dataset.`);

    // Passo 4: Encontrar o escalão (band) correspondente ao salário bruto
    const band = this.pickBand(table.bands, grossSalary);
    const rate = band.rate;
    const additionalPerDependent = band.additionalPerDependent ?? 0;
    
    // Passo 5: Calcular a parcela a abater (dedução)
    const deduction = this.resolveDeduction(band.deduction, grossSalary);

    // Passo 6: Aplicar a fórmula de retenção na fonte de IRS
    // Fórmula: (Salário Bruto * Taxa) - Parcela a Abater - (Dedução por Dependente * Número de Dependentes)
    const irsRaw =
      grossSalary * rate - deduction - additionalPerDependent * dependents;

    // Passo 7: Garantir que o IRS não é negativo e arredondar
    const irsWithheld = this.round2(Math.max(0, irsRaw)); 

    // Passo 8: Calcular a Segurança Social (tipicamente 11% para o trabalhador)
    const socialSecurity = this.round2(grossSalary * socialSecurityRate);

    // Passo 9: Calcular o salário líquido final
    const netSalary = this.round2(grossSalary - irsWithheld - socialSecurity);

    return {
      tableId,
      band,
      rate,
      deduction: this.round2(deduction),
      additionalPerDependent: this.round2(additionalPerDependent),
      irsWithheld,
      socialSecurity,
      netSalary
    };
  }

  /**
   * Maps your UI params to the table id (I..VII)
   * Based on the tables you pasted.
   */
  private pickTableId(
    maritalStatus: MaritalStatus,
    dependents: number,
    hasDisability: boolean
  ): string {
    if (hasDisability) {
      if (maritalStatus === 'married_one_holder') return 'VII';
      if (maritalStatus === 'married_two_holders') return dependents >= 1 ? 'VI' : 'IV';
      // single
      return dependents >= 1 ? 'V' : 'IV';
    } else {
      if (maritalStatus === 'married_one_holder') return 'III';
      // single OR married_two_holders share I/II logic
      return dependents >= 1 ? 'II' : 'I';
    }
  }


  /**
   * This function selects the appropriate tax band based on the gross salary.
   * It first orders the bands by their "upTo" values (ascending),
   * then selects the first band where the gross salary 
   * is less than or equal to the "upTo" value.
   * If no band is found, it returns the last band (the "over" band).
   * @param bands 
   * @param grossSalary 
   * @returns 
   */
  private pickBand(bands: Band[], grossSalary: number): Band {
    // Order: all "upTo" ascending, then "over" last
    const sorted = [...bands].sort((a, b) => {
      //
      const au = a.upTo ?? Number.POSITIVE_INFINITY;
      const bu = b.upTo ?? Number.POSITIVE_INFINITY;
      return au - bu;
    });

    for (const b of sorted) {
      if (typeof b.upTo === 'number' && grossSalary <= b.upTo) return b;
    }

    // fallback "over"
    const overBand = sorted.find(b => typeof b.over === 'number');
    if (!overBand) throw new Error('No matching band found (and no "over" band).');
    return overBand;
  }

  /**
   * Supports:
   * - number deduction (e.g., 94.71)
   * - formula deduction strings like:
   *   "0.125 * 2.60 * (1273.85 - R)"
   *
   * If your JSON uses the expression format from my mapping, this works.
   */
  private resolveDeduction(deduction: Deduction, R: number): number {
    if (typeof deduction === 'number') return deduction;

    if (deduction?.type === 'formula') {
      const expr = deduction.expression.replace(/\s+/g, '');

      // Pattern: a*b*(c-R)
      const m = expr.match(/^([0-9.]+)\*([0-9.]+)\*\(([0-9.]+)-R\)$/i);
      if (!m) {
        throw new Error(`Unsupported deduction formula expression: ${deduction.expression}`);
      }

      const a = Number(m[1]);
      const b = Number(m[2]);
      const c = Number(m[3]);
      if (![a, b, c].every(n => Number.isFinite(n))) {
        throw new Error(`Invalid numbers in deduction formula: ${deduction.expression}`);
      }

      return a * b * (c - R);
    }

    throw new Error('Invalid deduction field.');
  }

  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
}
