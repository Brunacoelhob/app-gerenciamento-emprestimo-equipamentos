import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ANIMAIS, Avatar, rotuloAnimal } from '../../compartilhado/avatar';
import { Modal } from '../../compartilhado/modal';
import { prepararAvatar } from '../../compartilhado/imagem';
import { cpfValido, mascaraCep, mascaraCpf, mascaraTelefone, soDigitos } from '../../compartilhado/mascaras';
import { AuthService } from '../../core/auth.service';
import { mensagemDeErro } from '../../core/erro';
import { DadosPerfil, Usuario } from '../../core/modelos';
import { AlterarSenha } from '../alterar-senha/alterar-senha';

// Campos opcionais: vazio vale; preenchido precisa estar no formato.
const opcional =
  (valido: (valor: string) => boolean) =>
  (c: AbstractControl): ValidationErrors | null =>
    !c.value || valido(c.value as string) ? null : { formato: true };

type MascaraCampo = 'cpf' | 'telefone' | 'cep';

interface RespostaViaCep {
  erro?: boolean;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}

@Component({
  selector: 'app-perfil',
  imports: [ReactiveFormsModule, Avatar, AlterarSenha, Modal],
  templateUrl: './perfil.html',
  styleUrl: './perfil.scss',
})
export class Perfil implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  protected readonly animais = ANIMAIS;
  protected readonly rotuloAnimal = rotuloAnimal;

  protected readonly salvando = signal(false);
  protected readonly salvandoFoto = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly erroFoto = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly avisoCep = signal<string | null>(null);

  // Privacidade (LGPD)
  protected readonly modalExcluir = signal(false);
  protected readonly senhaExclusao = signal('');
  protected readonly excluindo = signal(false);
  protected readonly erroExclusao = signal<string | null>(null);
  protected readonly baixando = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    nome: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    cpf: ['', [opcional(cpfValido)]],
    telefone: ['', [opcional((v) => /^\d{10,11}$/.test(soDigitos(v)))]],
    cep: ['', [opcional((v) => soDigitos(v).length === 8)]],
    logradouro: ['', [Validators.maxLength(150)]],
    numero: ['', [Validators.maxLength(20)]],
    complemento: ['', [Validators.maxLength(80)]],
    bairro: ['', [Validators.maxLength(80)]],
    cidade: ['', [Validators.maxLength(80)]],
    uf: ['', [opcional((v) => /^[A-Za-z]{2}$/.test(v))]],
  });

  ngOnInit() {
    const usuario = this.auth.usuario();
    if (usuario) this.preencher(usuario);
  }

  private preencher(u: Usuario) {
    this.form.reset({
      nome: u.nome,
      email: u.email,
      cpf: mascaraCpf(u.cpf ?? ''),
      telefone: mascaraTelefone(u.telefone ?? ''),
      cep: mascaraCep(u.cep ?? ''),
      logradouro: u.logradouro ?? '',
      numero: u.numero ?? '',
      complemento: u.complemento ?? '',
      bairro: u.bairro ?? '',
      cidade: u.cidade ?? '',
      uf: u.uf ?? '',
    });
  }

  protected mascarar(campo: MascaraCampo, evento: Event) {
    const mascaras = { cpf: mascaraCpf, telefone: mascaraTelefone, cep: mascaraCep };
    const valor = mascaras[campo]((evento.target as HTMLInputElement).value);
    this.form.controls[campo].setValue(valor);
    if (campo === 'cep') this.buscarCep();
  }

  // Preenche rua, bairro, cidade e UF a partir do CEP (ViaCEP). Se falhar, a pessoa digita à mão.
  private buscarCep() {
    this.avisoCep.set(null);
    const cep = soDigitos(this.form.controls.cep.value);
    if (cep.length !== 8) return;

    this.http.get<RespostaViaCep>(`https://viacep.com.br/ws/${cep}/json/`).subscribe({
      next: (r) => {
        if (r.erro) {
          this.avisoCep.set('CEP não encontrado. Preencha o endereço manualmente.');
          return;
        }
        this.form.patchValue({ logradouro: r.logradouro, bairro: r.bairro, cidade: r.localidade, uf: r.uf });
      },
      error: () => this.avisoCep.set('Não foi possível consultar o CEP agora. Preencha o endereço manualmente.'),
    });
  }

  protected salvar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.erro.set('Corrija os campos destacados.');
      return;
    }
    this.salvando.set(true);
    this.erro.set(null);
    this.aviso.set(null);

    const v = this.form.getRawValue();
    const dados: DadosPerfil = { ...v, cpf: soDigitos(v.cpf), telefone: soDigitos(v.telefone), cep: soDigitos(v.cep) };

    this.auth.atualizarPerfil(dados).subscribe({
      next: (u) => {
        this.preencher(u);
        this.aviso.set('Perfil atualizado.');
        this.salvando.set(false);
      },
      error: (e: unknown) => {
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }

  protected escolherAnimal(animal: string) {
    this.trocarAvatar(`animal:${animal}`);
  }

  protected removerFoto() {
    this.trocarAvatar(null);
  }

  protected async enviarFoto(evento: Event) {
    const entrada = evento.target as HTMLInputElement;
    const arquivo = entrada.files?.[0];
    entrada.value = ''; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;

    this.erroFoto.set(null);
    try {
      this.trocarAvatar(await prepararAvatar(arquivo));
    } catch (e) {
      this.erroFoto.set(e instanceof Error ? e.message : 'Não foi possível usar essa imagem.');
    }
  }

  private trocarAvatar(avatar: string | null) {
    this.salvandoFoto.set(true);
    this.erroFoto.set(null);
    this.aviso.set(null);
    this.auth.atualizarPerfil({ avatar }).subscribe({
      next: () => {
        this.aviso.set(avatar ? 'Foto atualizada.' : 'Foto removida.');
        this.salvandoFoto.set(false);
      },
      error: (e: unknown) => {
        this.erroFoto.set(mensagemDeErro(e));
        this.salvandoFoto.set(false);
      },
    });
  }

  // Baixa uma cópia dos dados da pessoa (JSON)
  protected baixarDados() {
    this.baixando.set(true);
    this.erro.set(null);
    this.auth.baixarMeusDados().subscribe({
      next: (arquivo) => {
        const url = URL.createObjectURL(arquivo);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'meus-dados.json';
        link.click();
        URL.revokeObjectURL(url);
        this.baixando.set(false);
      },
      error: (e: unknown) => {
        this.erro.set(mensagemDeErro(e));
        this.baixando.set(false);
      },
    });
  }

  protected abrirExclusao() {
    this.senhaExclusao.set('');
    this.erroExclusao.set(null);
    this.modalExcluir.set(true);
  }

  protected confirmarExclusao() {
    if (!this.senhaExclusao()) {
      this.erroExclusao.set('Informe a sua senha para confirmar.');
      return;
    }
    this.excluindo.set(true);
    this.erroExclusao.set(null);
    this.auth.excluirConta(this.senhaExclusao()).subscribe({
      // A conta deixou de existir: limpa a sessão local e volta ao login
      next: () => {
        this.auth.encerrarLocalmente('conta-excluida');
      },
      error: (e: unknown) => {
        this.erroExclusao.set(mensagemDeErro(e));
        this.excluindo.set(false);
      },
    });
  }
}
