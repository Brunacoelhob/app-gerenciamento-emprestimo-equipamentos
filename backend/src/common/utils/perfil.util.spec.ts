import { apenasDigitos, avatarValido, cpfValido } from './perfil.util';

describe('cpfValido', () => {
  it('aceita um CPF com dígitos verificadores corretos', () => {
    expect(cpfValido('52998224725')).toBe(true);
  });

  it('recusa dígito verificador errado, tamanho errado e sequências repetidas', () => {
    expect(cpfValido('52998224724')).toBe(false);
    expect(cpfValido('5299822472')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
    expect(cpfValido('abcdefghijk')).toBe(false);
  });
});

describe('apenasDigitos', () => {
  it('remove máscara e mantém valores que não são texto', () => {
    expect(apenasDigitos('529.982.247-25')).toBe('52998224725');
    expect(apenasDigitos(null)).toBeNull();
  });
});

describe('avatarValido', () => {
  const png =
    'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]).toString('base64');
  const webp =
    'data:image/webp;base64,' +
    Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBP')]).toString('base64');

  it('aceita itens do acervo e imagens png, jpeg e webp de verdade', () => {
    expect(avatarValido('animal:gato')).toBe(true);
    expect(avatarValido(png)).toBe(true);
    expect(avatarValido(jpeg)).toBe(true);
    expect(avatarValido(webp)).toBe(true);
  });

  it('recusa animal fora do acervo, SVG, tipo declarado que não bate com o arquivo e texto grande demais', () => {
    expect(avatarValido('animal:unicornio')).toBe(false);
    expect(avatarValido('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(false);
    expect(avatarValido('data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64'))).toBe(
      false,
    );
    expect(avatarValido(png.replace('png', 'jpeg'))).toBe(false);
    expect(avatarValido('data:image/png;base64,' + 'A'.repeat(80_001))).toBe(false);
    expect(avatarValido('https://exemplo.com/foto.png')).toBe(false);
  });
});
