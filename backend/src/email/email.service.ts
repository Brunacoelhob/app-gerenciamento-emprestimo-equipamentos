import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface Mensagem {
  para: string;
  assunto: string;
  texto: string;
  html: string;
}

// Envio de e-mail por SMTP genérico (qualquer provedor). Sem SMTP_HOST:
//  - em desenvolvimento, o e-mail é só escrito no log (nada sai da máquina);
//  - em produção, o envio falha: o conteúdo NUNCA vai para o log, porque os e-mails de recuperação de senha
//    carregam um link que equivale a uma credencial.
@Injectable()
export class EmailService {
  private readonly log = new Logger('Email');
  private readonly transporte: nodemailer.Transporter | null;
  private readonly remetente: string;
  private readonly producao: boolean;

  constructor(config: ConfigService) {
    const host = config.getOrThrow<string>('smtpHost');
    const usuario = config.getOrThrow<string>('smtpUsuario');
    this.remetente = config.getOrThrow<string>('emailRemetente');
    this.producao = config.getOrThrow<string>('ambiente') === 'production';

    this.transporte = host
      ? nodemailer.createTransport({
          host,
          port: config.getOrThrow<number>('smtpPorta'),
          secure: config.getOrThrow<boolean>('smtpSeguro'),
          auth: usuario ? { user: usuario, pass: config.getOrThrow<string>('smtpSenha') } : undefined,
        })
      : null;

    if (!this.transporte) {
      this.log.warn(
        this.producao
          ? 'SMTP_HOST não configurado: os e-mails (recuperação de senha) NÃO serão enviados.'
          : 'SMTP_HOST não configurado: os e-mails serão apenas escritos no log (modo de desenvolvimento).',
      );
    }
  }

  async enviar(mensagem: Mensagem): Promise<void> {
    if (!this.transporte) {
      if (this.producao) throw new Error('SMTP não configurado.');
      this.log.log(`[e-mail simulado] para: ${mensagem.para} | assunto: ${mensagem.assunto}\n${mensagem.texto}`);
      return;
    }
    await this.transporte.sendMail({
      from: this.remetente,
      to: mensagem.para,
      subject: mensagem.assunto,
      text: mensagem.texto,
      html: mensagem.html,
    });
  }
}
