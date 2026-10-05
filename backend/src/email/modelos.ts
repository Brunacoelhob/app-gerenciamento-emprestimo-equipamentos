import type { Mensagem } from './email.service';

// Textos dos e-mails. O HTML é montado com valores escapados: o nome da pessoa vem de um campo livre.
const escapar = (texto: string) =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function moldura(titulo: string, corpo: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f6f9;font-family:Arial,sans-serif;color:#1c2430">
<div style="max-width:520px;margin:0 auto;padding:24px">
<div style="background:#ffffff;border:1px solid #d5dbe3;border-radius:12px;padding:28px">
<h1 style="margin:0 0 16px;font-size:20px">${escapar(titulo)}</h1>
${corpo}
</div>
<p style="color:#5b6676;font-size:12px;margin:16px 4px">Empréstimo de Equipamentos. Este é um e-mail automático: não responda.</p>
</div></body></html>`;
}

export function emailRecuperacaoSenha(dados: {
  para: string;
  nome: string;
  link: string;
  validadeMinutos: number;
}): Mensagem {
  const { para, nome, link, validadeMinutos } = dados;
  return {
    para,
    assunto: 'Redefinição de senha',
    texto: [
      `Olá, ${nome}.`,
      '',
      'Recebemos um pedido para redefinir a sua senha. Para escolher uma nova, abra o link abaixo:',
      link,
      '',
      `O link vale por ${validadeMinutos} minutos e só pode ser usado uma vez.`,
      'Se não foi você, ignore este e-mail: a sua senha continua a mesma.',
    ].join('\n'),
    html: moldura(
      'Redefinição de senha',
      `<p>Olá, ${escapar(nome)}.</p>
<p>Recebemos um pedido para redefinir a sua senha. Para escolher uma nova, use o botão abaixo:</p>
<p style="margin:24px 0"><a href="${escapar(link)}" style="background:#2457c5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">Escolher uma nova senha</a></p>
<p style="font-size:13px;color:#5b6676">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="word-break:break-all">${escapar(link)}</span></p>
<p>O link vale por ${validadeMinutos} minutos e só pode ser usado uma vez.</p>
<p>Se não foi você, ignore este e-mail: a sua senha continua a mesma.</p>`,
    ),
  };
}

export function emailSenhaAlterada(dados: { para: string; nome: string }): Mensagem {
  const { para, nome } = dados;
  return {
    para,
    assunto: 'Sua senha foi alterada',
    texto: [
      `Olá, ${nome}.`,
      '',
      'A senha da sua conta acabou de ser alterada e todas as sessões abertas foram encerradas.',
      'Se foi você, não precisa fazer nada.',
      'Se NÃO foi você, peça uma nova senha agora na tela de login ("Esqueci minha senha") e avise o administrador.',
    ].join('\n'),
    html: moldura(
      'Sua senha foi alterada',
      `<p>Olá, ${escapar(nome)}.</p>
<p>A senha da sua conta acabou de ser alterada e todas as sessões abertas foram encerradas.</p>
<p>Se foi você, não precisa fazer nada.</p>
<p><strong>Se não foi você</strong>, peça uma nova senha agora na tela de login ("Esqueci minha senha") e avise o administrador.</p>`,
    ),
  };
}

const data = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export function emailLembreteDevolucao(dados: {
  para: string;
  nome: string;
  equipamento: string;
  prazo: Date;
  link: string;
}): Mensagem {
  const { para, nome, equipamento, prazo, link } = dados;
  return {
    para,
    assunto: `Devolução de "${equipamento}" até ${data(prazo)}`,
    texto: [
      `Olá, ${nome}.`,
      '',
      `Lembrete: o prazo para devolver "${equipamento}" termina em ${data(prazo)}.`,
      'Devolva dentro do prazo para que outras pessoas possam usar o equipamento.',
      '',
      `Seus empréstimos: ${link}`,
    ].join('\n'),
    html: moldura(
      'Lembrete de devolução',
      `<p>Olá, ${escapar(nome)}.</p>
<p>O prazo para devolver <strong>${escapar(equipamento)}</strong> termina em <strong>${data(prazo)}</strong>.</p>
<p>Devolva dentro do prazo para que outras pessoas possam usar o equipamento.</p>
<p style="margin:24px 0"><a href="${escapar(link)}" style="background:#2457c5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">Ver meus empréstimos</a></p>`,
    ),
  };
}

export function emailEmprestimoAtrasado(dados: {
  para: string;
  nome: string;
  equipamento: string;
  prazo: Date;
  diasDeAtraso: number;
  link: string;
}): Mensagem {
  const { para, nome, equipamento, prazo, diasDeAtraso, link } = dados;
  const dias = `${diasDeAtraso} ${diasDeAtraso === 1 ? 'dia' : 'dias'}`;
  return {
    para,
    assunto: `Empréstimo atrasado: "${equipamento}"`,
    texto: [
      `Olá, ${nome}.`,
      '',
      `O prazo para devolver "${equipamento}" venceu em ${data(prazo)} (${dias} de atraso).`,
      'Por favor, devolva o equipamento assim que puder: outras pessoas podem estar esperando por ele.',
      '',
      `Seus empréstimos: ${link}`,
    ].join('\n'),
    html: moldura(
      'Empréstimo atrasado',
      `<p>Olá, ${escapar(nome)}.</p>
<p>O prazo para devolver <strong>${escapar(equipamento)}</strong> venceu em <strong>${data(prazo)}</strong> (${dias} de atraso).</p>
<p>Por favor, devolva o equipamento assim que puder: outras pessoas podem estar esperando por ele.</p>
<p style="margin:24px 0"><a href="${escapar(link)}" style="background:#b3261e;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">Ver meus empréstimos</a></p>`,
    ),
  };
}

export function emailResumoAtrasos(dados: {
  para: string;
  nome: string;
  itens: { equipamento: string; pessoa: string; diasDeAtraso: number }[];
  link: string;
}): Mensagem {
  const { para, nome, itens, link } = dados;
  const linhas = itens.map(
    (i) => `${i.equipamento}: ${i.pessoa} (${i.diasDeAtraso} ${i.diasDeAtraso === 1 ? 'dia' : 'dias'})`,
  );
  return {
    para,
    assunto: `${itens.length} ${itens.length === 1 ? 'empréstimo atrasado' : 'empréstimos atrasados'} hoje`,
    texto: [
      `Olá, ${nome}.`,
      '',
      'Empréstimos que estão com a devolução atrasada:',
      ...linhas.map((l) => `- ${l}`),
      '',
      `Painel: ${link}`,
    ].join('\n'),
    html: moldura(
      'Resumo de atrasos',
      `<p>Olá, ${escapar(nome)}.</p>
<p>Empréstimos que estão com a devolução atrasada:</p>
<ul>${linhas.map((l) => `<li>${escapar(l)}</li>`).join('')}</ul>
<p style="margin:24px 0"><a href="${escapar(link)}" style="background:#2457c5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">Abrir o painel</a></p>`,
    ),
  };
}

export function emailContaRemovida(dados: { para: string; nome: string }): Mensagem {
  const { para, nome } = dados;
  return {
    para,
    assunto: 'Sua conta foi excluída',
    texto: [
      `Olá, ${nome}.`,
      '',
      'Conforme o seu pedido, a sua conta foi excluída: o seu nome, e-mail, CPF, telefone, endereço e foto foram apagados.',
      'O histórico de empréstimos dos equipamentos continua, sem identificar você.',
      'Se não foi você quem pediu, procure o administrador do sistema imediatamente.',
    ].join('\n'),
    html: moldura(
      'Sua conta foi excluída',
      `<p>Olá, ${escapar(nome)}.</p>
<p>Conforme o seu pedido, a sua conta foi excluída: o seu nome, e-mail, CPF, telefone, endereço e foto foram apagados.</p>
<p>O histórico de empréstimos dos equipamentos continua, sem identificar você.</p>
<p><strong>Se não foi você</strong> quem pediu, procure o administrador do sistema imediatamente.</p>`,
    ),
  };
}
