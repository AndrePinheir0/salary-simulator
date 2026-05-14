import { AfterViewInit, Directive, ElementRef, HostListener, inject } from '@angular/core';
import { NgControl } from '@angular/forms';
import { DfInputTextComponent } from '@doutorfinancas/ui';

@Directive({
  selector: 'df-input-text[appDfCurrencyMask]',
  standalone: true,
})
export class DfCurrencyMaskDirective implements AfterViewInit {
  private ngControl = inject(NgControl, { self: true });
  private host = inject(DfInputTextComponent, { self: true });
  private inputEl!: HTMLInputElement;

  ngAfterViewInit() {
    this.inputEl = this.host.inputRef.nativeElement;

    // Intercept native input events to format display and emit numeric value
    this.inputEl.addEventListener('input', (event: Event) => {
      const raw = (event.target as HTMLInputElement).value;
      const formatted = this.format(raw);
      this.inputEl.value = formatted;

      const numeric = this.toNumber(formatted);
      this.ngControl.control!.setValue(numeric, { emitEvent: true });
    });

    this.inputEl.addEventListener('blur', () => {
      this.normalize();
      this.ngControl.control!.markAsTouched();
    });

    // Defer initial formatting so the host component finishes its own render cycle first
    setTimeout(() => {
      const initial = this.ngControl.value;
      if (initial != null) {
        this.inputEl.value = this.formatNumber(initial);
      }
    });

    // React to programmatic value changes (e.g. reset)
    this.ngControl.valueChanges?.subscribe((val) => {
      const numeric = this.toNumber(this.inputEl.value);
      if (val !== numeric) {
        this.inputEl.value = val != null ? this.formatNumber(val) : '';
      }
    });
  }

  private format(raw: string): string {
    let clean = raw.replace(/[^\d,]/g, '');
    const parts = clean.split(',');
    if (parts.length > 2) clean = parts[0] + ',' + parts[1];
    return this.formatDisplay(clean);
  }

  private formatDisplay(value: string): string {
    if (!value) return '';
    const parts = value.split(',');
    let intPart = parts[0].replace(/\D/g, '');
    const decPart = parts.length > 1 ? ',' + parts[1].substring(0, 2) : '';
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return intPart + decPart;
  }

  private formatNumber(value: number): string {
    const str = value.toFixed(2).replace('.', ',');
    return this.formatDisplay(str);
  }

  private normalize() {
    const val = this.inputEl.value;
    if (!val) return;
    const num = this.toNumber(val);
    if (!isNaN(num)) {
      this.inputEl.value = this.formatNumber(num);
    }
  }

  private toNumber(formatted: string): number {
    const clean = formatted.replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }
}
