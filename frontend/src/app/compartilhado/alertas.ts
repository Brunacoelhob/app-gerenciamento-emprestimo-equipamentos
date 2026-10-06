import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';

export interface OpcoesConfirmacao {
  titulo: string;
  texto?: string;
  confirmar?: string;
  cancelar?: string;
  /** Ação destrutiva (desativar, excluir...): o botão de confirmar fica vermelho e o foco começa em "Cancelar". */
  perigo?: boolean;
}

// Todos os avisos do sistema passam por aqui (SweetAlert2): mensagens de sucesso, erros de operação e perguntas de
// confirmação. Um único lugar garante o mesmo visual (tema claro/escuro, contraste, daltonismo) e o mesmo
// comportamento de acessibilidade: o foco fica preso na janela, Esc fecha, e o foco volta a quem a abriu.
@Injectable({ providedIn: 'root' })
export class Alertas {
  // Quem pediu menos movimento (no sistema ou na barra de acessibilidade) não vê animação nenhuma
  private semAnimacao(): boolean {
    return (
      document.documentElement.getAttribute('data-animacao') === 'reduzida' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    );
  }

  private classes(perigo = false) {
    return {
      popup: 'popup-sistema',
      title: 'titulo-sistema',
      confirmButton: perigo ? 'botao perigo' : 'botao',
      cancelButton: 'botao secundario',
      input: 'campo-sistema',
      validationMessage: 'erro-sistema',
    };
  }

  /** Mensagem de sucesso: um aviso no canto da tela que some sozinho (e fica disponível para leitores de tela). */
  sucesso(mensagem: string): void {
    void Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: mensagem,
      showConfirmButton: false,
      timer: 4000,
      timerProgressBar: !this.semAnimacao(),
      animation: !this.semAnimacao(),
      customClass: this.classes(),
      didOpen: (toast) => {
        // Passar o mouse por cima pausa a contagem, para dar tempo de ler
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
      },
    });
  }

  /** Aviso neutro (informação ou atenção), também no canto da tela. */
  aviso(mensagem: string): void {
    void Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'info',
      title: mensagem,
      showConfirmButton: false,
      timer: 6000,
      animation: !this.semAnimacao(),
      customClass: this.classes(),
    });
  }

  /** Falha numa operação: uma janela que exige um clique, para o erro não passar despercebido. */
  async erro(mensagem: string, titulo = 'Não foi possível concluir'): Promise<void> {
    await Swal.fire({
      icon: 'error',
      title: titulo,
      text: mensagem,
      confirmButtonText: 'Entendi',
      animation: !this.semAnimacao(),
      customClass: this.classes(),
      buttonsStyling: false,
    });
  }

  /** Pergunta "tem certeza?" antes de uma ação importante. Devolve true só se a pessoa confirmou. */
  async confirmar(op: OpcoesConfirmacao): Promise<boolean> {
    const r = await Swal.fire({
      icon: op.perigo ? 'warning' : 'question',
      title: op.titulo,
      text: op.texto,
      showCancelButton: true,
      confirmButtonText: op.confirmar ?? 'Confirmar',
      cancelButtonText: op.cancelar ?? 'Cancelar',
      focusCancel: op.perigo === true, // numa ação destrutiva, o Enter sem querer não confirma
      reverseButtons: true,
      animation: !this.semAnimacao(),
      customClass: this.classes(op.perigo),
      buttonsStyling: false,
    });
    return r.isConfirmed;
  }

  /**
   * Pede a senha da pessoa para confirmar uma ação sensível. Devolve a senha, ou null se cancelou.
   * A senha só é validada aqui como "preenchida": quem diz se está certa é a API.
   */
  async pedirSenha(op: OpcoesConfirmacao): Promise<string | null> {
    const r = await Swal.fire({
      icon: op.perigo ? 'warning' : 'question',
      title: op.titulo,
      text: op.texto,
      input: 'password',
      inputLabel: 'Digite a sua senha para confirmar',
      inputAttributes: {
        autocomplete: 'current-password',
        'aria-label': 'Sua senha',
        maxlength: '72',
      },
      showCancelButton: true,
      confirmButtonText: op.confirmar ?? 'Confirmar',
      cancelButtonText: op.cancelar ?? 'Cancelar',
      reverseButtons: true,
      animation: !this.semAnimacao(),
      customClass: this.classes(op.perigo),
      buttonsStyling: false,
      inputValidator: (valor) => (valor ? undefined : 'Informe a sua senha para continuar.'),
    });
    return r.isConfirmed ? (r.value as string) : null;
  }
}
