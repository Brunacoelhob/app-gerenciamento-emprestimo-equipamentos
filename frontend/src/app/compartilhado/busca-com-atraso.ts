// Pesquisa enquanto a pessoa digita: espera uma pausa na digitação antes de chamar a API (uma chamada por letra
// sobrecarregaria o servidor e faria a lista piscar). Enter e o botão "Buscar" continuam funcionando na hora.
export class BuscaComAtraso {
  private temporizador: ReturnType<typeof setTimeout> | undefined;

  agendar(acao: () => void, ms = 350) {
    this.cancelar();
    this.temporizador = setTimeout(acao, ms);
  }

  cancelar() {
    clearTimeout(this.temporizador);
  }
}
