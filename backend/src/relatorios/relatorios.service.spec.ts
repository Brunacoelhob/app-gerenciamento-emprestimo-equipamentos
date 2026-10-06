import * as ExcelJS from 'exceljs';
import { DadosRelatorio, neutralizarFormula, RelatoriosService } from './relatorios.service';

const colunas = [
  { chave: 'data', titulo: 'Data', largura: 11 },
  { chave: 'quem', titulo: 'Quem', largura: 20 },
  { chave: 'detalhes', titulo: 'Detalhes', largura: 40 },
];

const dados = (linhas: DadosRelatorio['linhas']): DadosRelatorio => ({
  titulo: 'Relatório de teste',
  subtitulo: 'Gerado para o teste',
  colunas,
  linhas,
});

describe('neutralizarFormula', () => {
  it('prefixa com apóstrofo o que uma planilha executaria como fórmula', () => {
    for (const perigoso of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx']) {
      expect(neutralizarFormula(perigoso)).toBe(`'${perigoso}`);
    }
  });

  it('não mexe em texto comum, nem no que só contém o sinal no meio', () => {
    for (const comum of ['Maria', 'a=b', '1+1', 'e-mail', '', 'Notebook - Dell']) {
      expect(neutralizarFormula(comum)).toBe(comum);
    }
  });
});

describe('RelatoriosService', () => {
  const servico = new RelatoriosService();

  describe('CSV', () => {
    it('abre certo no Excel em português: BOM UTF-8, separador ";", CRLF e acentos preservados', async () => {
      const { buffer, tipo, extensao } = await servico.gerar(
        'csv',
        dados([{ data: '06/10/2026', quem: 'João Çâmara', detalhes: 'Perfil: Administrador' }]),
      );
      expect(tipo).toBe('text/csv; charset=utf-8');
      expect(extensao).toBe('csv');
      expect([...buffer.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM
      const linhas = buffer.toString('utf8').slice(1).split('\r\n');
      expect(linhas[0]).toBe('"Data";"Quem";"Detalhes"');
      expect(linhas[1]).toBe('"06/10/2026";"João Çâmara";"Perfil: Administrador"');
    });

    it('escapa aspas, ponto e vírgula e quebras de linha dentro da célula', async () => {
      const { buffer } = await servico.gerar(
        'csv',
        dados([{ data: 'x', quem: 'Ele disse "oi"; tchau', detalhes: 'linha 1\nlinha 2' }]),
      );
      const texto = buffer.toString('utf8');
      expect(texto).toContain('"Ele disse ""oi""; tchau"');
      expect(texto).toContain('"linha 1\nlinha 2"');
    });

    it('neutraliza injeção de fórmula: nenhuma célula de texto começa com = + - @', async () => {
      const { buffer } = await servico.gerar(
        'csv',
        dados([{ data: '1', quem: '=HYPERLINK("http://mau.com")', detalhes: '@SUM(1)' }]),
      );
      const texto = buffer.toString('utf8');
      expect(texto).toContain(`"'=HYPERLINK(""http://mau.com"")"`);
      expect(texto).toContain(`"'@SUM(1)"`);
      expect(texto).not.toMatch(/;"[=+\-@]/); // nenhuma célula começa com sinal de fórmula
    });

    it('valores vazios viram células vazias e o arquivo sem linhas traz só o cabeçalho', async () => {
      const { buffer } = await servico.gerar('csv', dados([{ data: null, quem: undefined, detalhes: '' }]));
      expect(buffer.toString('utf8')).toContain('"";"";""');
      const vazio = await servico.gerar('csv', dados([]));
      expect(vazio.buffer.toString('utf8').trim().split('\r\n')).toHaveLength(1);
    });
  });

  describe('Excel (xlsx)', () => {
    it('gera uma planilha de verdade: título, cabeçalho, linhas, filtro e cabeçalho congelado', async () => {
      const { buffer, tipo } = await servico.gerar(
        'xlsx',
        dados([
          { data: '06/10/2026', quem: 'Maria', detalhes: 'a' },
          { data: '05/10/2026', quem: 'João', detalhes: 'b' },
        ]),
      );
      expect(tipo).toContain('spreadsheetml');
      expect(buffer.subarray(0, 2).toString()).toBe('PK'); // é um zip

      const livro = new ExcelJS.Workbook();
      await livro.xlsx.load(buffer as never);
      const planilha = livro.worksheets[0];
      expect(planilha.getCell('A1').value).toBe('Relatório de teste');
      expect(planilha.getCell('A2').value).toBe('Gerado para o teste');
      expect([1, 2, 3].map((c) => planilha.getRow(4).getCell(c).value)).toEqual(['Data', 'Quem', 'Detalhes']);
      expect(planilha.getRow(5).getCell(2).value).toBe('Maria');
      expect(planilha.getRow(6).getCell(2).value).toBe('João');
      expect(planilha.rowCount).toBe(6);
      expect(planilha.autoFilter).toBeTruthy();
      expect(planilha.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });
    });

    it('texto que parece fórmula continua sendo TEXTO na planilha (nunca vira fórmula)', async () => {
      const { buffer } = await servico.gerar('xlsx', dados([{ data: '1', quem: '=1+1', detalhes: '@SUM(A1)' }]));
      const livro = new ExcelJS.Workbook();
      await livro.xlsx.load(buffer as never);
      const celula = livro.worksheets[0].getRow(5).getCell(2);
      expect(celula.type).toBe(ExcelJS.ValueType.String);
      expect(celula.value).toBe('=1+1');
      expect(celula.formula).toBeUndefined();
    });
  });

  describe('PDF', () => {
    it('gera um PDF válido em paisagem, com título e rodapé de páginas', async () => {
      const { buffer, tipo } = await servico.gerar(
        'pdf',
        dados([{ data: '06/10/2026', quem: 'Maria', detalhes: 'x' }]),
      );
      expect(tipo).toBe('application/pdf');
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
      expect(buffer.subarray(-10).toString()).toContain('%%EOF');
    });

    it('com muitas linhas quebra em várias páginas (o cabeçalho se repete, nada é cortado)', async () => {
      const muitas = Array.from({ length: 120 }, (_, i) => ({
        data: `${i}`,
        quem: `Pessoa ${i}`,
        detalhes: 'Detalhe de teste '.repeat(4),
      }));
      const { buffer } = await servico.gerar('pdf', dados(muitas));
      const paginas = (buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
      expect(paginas).toBeGreaterThan(2);
    });

    it('sem linhas ainda gera um PDF (com a mensagem de vazio)', async () => {
      const { buffer } = await servico.gerar('pdf', dados([]));
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });
});
