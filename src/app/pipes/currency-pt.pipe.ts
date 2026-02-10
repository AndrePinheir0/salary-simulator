import { Pipe, PipeTransform } from '@angular/core';

/**
 * Pipe para formatar valores monetários no formato português: "1 000,50 €"
 * Uso: {{ value | currencyPt }}
 */
@Pipe({
  name: 'currencyPt',
  standalone: true
})
export class CurrencyPtPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') {
      return '0,00 €';
    }

    const numValue = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(numValue)) {
      return '0,00 €';
    }

    // Formatar com 2 casas decimais
    const fixed = numValue.toFixed(2);
    
    // Separar parte inteira e decimal
    const [integerPart, decimalPart] = fixed.split('.');
    
    // Adicionar espaços como separador de milhares
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    
    // Juntar com vírgula como separador decimal
    return `${formattedInteger},${decimalPart} €`;
  }
}
