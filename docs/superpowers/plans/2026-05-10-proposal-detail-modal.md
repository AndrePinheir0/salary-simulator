# Proposal Detail Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Ver detalhes" button to each row of the results table that opens a modal with a donut chart (salary breakdown) and all simulation fields grouped by category.

**Architecture:** `SimulationResult` is extracted to a shared model file. A new standalone `ProposalDetailComponent` is passed as `content: Type<any>` to `DFModalV2Service`, with the selected row injected via `componentData`. `SimulatorComponent` injects the service and calls `open()` on button click.

**Tech Stack:** Angular 19 standalone, Chart.js 4, ng2-charts 7, `@doutorfinancas/ui` DFModalV2Service, CurrencyPtPipe

---

### Task 1: Install Chart.js and ng2-charts

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/andre/Projects/personal/salary-simulator
npm install chart.js@^4 ng2-charts@^7
```

Expected: packages added to `node_modules`, versions appear in `package.json`.

- [ ] **Step 2: Verify install**

```bash
npm list chart.js ng2-charts
```

Expected output (versions may differ slightly):
```
├── chart.js@4.x.x
└── ng2-charts@7.x.x
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install chart.js and ng2-charts for proposal detail modal"
```

---

### Task 2: Extract SimulationResult to shared model

**Files:**
- Create: `src/app/models/simulation.model.ts`
- Modify: `src/app/simulator/simulator.component.ts` (remove local interface, import from model)

- [ ] **Step 1: Create model file**

Create `src/app/models/simulation.model.ts`:

```typescript
export interface SimulationResult {
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
```

- [ ] **Step 2: Update SimulatorComponent imports**

In `src/app/simulator/simulator.component.ts`:

Remove the local `interface SimulationResult { ... }` block (lines 22–39) and add the import at the top:

```typescript
import { SimulationResult } from '../models/simulation.model';
```

- [ ] **Step 3: Verify build**

```bash
npx ng build --configuration development 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/models/simulation.model.ts src/app/simulator/simulator.component.ts
git commit -m "refactor: extract SimulationResult to shared model"
```

---

### Task 3: Create ProposalDetailComponent

**Files:**
- Create: `src/app/proposal-detail/proposal-detail.component.ts`
- Create: `src/app/proposal-detail/proposal-detail.component.html`
- Create: `src/app/proposal-detail/proposal-detail.component.scss`

- [ ] **Step 1: Create the component TypeScript file**

Create `src/app/proposal-detail/proposal-detail.component.ts`:

```typescript
import { Component, inject, OnInit } from '@angular/core';
import { NgChartsModule } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { DFModalV2Service } from '@doutorfinancas/ui';
import { CurrencyPtPipe } from '../pipes/currency-pt.pipe';
import { SimulationResult } from '../models/simulation.model';

@Component({
  selector: 'app-proposal-detail',
  standalone: true,
  imports: [NgChartsModule, CurrencyPtPipe],
  templateUrl: './proposal-detail.component.html',
  styleUrl: './proposal-detail.component.scss',
})
export class ProposalDetailComponent implements OnInit {
  // Injected via DFModalV2Service componentData
  proposal!: SimulationResult;

  private modalService = inject(DFModalV2Service);

  chartData: ChartData<'doughnut'> = { labels: [], datasets: [] };

  chartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { padding: 16, font: { size: 13 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const val = ctx.parsed as number;
            const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
            const pct = ((val / total) * 100).toFixed(1);
            return ` ${val.toFixed(2).replace('.', ',')} € (${pct}%)`;
          },
        },
      },
    },
  };

  ngOnInit() {
    const base = this.proposal.salaryBase;
    const iht = this.proposal.IHT;
    const duodecimos = this.proposal.duodecimoSF + this.proposal.duodecimoSN;
    const refeicao = this.proposal.monthlyMealAllowance;
    const beneficios = this.proposal.monthlyValueToBenefits;
    const irs = Math.abs(this.proposal.irs);

    this.chartData = {
      labels: ['Salário base', 'IHT', 'Duodécimos', 'Refeição', 'Benefícios flex.', 'IRS (retenção)'],
      datasets: [
        {
          data: [base, iht, duodecimos, refeicao, beneficios, irs],
          backgroundColor: ['#3B82F6', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    };
  }

  close() {
    this.modalService.close();
  }
}
```

- [ ] **Step 2: Create the template**

Create `src/app/proposal-detail/proposal-detail.component.html`:

```html
<div class="detail-layout">
  <div class="chart-panel">
    <h3>Decomposição do líquido</h3>
    <div class="chart-container">
      <canvas baseChart
        [data]="chartData"
        [options]="chartOptions"
        type="doughnut">
      </canvas>
    </div>
  </div>

  <div class="data-panel">
    <section class="data-group">
      <h4>Rendimentos mensais</h4>
      <dl>
        <div class="data-row">
          <dt>Vencimento base</dt>
          <dd>{{ proposal.salaryBase | currencyPt }}</dd>
        </div>
        <div class="data-row">
          <dt>IHT ({{ proposal.IHT > 0 ? ((proposal.IHT / proposal.salaryBase) * 100).toFixed(0) : 0 }}%)</dt>
          <dd>{{ proposal.IHT | currencyPt }}</dd>
        </div>
        <div class="data-row">
          <dt>Duodécimo SF</dt>
          <dd>{{ proposal.duodecimoSF | currencyPt }}</dd>
        </div>
        <div class="data-row">
          <dt>Duodécimo SN</dt>
          <dd>{{ proposal.duodecimoSN | currencyPt }}</dd>
        </div>
        <div class="data-row">
          <dt>Subsídio de refeição</dt>
          <dd>{{ proposal.monthlyMealAllowance | currencyPt }}</dd>
        </div>
        <div class="data-row">
          <dt>Benefícios flexíveis ({{ proposal.flexBenefitsPercentage }}%)</dt>
          <dd>{{ proposal.monthlyValueToBenefits | currencyPt }}</dd>
        </div>
      </dl>
    </section>

    <section class="data-group">
      <h4>Deduções</h4>
      <dl>
        <div class="data-row data-row-deduction">
          <dt>Retenção IRS</dt>
          <dd>– {{ proposal.irs | currencyPt }}</dd>
        </div>
      </dl>
    </section>

    <section class="data-group">
      <h4>Totais</h4>
      <dl>
        <div class="data-row data-row-highlight">
          <dt>Salário líquido</dt>
          <dd>{{ proposal.netSalary | currencyPt }}</dd>
        </div>
        <div class="data-row">
          <dt>Total mínimo mensal</dt>
          <dd>{{ proposal.totalMin | currencyPt }}</dd>
        </div>
        <div class="data-row data-row-highlight">
          <dt>Total máximo mensal</dt>
          <dd>{{ proposal.totalMax | currencyPt }}</dd>
        </div>
        <div class="data-row data-row-strong">
          <dt>Custo anual empresa</dt>
          <dd>{{ proposal.custoAnualParaEmpresa | currencyPt }}</dd>
        </div>
      </dl>
    </section>
  </div>
</div>
```

- [ ] **Step 3: Create the styles**

Create `src/app/proposal-detail/proposal-detail.component.scss`:

```scss
.detail-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  padding: 1.5rem;
  min-width: 700px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    min-width: unset;
  }
}

.chart-panel {
  h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--df-color-neutral-600, #4b5563);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 1rem;
  }
}

.chart-container {
  position: relative;
  height: 280px;
}

.data-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.data-group {
  h4 {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--df-color-neutral-500, #6b7280);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--df-color-neutral-200, #e5e7eb);
  }
}

dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.data-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
  padding: 0.25rem 0;

  dt {
    color: var(--df-color-neutral-600, #4b5563);
    font-weight: 400;
  }

  dd {
    font-weight: 500;
    margin: 0;
    color: var(--df-color-neutral-900, #111827);
  }

  &.data-row-deduction dd {
    color: var(--df-color-error-600, #dc2626);
  }

  &.data-row-highlight {
    background: var(--df-color-primary-50, #eff6ff);
    border-radius: 6px;
    padding: 0.375rem 0.5rem;

    dd { color: var(--df-color-primary-700, #1d4ed8); font-weight: 600; }
  }

  &.data-row-strong {
    padding: 0.5rem 0.5rem;
    background: var(--df-color-neutral-900, #111827);
    border-radius: 6px;

    dt { color: #fff; }
    dd { color: #fff; font-weight: 700; font-size: 1rem; }
  }
}
```

- [ ] **Step 4: Verify build**

```bash
npx ng build --configuration development 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/proposal-detail/
git commit -m "feat: add ProposalDetailComponent with donut chart and salary breakdown"
```

---

### Task 4: Wire modal into SimulatorComponent

**Files:**
- Modify: `src/app/simulator/simulator.component.ts`
- Modify: `src/app/simulator/simulator.component.html`

- [ ] **Step 1: Add DFModalV2Service and open method to SimulatorComponent**

In `src/app/simulator/simulator.component.ts`, add these imports at the top:

```typescript
import { DFModalV2Service } from '@doutorfinancas/ui';
import { ProposalDetailComponent } from '../proposal-detail/proposal-detail.component';
```

Inside the class, inject the service and add the `openDetail` method:

```typescript
private modalService = inject(DFModalV2Service);

openDetail(item: SimulationResult) {
  this.modalService.open({
    title: `Proposta — ${item.flexBenefitsPercentage}% benefícios`,
    content: ProposalDetailComponent,
    size: 'xl',
    hideCloseButton: false,
    componentData: { proposal: item },
  });
}
```

- [ ] **Step 2: Add "Ver detalhes" button to each table row**

In `src/app/simulator/simulator.component.html`, find the `<tbody>` block and add a new `<td>` at the end of each `<tr>` with a button:

After the last `<td>{{ item.custoAnualParaEmpresa | currencyPt }}</td>`, add:

```html
<td>
  <button
    type="button"
    class="df-button df-button-default-secondary df-button-s"
    (click)="openDetail(item)"
  >
    Ver detalhes
  </button>
</td>
```

Also add a matching `<th>` in the `<thead>`:

```html
<th></th>
```

- [ ] **Step 3: Verify build**

```bash
npx ng build --configuration development 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/simulator/simulator.component.ts src/app/simulator/simulator.component.html
git commit -m "feat: open proposal detail modal from results table"
```

---

### Task 5: Register Chart.js defaults

**Files:**
- Modify: `src/app/app.config.ts`

Chart.js 4 + ng2-charts 7 requires `provideCharts(withDefaultRegisterables())` in the app config for standalone apps.

- [ ] **Step 1: Update app.config.ts**

```typescript
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

// inside providers array, add:
provideCharts(withDefaultRegisterables())
```

Full `providers` array after change:

```typescript
providers: [
  provideZoneChangeDetection({ eventCoalescing: true }),
  provideRouter(routes),
  provideClientHydration(withEventReplay()),
  provideHttpClient(withFetch()),
  provideCharts(withDefaultRegisterables()),
]
```

- [ ] **Step 2: Verify build**

```bash
npx ng build --configuration development 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/app.config.ts
git commit -m "chore: register Chart.js defaults via provideCharts"
```

---

## Execution Order

Tasks must be executed in order: 1 → 2 → 3 → 4 → 5.

Task 5 (provideCharts) must come last to avoid confusing build errors before the component exists.
