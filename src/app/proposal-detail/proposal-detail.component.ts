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
