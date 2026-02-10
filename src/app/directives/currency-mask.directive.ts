import { Directive, HostListener, ElementRef, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Directive({
  selector: '[appCurrencyMask]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CurrencyMaskDirective),
      multi: true
    }
  ]
})
export class CurrencyMaskDirective implements ControlValueAccessor {
  private onChange: any = () => {};
  private onTouched: any = () => {};
  private innerValue: number | null = null;

  constructor(private el: ElementRef) {}

  @HostListener('input', ['$event'])
  onInput(event: any) {
    const value = event.target.value;
    
    // Remove non-numeric except comma
    let cleanValue = value.replace(/[^\d,]/g, '');
    
    // Handle multiple commas - keep only first decimal part
    const parts = cleanValue.split(',');
    if (parts.length > 2) {
      cleanValue = parts[0] + ',' + parts[1];
    }


    const formatted = this.formatDisplay(cleanValue);
    this.el.nativeElement.value = formatted;

    // Use ONLY the first comma-to-point replacement for numeric conversion
    const dotsFixed = cleanValue.replace(',', '.');
    const numericValue = parseFloat(dotsFixed.replace(/,/g, ''));
    this.innerValue = isNaN(numericValue) ? null : numericValue;
    this.onChange(this.innerValue);

  }

  @HostListener('blur')
  onBlur() {
    this.onTouched();
    this.normalizeValue();
  }

  writeValue(value: any): void {
    // Avoid re-formatting if the value is the same as what we just emitted
    if (value === this.innerValue && this.el.nativeElement.value !== '') {
      return;
    }

    this.innerValue = value;
    if (value !== null && value !== undefined) {
      const stringValue = value.toString().replace('.', ',');
      this.el.nativeElement.value = this.formatDisplay(stringValue);
    } else {
      this.el.nativeElement.value = '';
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  private normalizeValue() {
    const value = this.el.nativeElement.value;
    if (value) {
      const numericValue = parseFloat(value.replace(/\s/g, '').replace(',', '.'));
      if (!isNaN(numericValue)) {
        this.el.nativeElement.value = this.formatDisplay(numericValue.toFixed(2).replace('.', ','));
      }
    }
  }

  private formatDisplay(value: string): string {
    if (!value) return '';

    const parts = value.split(',');
    let integerPart = parts[0].replace(/\D/g, '');
    const decimalPart = parts.length > 1 ? ',' + parts[1].substring(0, 2) : '';

    // Thousand separator: space
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    return integerPart + decimalPart;
  }
}
