import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export type FormatoRelatorio = 'pdf' | 'xlsx' | 'csv';

export interface ColunaRelatorio {
  chave: string;
  titulo: string;
  /** Largura relativa da coluna (no PDF, proporcional; no Excel, em caracteres). */
  largura: number;
}

export type CelulaRelatorio = string | number | null | undefined;

export interface DadosRelatorio {
  titulo: string;
  /** Linha de contexto sob o título (ex.: filtros aplicados e quando foi gerado). */
  subtitulo?: string;
  colunas: ColunaRelatorio[];
  linhas: Record<string, CelulaRelatorio>[];
}

export interface ArquivoRelatorio {
  buffer: Buffer;
  tipo: string;
  extensao: FormatoRelatorio;
}

const TIPOS: Record<FormatoRelatorio, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

/**
 * Neutraliza "injeção de fórmula": uma célula de texto que começa com = + - @ (ou tabulação/retorno) é executada como
 * fórmula pelo Excel e pelo LibreOffice ao abrir o arquivo. O texto vem do que as pessoas digitam (nome de
 * equipamento, por exemplo), então não pode ser confiado. O apóstrofo faz a planilha tratar a célula como texto.
 */
export function neutralizarFormula(valor: string): string {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

const texto = (valor: CelulaRelatorio) => (valor === null || valor === undefined ? '' : String(valor));

@Injectable()
export class RelatoriosService {
  async gerar(formato: FormatoRelatorio, dados: DadosRelatorio): Promise<ArquivoRelatorio> {
    const buffer =
      formato === 'csv' ? this.csv(dados) : formato === 'xlsx' ? await this.xlsx(dados) : await this.pdf(dados);
    return { buffer, tipo: TIPOS[formato], extensao: formato };
  }

  // CSV para o Excel em português: separador ";", BOM UTF-8 (senão os acentos quebram) e quebras de linha CRLF.
  // Só cabeçalho e linhas: texto de título quebraria a leitura por outros programas.
  private csv({ colunas, linhas }: DadosRelatorio): Buffer {
    const celula = (valor: CelulaRelatorio) => `"${neutralizarFormula(texto(valor)).replace(/"/g, '""')}"`;
    const corpo = [colunas.map((c) => celula(c.titulo)).join(';')];
    for (const linha of linhas) corpo.push(colunas.map((c) => celula(linha[c.chave])).join(';'));
    return Buffer.from('﻿' + corpo.join('\r\n') + '\r\n', 'utf8');
  }

  private async xlsx({ titulo, subtitulo, colunas, linhas }: DadosRelatorio): Promise<Buffer> {
    const livro = new ExcelJS.Workbook();
    livro.creator = 'Equipment loan';
    livro.created = new Date();
    const planilha = livro.addWorksheet(titulo.slice(0, 31), { views: [{ state: 'frozen', ySplit: 4 }] });

    planilha.getCell('A1').value = titulo;
    planilha.getCell('A1').font = { bold: true, size: 14 };
    if (subtitulo) {
      planilha.getCell('A2').value = subtitulo;
      planilha.getCell('A2').font = { italic: true, color: { argb: 'FF5B6676' } };
    }

    const cabecalho = planilha.getRow(4);
    colunas.forEach((c, i) => {
      const celula = cabecalho.getCell(i + 1);
      celula.value = c.titulo;
      celula.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2457C5' } };
      celula.alignment = { vertical: 'middle' };
      planilha.getColumn(i + 1).width = c.largura;
    });
    cabecalho.height = 22;

    linhas.forEach((linha, n) => {
      const r = planilha.getRow(5 + n);
      colunas.forEach((c, i) => {
        const valor = linha[c.chave];
        // Texto fica sempre como TEXTO (nunca vira fórmula); números continuam números
        r.getCell(i + 1).value = typeof valor === 'number' ? valor : texto(valor);
        r.getCell(i + 1).alignment = { vertical: 'top', wrapText: true };
      });
      if (n % 2 === 1)
        r.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F9' } }));
    });

    if (colunas.length > 0) {
      planilha.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: colunas.length } };
    }
    return Buffer.from(await livro.xlsx.writeBuffer());
  }

  // PDF em paisagem, com o cabeçalho repetido em cada página e numeração no rodapé
  private pdf({ titulo, subtitulo, colunas, linhas }: DadosRelatorio): Promise<Buffer> {
    return new Promise((resolver, rejeitar) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 30,
        bufferPages: true,
        info: { Title: titulo },
      });
      const partes: Buffer[] = [];
      doc.on('data', (p: Buffer) => partes.push(p));
      doc.on('end', () => resolver(Buffer.concat(partes)));
      doc.on('error', rejeitar);

      const esquerda = doc.page.margins.left;
      const largura = doc.page.width - esquerda - doc.page.margins.right;
      const soma = colunas.reduce((t, c) => t + c.largura, 0);
      const larguras = colunas.map((c) => (c.largura / soma) * largura);
      const base = doc.page.height - doc.page.margins.bottom - 18; // espaço do rodapé
      const RECUO = 4;

      const cabecalho = () => {
        const y = doc.y;
        doc.rect(esquerda, y, largura, 20).fill('#2457c5');
        let x = esquerda;
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
        colunas.forEach((c, i) => {
          doc.text(c.titulo, x + RECUO, y + 6, { width: larguras[i] - RECUO * 2, lineBreak: false, ellipsis: true });
          x += larguras[i];
        });
        doc.y = y + 20;
        doc.fillColor('#1c2430');
      };

      doc.font('Helvetica-Bold').fontSize(16).fillColor('#1c2430').text(titulo, esquerda, 30);
      if (subtitulo)
        doc.moveDown(0.2).font('Helvetica').fontSize(9).fillColor('#5b6676').text(subtitulo, { width: largura });
      doc.moveDown(0.8);
      cabecalho();

      doc.font('Helvetica').fontSize(8.5);
      linhas.forEach((linha, n) => {
        const celulas = colunas.map((c) => texto(linha[c.chave]));
        const altura =
          Math.max(...celulas.map((t, i) => doc.heightOfString(t, { width: larguras[i] - RECUO * 2 })), 10) + RECUO * 2;

        if (doc.y + altura > base) {
          doc.addPage();
          cabecalho();
          doc.font('Helvetica').fontSize(8.5);
        }
        const y = doc.y;
        if (n % 2 === 1) doc.rect(esquerda, y, largura, altura).fill('#f4f6f9');
        doc.fillColor('#1c2430');
        let x = esquerda;
        celulas.forEach((t, i) => {
          doc.text(t, x + RECUO, y + RECUO, { width: larguras[i] - RECUO * 2 });
          x += larguras[i];
        });
        doc.y = y + altura;
      });

      if (linhas.length === 0)
        doc.moveDown().font('Helvetica-Oblique').fillColor('#5b6676').text('Nenhum registro encontrado.', esquerda);

      // Rodapé com a página em todas as páginas
      const paginas = doc.bufferedPageRange();
      for (let i = 0; i < paginas.count; i++) {
        doc.switchToPage(paginas.start + i);
        doc.font('Helvetica').fontSize(8).fillColor('#5b6676');
        doc.text(`Página ${i + 1} de ${paginas.count}`, esquerda, doc.page.height - doc.page.margins.bottom - 8, {
          width: largura,
          align: 'right',
          lineBreak: false,
        });
      }
      doc.end();
    });
  }
}

/** Formata "dd/mm/aaaa" e "hh:mm" no fuso configurado, para as colunas de data e hora dos relatórios. */
export function formatadoresDeData(fuso: string) {
  const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return {
    data: (d: Date | null) => (d ? dia.format(d) : ''),
    hora: (d: Date | null) => (d ? hora.format(d) : ''),
    agora: () => `${dia.format(new Date())} às ${hora.format(new Date())} (${fuso})`,
  };
}

export const LIMITE_RELATORIO_LISTAS = 5000;
