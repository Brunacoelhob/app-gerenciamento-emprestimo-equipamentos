import { Pipe, PipeTransform } from '@angular/core';
import { mascaraTelefone } from './mascaras';

/** 11955348977 -> (11) 95534-8977 */
@Pipe({ name: 'telefone' })
export class Telefone implements PipeTransform {
  transform(valor: string | null): string {
    return valor ? mascaraTelefone(valor) : '';
  }
}
