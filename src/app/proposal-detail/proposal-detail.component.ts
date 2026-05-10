import { Component, inject, Input, OnInit } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { DFModalV2Service } from '@doutorfinancas/ui';
import { CurrencyPtPipe } from '../pipes/currency-pt.pipe';
import { SimulationResult } from '../models/simulation.model';

@Component({
  selector: 'app-proposal-detail',
  standalone: true,
  imports: [BaseChartDirective, CurrencyPtPipe],
  templateUrl: './proposal-detail.component.html',
  styleUrl: './proposal-detail.component.scss',
})
export class ProposalDetailComponent implements OnInit {
  // Passed by DFModalV2Component via ngComponentOutlet inputs: { data: componentData }
  @Input() data!: SimulationResult;

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
    // proposal is set by DFModalV2Service via componentData before ngOnInit
    this.proposal = this.data;
    if (!this.proposal) return;

    const entries: { label: string; value: number; color: string }[] = [
      { label: 'Salário base',      value: this.proposal.salaryBase,                                    color: '#3B82F6' },
      { label: 'IHT',               value: this.proposal.IHT,                                           color: '#8B5CF6' },
      { label: 'Duodécimos',        value: this.proposal.duodecimoSF + this.proposal.duodecimoSN,       color: '#06B6D4' },
      { label: 'Refeição',          value: this.proposal.monthlyMealAllowance,                           color: '#10B981' },
      { label: 'Benefícios flex.',  value: this.proposal.monthlyValueToBenefits,                         color: '#F59E0B' },
      { label: 'IRS (retenção)',    value: this.proposal.irs,                                            color: '#EF4444' },
    ].filter(e => e.value > 0);

    this.chartData = {
      labels: entries.map(e => e.label),
      datasets: [{
        data: entries.map(e => e.value),
        backgroundColor: entries.map(e => e.color),
        borderWidth: 2,
        borderColor: '#ffffff',
      }],
    };
  }

  close() {
    this.modalService.close();
  }
}
