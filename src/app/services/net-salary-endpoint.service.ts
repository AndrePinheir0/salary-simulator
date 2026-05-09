import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type EndpointLocation = 'continente' | 'acores' | 'madeira';
export type EndpointMaritalStatus = 'SOL' | 'CAS1' | 'CAS2';
export type EndpointMealCardType = 'not_available' | 'voucher_card' | 'cash';
export type EndpointTwelfths = '' | '1x50%' | '2x50%' | '2x100%';
export type EndpointBooleanString = '' | 'true' | 'false';
export type EndpointActivityStartYear = '' | '1' | '3' | '4' | '5';

type FormValue = string | number | boolean | null | undefined;

export interface NetSalaryEndpointRequest {
  location: EndpointLocation;
  marital_status: EndpointMaritalStatus;
  number_of_dependents: FormValue;
  disability_above_60: FormValue;
  spouse_has_disability: FormValue;
  dependents_have_disability: FormValue;
  number_of_dependents_with_disability: FormValue;
  base_salary: FormValue;
  extraordinary_compensation: FormValue;
  other_irs_ss_income: FormValue;
  other_irs_income: FormValue;
  other_exempt_income: FormValue;
  social_security_rate: FormValue;
  twelfths: EndpointTwelfths;
  meal_card_type: EndpointMealCardType;
  daily_meal_card_value: FormValue;
  meal_card_days: FormValue;
  year: FormValue;
  month: FormValue;
  apply_irs_jovem: EndpointBooleanString;
  activity_start_year: EndpointActivityStartYear;
}

export type NetSalaryEndpointResponse = Record<string, unknown>;

export interface NetSalaryCalculationResult {
  netSalary: number;
  grossSalary: number;
  irsWithheld: number;
  socialSecurity: number;
}

@Injectable({ providedIn: 'root' })
export class NetSalaryEndpointService {
  private readonly basePath = 'https://simulator.do.doutorfinancas.pt/api/simulators';

  constructor(private readonly http: HttpClient) {}

  calculateNetSalary(
    request: NetSalaryEndpointRequest,
  ): Observable<NetSalaryEndpointResponse> {
    return this.http.post<NetSalaryEndpointResponse>(
      `${this.basePath}/net-salary`,
      this.toFormData(this.transformRequest(request)),
    );
  }

  getIrsTable(
    request: NetSalaryEndpointRequest,
  ): Observable<NetSalaryEndpointResponse> {
    return this.http.post<NetSalaryEndpointResponse>(
      `${this.basePath}/net-salary-irs-table`,
      this.toFormData(this.transformRequest(request)),
    );
  }

  extractCalculationResult(
    response: NetSalaryEndpointResponse,
  ): NetSalaryCalculationResult {
    const data = this.getMap(response, 'data');
    const salarySimulation = this.getMap(data, 'salary_simulation');
    const rawData = this.getMap(salarySimulation, 'raw_data');
    const netSalary = this.getMap(rawData, 'net_salary');
    const grossSalary = this.getMap(rawData, 'gross_salary');
    const deductions = this.getMap(rawData, 'deductions');

    return {
      netSalary: this.getNumber(netSalary, 'total_net_salary', 0),
      grossSalary: this.getNumber(grossSalary, 'total_gross_salary', 0),
      irsWithheld:
        this.getNumber(deductions, 'irs_withholding', 0) +
        this.getNumber(netSalary, 'twelfths_withholding', 0),
      socialSecurity: this.getNumber(
        deductions,
        'social_security_contribution',
        0,
      ),
    };
  }

  private transformRequest(
    request: NetSalaryEndpointRequest,
  ): Record<string, FormValue> {
    const payload: Record<string, FormValue> = { ...request };

    if (this.toString(payload['year']) === '2026') {
      delete payload['month'];
    }

    if (this.toString(payload['month']) === 'default') {
      payload['month'] = '';
    }

    const numericFields = [
      'number_of_dependents',
      'extraordinary_compensation',
      'other_irs_ss_income',
      'other_irs_income',
      'other_exempt_income',
      'number_of_dependents_with_disability',
      'social_security_rate',
      'meal_card_days',
    ];

    for (const field of numericFields) {
      payload[field] = this.toNumber(payload[field], 0);
    }

    payload['base_salary'] = this.toNumber(payload['base_salary'], 0);
    payload['daily_meal_card_value'] =
      payload['daily_meal_card_value'] === '' ||
      payload['daily_meal_card_value'] == null
        ? ''
        : this.toString(payload['daily_meal_card_value']);

    if (this.toNumber(payload['number_of_dependents'], 0) === 0) {
      payload['number_of_dependents_with_disability'] = 0;
    }

    if (this.toString(payload['meal_card_type']) === 'not_available') {
      payload['meal_card_days'] = 0;
      payload['daily_meal_card_value'] = '0';
    }

    return payload;
  }

  private toFormData(payload: Record<string, FormValue>): FormData {
    const formData = new FormData();

    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) continue;
      formData.append(key, this.toString(value));
    }

    return formData;
  }

  private toString(value: FormValue): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return '';
  }

  private toNumber(value: FormValue, defaultValue: number): number {
    if (value == null || value === '') return defaultValue;
    if (typeof value === 'number') return Number.isFinite(value) ? value : defaultValue;
    if (typeof value === 'boolean') return value ? 1 : 0;

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  private getMap(
    source: Record<string, unknown>,
    key: string,
  ): Record<string, unknown> {
    const value = source[key];
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private getNumber(
    source: Record<string, unknown>,
    key: string,
    defaultValue: number,
  ): number {
    const value = source[key];
    if (typeof value === 'number') return Number.isFinite(value) ? value : defaultValue;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    }
    return defaultValue;
  }
}
