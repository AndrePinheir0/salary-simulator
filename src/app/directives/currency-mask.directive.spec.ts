import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { CurrencyMaskDirective } from './currency-mask.directive';

@Component({
  standalone: true,
  imports: [FormsModule, CurrencyMaskDirective],
  template: '<input type="text" [(ngModel)]="value" appCurrencyMask>'
})
class TestComponent {
  value: number | null = null;
}

describe('CurrencyMaskDirective', () => {
  let fixture: ComponentFixture<TestComponent>;
  let inputEl: HTMLInputElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestComponent]
    });
    fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    inputEl = fixture.debugElement.query(By.css('input')).nativeElement;
  });

  it('should format numbers with spaces for thousands and comma for decimal', fakeAsync(() => {
    fixture.componentInstance.value = 1234.56;
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    expect(inputEl.value).toBe('1 234,56');
  }));

  it('should format value while typing', fakeAsync(() => {
    inputEl.value = '1000,5';
    inputEl.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    tick();
    
    expect(inputEl.value).toBe('1 000,5');
    expect(fixture.componentInstance.value).toBe(1000.5);
  }));

  it('should correctly handle multiple commas by keeping only the first one', fakeAsync(() => {
    inputEl.value = '1000,50,70';
    inputEl.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    tick();
    
    expect(inputEl.value).toBe('1 000,50');
    expect(fixture.componentInstance.value).toBe(1000.5);
  }));
});
