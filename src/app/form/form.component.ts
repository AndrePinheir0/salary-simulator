import { Component } from '@angular/core';
import { NgbAccordionModule } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-form',
  imports: [NgbAccordionModule],
  templateUrl: './form.component.html',
  styleUrl: './form.component.scss'
})
export class FormComponent {
  defaultAnnualCost = 30000;
  defaultGrossSalary = 1000;
  defaultIhtPercentage = 25;
  defaultDailyMealAllowance = 10.22;
  defaultMonthlyMealAllowance = 0;
  calculateBy = 'annualCost';

  constructor() {
    this.defaultMonthlyMealAllowance = this.defaultDailyMealAllowance * 22;
  }

  onCalculateByChange(event: Event) {
    this.calculateBy = (event.target as HTMLSelectElement).value;
  }
  
}
