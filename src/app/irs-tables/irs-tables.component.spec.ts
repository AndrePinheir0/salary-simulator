import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IrsTablesComponent } from './irs-tables.component';

describe('IrsTablesComponent', () => {
  let component: IrsTablesComponent;
  let fixture: ComponentFixture<IrsTablesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IrsTablesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(IrsTablesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
