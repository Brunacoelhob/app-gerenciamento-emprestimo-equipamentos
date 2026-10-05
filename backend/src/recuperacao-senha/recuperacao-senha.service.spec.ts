import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { EmailService } from '../email/email.service';
import { SessoesRepository } from '../sessoes/sessoes.repository';
import { UsuariosRepository } from '../usuarios/usuarios.repository';
import { RecuperacaoSenhaRepository } from './recuperacao-senha.repository';
import { LIMITE_POR_HORA, RecuperacaoSenhaService } from './recuperacao-senha.service';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

const conta = {
  id: 7,
  nome: 'Maria',
  email: 'maria@teste.com',
  senhaHash: 'hash-antigo',
  ativo: true,
} as never;

describe('RecuperacaoSenhaService', () => {
  let pedidos: jest.Mocked<RecuperacaoSenhaRepository>;
  let usuarios: jest.Mocked<UsuariosRepository>;
  let sessoes: jest.Mocked<SessoesRepository>;
  let email: jest.Mocked<EmailService>;
  let servico: RecuperacaoSenhaService;

  beforeEach(() => {
    pedidos = {
      criar: jest.fn(),
      buscarPorHash: jest.fn(),
      contarDaUltimaHora: jest.fn().mockResolvedValue(0),
      invalidarPendentes: jest.fn(),
      consumir: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<RecuperacaoSenhaRepository>;
    usuarios = {
      buscarPorEmailComHash: jest.fn(),
      buscarPorIdComHash: jest.fn(),
      atualizar: jest.fn(),
    } as unknown as jest.Mocked<UsuariosRepository>;
    sessoes = { revogarTodasDoUsuario: jest.fn() } as unknown as jest.Mocked<SessoesRepository>;
    email = { enviar: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<EmailService>;
    const config = {
      getOrThrow: jest.fn((chave: string) => (chave === 'appUrl' ? 'https://app.exemplo.com' : 4)),
    } as unknown as ConfigService;
    servico = new RecuperacaoSenhaService(pedidos, usuarios, sessoes, email, config, { registrar: jest.fn() } as never);
  });

  describe('solicitar', () => {
    it('conta inexistente ou desativada: não grava nem envia nada (e não revela isso)', async () => {
      usuarios.buscarPorEmailComHash.mockResolvedValueOnce(null);
      await expect(servico.solicitar('ninguem@teste.com')).resolves.toBeUndefined();
      usuarios.buscarPorEmailComHash.mockResolvedValueOnce({ ...(conta as object), ativo: false } as never);
      await expect(servico.solicitar('maria@teste.com')).resolves.toBeUndefined();
      expect(pedidos.criar).not.toHaveBeenCalled();
      expect(email.enviar).not.toHaveBeenCalled();
    });

    it('guarda só o HASH do token e manda o token puro no link do e-mail', async () => {
      usuarios.buscarPorEmailComHash.mockResolvedValue(conta);
      await servico.solicitar('maria@teste.com');

      const gravado = pedidos.criar.mock.calls[0][0];
      const mensagem = email.enviar.mock.calls[0][0];
      const token = /token=([\w-]+)/.exec(mensagem.texto)?.[1] as string;

      expect(token.length).toBeGreaterThanOrEqual(40); // 32 bytes aleatórios
      expect(gravado.tokenHash).toBe(hash(token));
      expect(gravado.tokenHash).not.toBe(token);
      expect(mensagem.texto).toContain(`https://app.exemplo.com/redefinir-senha?token=${token}`);
      expect(mensagem.para).toBe('maria@teste.com');
      expect(gravado.expiraEm.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000);
      expect(gravado.expiraEm.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
    });

    it('um pedido novo invalida os anteriores (só o link mais recente vale)', async () => {
      usuarios.buscarPorEmailComHash.mockResolvedValue(conta);
      await servico.solicitar('maria@teste.com');
      expect(pedidos.invalidarPendentes).toHaveBeenCalledWith(7);
    });

    it('limita os pedidos por hora: acima do limite não envia mais nada', async () => {
      usuarios.buscarPorEmailComHash.mockResolvedValue(conta);
      pedidos.contarDaUltimaHora.mockResolvedValue(LIMITE_POR_HORA);
      await servico.solicitar('maria@teste.com');
      expect(email.enviar).not.toHaveBeenCalled();
    });

    it('falha no envio do e-mail não quebra a resposta (e não vaza se a conta existe)', async () => {
      usuarios.buscarPorEmailComHash.mockResolvedValue(conta);
      email.enviar.mockRejectedValue(new Error('SMTP fora do ar'));
      await expect(servico.solicitar('maria@teste.com')).resolves.toBeUndefined();
    });
  });

  describe('redefinir', () => {
    const token = 'x'.repeat(43);
    const pedidoValido = () =>
      ({
        id: 1,
        usuarioId: 7,
        tokenHash: hash(token),
        usadoEm: null,
        expiraEm: new Date(Date.now() + 60_000),
      }) as never;

    it('token desconhecido, usado ou expirado: 400 com a mesma mensagem', async () => {
      const mensagens: string[] = [];
      for (const caso of [
        null,
        { ...(pedidoValido() as object), usadoEm: new Date() },
        { ...(pedidoValido() as object), expiraEm: new Date(Date.now() - 1) },
      ]) {
        pedidos.buscarPorHash.mockResolvedValue(caso as never);
        await servico.redefinir(token, 'NovaSenha123').catch((e: BadRequestException) => mensagens.push(e.message));
      }
      expect(mensagens).toHaveLength(3);
      expect(new Set(mensagens).size).toBe(1);
      expect(usuarios.atualizar).not.toHaveBeenCalled();
    });

    it('conta desativada depois do pedido: o link não funciona', async () => {
      pedidos.buscarPorHash.mockResolvedValue(pedidoValido());
      usuarios.buscarPorIdComHash.mockResolvedValue({ ...(conta as object), ativo: false } as never);
      await expect(servico.redefinir(token, 'NovaSenha123')).rejects.toBeInstanceOf(BadRequestException);
      expect(usuarios.atualizar).not.toHaveBeenCalled();
    });

    it('sucesso: grava o hash bcrypt da nova senha, encerra TODAS as sessões e avisa por e-mail', async () => {
      pedidos.buscarPorHash.mockResolvedValue(pedidoValido());
      usuarios.buscarPorIdComHash.mockResolvedValue(conta);

      await servico.redefinir(token, 'NovaSenha123');

      const { senhaHash } = usuarios.atualizar.mock.calls[0][1];
      expect(usuarios.atualizar.mock.calls[0][0]).toBe(7);
      expect(senhaHash).not.toBe('NovaSenha123');
      expect(await bcrypt.compare('NovaSenha123', senhaHash as string)).toBe(true);
      expect(sessoes.revogarTodasDoUsuario).toHaveBeenCalledWith(7);
      expect(pedidos.invalidarPendentes).toHaveBeenCalledWith(7);
      expect(email.enviar.mock.calls[0][0].assunto).toBe('Sua senha foi alterada');
    });

    it('dois usos simultâneos do mesmo link: o segundo perde (consumo atômico) e nada é alterado', async () => {
      pedidos.buscarPorHash.mockResolvedValue(pedidoValido());
      usuarios.buscarPorIdComHash.mockResolvedValue(conta);
      pedidos.consumir.mockResolvedValue(false);
      await expect(servico.redefinir(token, 'NovaSenha123')).rejects.toBeInstanceOf(BadRequestException);
      expect(usuarios.atualizar).not.toHaveBeenCalled();
      expect(sessoes.revogarTodasDoUsuario).not.toHaveBeenCalled();
    });
  });
});
