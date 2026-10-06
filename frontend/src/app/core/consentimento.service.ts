import { Injectable, signal } from '@angular/core';

// Escolha da pessoa sobre cookies e recursos de terceiros. A pergunta volta a cada carregamento da página (de
// propósito): nada é lembrado entre uma visita e outra, então a decisão vale só para esta sessão do navegador.
//  - necessários: sessão e segurança. Sempre ligados, o sistema não funciona sem eles.
//  - funcionais: lembrar as preferências de acessibilidade neste aparelho (tema, tamanho do texto, etc.).
//  - terceiros: carregar o VLibras (tradutor de Libras do governo federal), um serviço externo que vê o IP da pessoa.
@Injectable({ providedIn: 'root' })
export class ConsentimentoService {
  readonly decidido = signal(false);
  readonly funcionais = signal(false);
  readonly terceiros = signal(false);

  aceitarTodos() {
    this.definir(true, true);
  }

  recusar() {
    this.definir(false, false);
  }

  salvar(funcionais: boolean, terceiros: boolean) {
    this.definir(funcionais, terceiros);
  }

  private definir(funcionais: boolean, terceiros: boolean) {
    this.funcionais.set(funcionais);
    this.terceiros.set(terceiros);
    this.decidido.set(true);
  }
}
