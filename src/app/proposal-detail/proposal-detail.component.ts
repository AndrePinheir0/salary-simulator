import { Component, inject, Input, OnInit, ViewChild } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, Plugin } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { DFModalV2Service } from '@doutorfinancas/ui';
import { CurrencyPtPipe } from '../pipes/currency-pt.pipe';
import { SimulationResult } from '../models/simulation.model';

interface ChartEntry {
  label: string;
  value: number;
  color: string;
}

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

  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  proposal!: SimulationResult;
  isExporting = false;

  private modalService = inject(DFModalV2Service);

  private entries: ChartEntry[] = [];

  chartData: ChartData<'doughnut'> = { labels: [], datasets: [] };

  readonly chartPlugins: Plugin<'doughnut'>[] = [ChartDataLabels];

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
      datalabels: {
        color: '#ffffff',
        font: { weight: 'bold', size: 12 },
        textStrokeColor: 'rgba(0, 0, 0, 0.35)',
        textStrokeWidth: 3,
        formatter: (val: number, ctx) => {
          const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
          const pct = (val / total) * 100;
          // Esconde rótulos de fatias muito pequenas para evitar sobreposição.
          return pct < 4 ? '' : `${pct.toFixed(1)}%`;
        },
      },
    },
  };

  ngOnInit() {
    // proposal is set by DFModalV2Service via componentData before ngOnInit
    this.proposal = this.data;
    if (!this.proposal) return;

    this.entries = [
      { label: 'Salário base',      value: this.proposal.salaryBase,                                    color: '#3B82F6' },
      { label: 'IHT',               value: this.proposal.IHT,                                           color: '#8B5CF6' },
      { label: 'Duodécimos',        value: this.proposal.duodecimoSF + this.proposal.duodecimoSN,       color: '#06B6D4' },
      { label: 'Refeição',          value: this.proposal.monthlyMealAllowance,                           color: '#10B981' },
      { label: 'Benefícios flex.',  value: this.proposal.monthlyValueToBenefits,                         color: '#F59E0B' },
      { label: 'IRS (retenção)',    value: this.proposal.irs,                                            color: '#EF4444' },
    ].filter(e => e.value > 0);

    this.chartData = {
      labels: this.entries.map(e => e.label),
      datasets: [{
        data: this.entries.map(e => e.value),
        backgroundColor: this.entries.map(e => e.color),
        borderWidth: 2,
        borderColor: '#ffffff',
      }],
    };
  }

  async exportToExcel(): Promise<void> {
    if (!this.proposal || this.isExporting) return;
    this.isExporting = true;
    try {
      // Lazy-load to keep these libs out of the main bundle. Estas libs são
      // CommonJS, por isso o export pode vir em `.default` ou no próprio módulo.
      const [excelMod, fileSaverMod] = await Promise.all([
        import('exceljs'),
        import('file-saver'),
      ]);
      const ExcelJS: typeof import('exceljs') =
        (excelMod as any).default ?? excelMod;
      const saveAs: typeof import('file-saver').saveAs =
        (fileSaverMod as any).saveAs ?? (fileSaverMod as any).default;

      const p = this.proposal;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Simulador Salarial';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('Proposta');
      sheet.columns = [
        { key: 'label', width: 32 },
        { key: 'value', width: 18 },
      ];

      const title = sheet.addRow([`Proposta — ${p.flexBenefitsPercentage}% benefícios flexíveis`]);
      title.font = { bold: true, size: 14 };
      sheet.mergeCells(`A${title.number}:B${title.number}`);
      sheet.addRow([]);

      const addSection = (heading: string, rows: [string, number][]) => {
        const head = sheet.addRow([heading]);
        head.font = { bold: true, size: 12 };
        head.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        });
        sheet.mergeCells(`A${head.number}:B${head.number}`);
        for (const [label, value] of rows) {
          const row = sheet.addRow([label, value]);
          row.getCell(2).numFmt = '#,##0.00 €';
        }
        sheet.addRow([]);
      };

      addSection('Rendimentos mensais', [
        ['Vencimento base', p.salaryBase],
        ['IHT', p.IHT],
        ['Duodécimo SF', p.duodecimoSF],
        ['Duodécimo SN', p.duodecimoSN],
        ['Subsídio de refeição', p.monthlyMealAllowance],
        [`Benefícios flexíveis (${p.flexBenefitsPercentage}%)`, p.monthlyValueToBenefits],
      ]);

      addSection('Deduções', [
        ['Retenção IRS', -p.irs],
      ]);

      addSection('Totais', [
        ['Salário líquido', p.netSalary],
        ['Total mínimo mensal', p.totalMin],
        ['Total máximo mensal', p.totalMax],
        ['Custo anual empresa', p.custoAnualParaEmpresa],
      ]);

      // Embed the doughnut chart as an image, if it has rendered.
      const base64 = this.chart?.chart?.toBase64Image('image/png', 1);
      if (base64) {
        const imageId = workbook.addImage({ base64, extension: 'png' });
        const anchorRow = 1;
        sheet.addImage(imageId, {
          tl: { col: 3, row: anchorRow },
          ext: { width: 360, height: 360 },
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      saveAs(blob, `proposta-${p.flexBenefitsPercentage}pct.xlsx`);
    } finally {
      this.isExporting = false;
    }
  }

  close() {
    this.modalService.close();
  }
}
