# Fórmulas de Cálculo do Salário Líquido

## Inputs

| Campo | Descrição |
|-------|-----------|
| `base_salary` | Salário base mensal |
| `extraordinary_compensation` | Compensação extraordinária (subsídios, bónus) |
| `other_irs_ss_income` | Outros rendimentos sujeitos a IRS e Segurança Social |
| `other_irs_income` | Outros rendimentos sujeitos apenas a IRS (isentos de SS) |
| `other_exempt_income` | Outros rendimentos isentos de IRS e SS |
| `social_security_rate` | Taxa de SS do trabalhador (%) |
| `meal_card_type` | Tipo de subsídio de refeição: `voucher_card`, `cash`, ou sem direito |
| `daily_meal_card_value` | Valor diário do subsídio de refeição |
| `meal_card_days` | Número de dias de subsídio de refeição no mês |
| `twelfths` | Opção de duodécimos: `1x50%`, `2x50%`, `2x100%`, ou `NAOTENHO` |
| `marital_status` | Estado civil: `SOL`, `CAS1`, `CAS2` |
| `number_of_dependents` | Número de dependentes |
| `disability_above_60` | Titular com deficiência ≥ 60% |
| `spouse_has_disability` | Cônjuge com deficiência |
| `dependents_have_disability` | Dependentes com deficiência |
| `number_of_dependents_with_disability` | Número de dependentes com deficiência |
| `apply_irs_jovem` | Aplicar benefício IRS Jovem |
| `activity_start_year` | Ano de início de atividade (para IRS Jovem): `1`, `3`, `4`, `5` |
| `location` | Localização: `continente`, `acores`, `madeira` |
| `year` / `month` | Ano e mês para seleção da tabela de retenção |

---

## 1. Rendimento Bruto (`grossSalary`)

```
grossSalary = base_salary
            + extraordinary_compensation
            + actual_meal_allowance         (valor total do subsídio de refeição)
            + other_irs_ss_income
            + other_irs_income
            + other_exempt_income
            + totalSubsidies                (duodécimos, se aplicável)
```

---

## 2. Rendimento Tributável para IRS (`taxableIncome`)

O `taxableIncome` é a base usada para encontrar a taxa de retenção na tabela.

```
taxableIncome = base_salary
              + extra_meal_allowance        (parte do subsídio acima do limite isento)
              + other_irs_ss_income
              + other_irs_income
```

> `extraordinary_compensation` **não** entra no `taxableIncome` (é tributado separadamente).

---

## 3. Base de Cálculo da Segurança Social (`taxableBase`)

```
taxableBase = base_salary
            + extraordinary_compensation
            + extra_meal_allowance          (parte acima do limite isento)
            + other_irs_ss_income
            + totalSubsidies                (duodécimos)
```

> `other_irs_income` e `other_exempt_income` **não** entram na base da SS.

---

## 4. Subsídio de Refeição

### Limite de isenção diário

| Tipo | Limite diário isento |
|------|---------------------|
| `voucher_card` (cartão refeição) | **10,46 €** |
| `cash` (numerário) | **6,15 €** |
| Sem subsídio | 0 € |

### Cálculo

```
actual_meal_allowance = daily_meal_card_value × meal_card_days

mealAllowance (parte isenta)    = min(actual_meal_allowance, limit_per_day × meal_card_days)
extraMealAllowance (parte taxa) = actual_meal_allowance - mealAllowance
```

A `extraMealAllowance` entra em `taxableIncome` e `taxableBase`.

---

## 5. Seleção da Tabela de Retenção IRS

A tabela é selecionada com base em:

| Código | Situação |
|--------|----------|
| `SOLCAS2` | Solteiro sem dependentes / Casado 2 titulares sem dependentes |
| `SOLD` | Solteiro com dependentes |
| `CAS1` | Casado 1 titular |
| `CAS1D` | Casado 1 titular com dependentes (Açores/Madeira) |
| `CAS2D` | Casado 2 titulares com dependentes (Açores/Madeira) |
| `SOLCAS2+DEF` | Solteiro/CAS2 sem dependentes com deficiência |
| `SOLD+DEF` | Solteiro com dependentes e deficiência |
| `CAS1+DEF` | Casado 1 titular com deficiência |

---

## 6. Retenção na Fonte IRS

### 6.1 Taxa da tabela

Cada linha da tabela tem:
- `maximo` → taxa máxima aplicável ao rendimento do escalão
- `parcela_abater` → parcela a abater (pode ser valor fixo ou fórmula com `var1`/`var2`)
- `adicional` → valor adicional de dedução por dependente

### 6.2 Ajustamento por dependentes (≥ 3 dependentes)

```
adjustedRate = maximo - 1%       (se número de dependentes ≥ 3)
```

### 6.3 Cálculo da retenção bruta

```
withholdingAmount = taxableIncome × adjustedRate
```

### 6.4 Parcela a abater

**Caso simples** (sem `var2`):
```
deductibleAmount = parcela_abater
```

**Caso com variável** (quando `var2 > 0`):
```
deductibleAmount = parcela_abater × var1 × (var2 - taxableIncome)
```

### 6.5 Deduções por deficiência

| Situação | Dedução |
|----------|---------|
| Dependente com deficiência — Solteiro ou CAS1 | **84,82 €** por dependente |
| Dependente com deficiência — CAS2 | **42,41 €** por dependente |
| Cônjuge com deficiência (CAS1) | **135,71 €** |

### 6.6 Dedução adicional por dependente

```
additionalDeductibleAmount = adicional × number_of_dependents
```

### 6.7 Retenção final (antes de IRS Jovem)

```
withholdingAmount = (taxableIncome × adjustedRate)
                  - deductibleAmount
                  - additionalDeductibleAmount

withholdingAmount = max(withholdingAmount, 0)
```

### 6.8 Taxa efetiva

```
effectiveRate = withholdingAmount / taxableIncome
```

---

## 7. IRS Jovem

Aplicado quando `apply_irs_jovem = true`.

### 7.1 Fator de desconto por ano de atividade

| Ano de atividade | Fator | Isenção |
|-----------------|-------|---------|
| 1.º ano | 1,00 | 100% |
| 2.º a 4.º ano | 0,75 | 75% |
| 5.º a 7.º ano | 0,50 | 50% |
| 8.º a 10.º ano | 0,25 | 25% |

### 7.2 Cálculo

```
IAS = 537,13 €

potentialDiscount   = taxableIncome × discountFactor
maxDiscountAmount   = 55 × IAS / 14        → ≈ 2.108,80 €

actualDiscount      = min(potentialDiscount, maxDiscountAmount)

newTaxableBase      = taxableIncome - actualDiscount
newWithholdingAmount = floor(newTaxableBase × effectiveRate)
```

---

## 8. Retenção em Duodécimos (`twelfthWithholding`)

Quando o trabalhador opta por receber os subsídios em duodécimos:

| Opção | Base para duodécimos |
|-------|---------------------|
| `1x50%` | `base_salary / 2` |
| `2x50%` | `base_salary` |
| `2x100%` | `base_salary × 2` |

```
twelfthWithholding = baseSalaryForTwelfths / 12 × baseEffectiveRate

totalSubsidies     = (baseSalaryForTwelfths / 0.12) / 100   (valor mensal acrescido ao bruto)
subsidyWithholding = totalSubsidies × effectiveRate
```

---

## 9. Retenção de Compensação Extraordinária (`additionalWithholding`)

```
additionalWithholding = extraordinary_compensation × effectiveRate
```

---

## 10. Contribuição para a Segurança Social (`socialSecurityContribution`)

```
socialSecurityContribution = (taxableBase × social_security_rate) / 100
```

> Taxa típica do trabalhador: **11%**

---

## 11. Salário Líquido Final (`netSalary`)

```
totalWithholding = withholdingAmount
                 + additionalWithholding
                 + twelfthWithholding
                 + subsidyWithholding

netSalary = taxableIncome
          + extraordinary_compensation
          + totalSubsidies             (duodécimos)
          + mealAllowance              (parte isenta do subsídio de refeição)
          + other_exempt_income
          - socialSecurityContribution
          - floor(totalWithholding)
```

---

## 12. Decomposição do Líquido

### Líquido do Subsídio de Refeição

```
mealIrs = extraMealAllowance × effectiveRate
mealSs  = extraMealAllowance × (social_security_rate / 100)

mealAllowanceLiquidIncome = (mealAllowance - extraMealAllowance)
                          + (extraMealAllowance - mealIrs - mealSs)
                          = max(result, 0)
```

### Líquido de Base

```
baseLiquidIncome = netSalary - mealAllowanceLiquidIncome
baseLiquidIncome = max(result, 0)
```

---

## 13. Custo Mensal para a Entidade Patronal

```
employerSocialSecurityRate = 23,75%  (fator: 1.2375)

totalMonthlyEmployerCost = (taxableIncome × 1.2375)
                         + mealAllowance
                         + other_irs_income
                         + other_exempt_income
```

---

## 14. Custo Anual para a Entidade Patronal

```
ssBase = base_salary + extraordinary_compensation + other_irs_ss_income

totalAnnualEmployerCost = (ssBase × 1.2375) × 14
                        + mealAllowance × 11
                        + (other_irs_income + other_exempt_income) × 12
```

---

## 15. Salário Bruto Anual

```
annualGrossSalary = base_salary × 14
                  + mealAllowance × 11
                  + (extraordinary_compensation
                     + other_irs_income
                     + other_exempt_income
                     + other_irs_ss_income) × 12
```

---

## Diagrama Resumo

```
Rendimento Bruto
  ├── Salário Base
  ├── Compensação Extraordinária
  ├── Subsídio Refeição (parte isenta)
  ├── Subsídio Refeição (parte tributada → entra em taxableIncome e taxableBase)
  ├── Outros rendimentos IRS+SS
  ├── Outros rendimentos só IRS
  ├── Outros rendimentos isentos
  └── Duodécimos (se aplicável)
       │
       ▼
taxableIncome → Tabela IRS → Taxa Máxima
                            → Parcela a Abater
                            → Deduções (dependentes, deficiência)
                            → IRS Jovem (se aplicável)
                            = withholdingAmount
       │
taxableBase → × (SS rate / 100)
            = socialSecurityContribution
       │
       ▼
netSalary = taxableIncome + extraordinary_compensation + duodécimos
          + mealAllowance (isenta) + other_exempt_income
          - socialSecurityContribution
          - floor(totalWithholding)
```
