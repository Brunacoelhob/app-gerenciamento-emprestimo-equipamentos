// Nomes do acervo de avatares (imagens em frontend/public/avatares/<nome>.svg).
export const AVATARES_ANIMAIS = [
  'cachorro',
  'gato',
  'raposa',
  'panda',
  'coala',
  'leao',
  'sapo',
  'macaco',
  'pinguim',
  'coruja',
  'tartaruga',
  'polvo',
  'girafa',
  'elefante',
  'onca',
  'tucano',
  'jacare',
  'dinossauro',
  'dragao',
  'peixe',
  'tubarao',
  'baleia',
  'arraia',
  'estrela-do-mar',
  'urso-polar',
  'urso-da-floresta',
  'cobra',
  'coelho',
  'hamster',
] as const;

// Limite do avatar enviado (data URL em texto). O cliente reduz a imagem antes; o servidor não confia nisso.
export const AVATAR_MAX_CARACTERES = 80_000;

export function apenasDigitos(valor: unknown): unknown {
  return typeof valor === 'string' ? valor.replace(/\D/g, '') : valor;
}

/** Valida o CPF pelos dígitos verificadores (rejeita sequências repetidas como 111.111.111-11). */
export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (tamanho: number) => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

/**
 * Aceita "animal:<nome do acervo>" ou uma imagem em data URL (png, jpeg ou webp).
 * Confere os bytes iniciais do arquivo: o tipo declarado no texto não basta (SVG e HTML são recusados).
 */
export function avatarValido(valor: string): boolean {
  if (valor.length > AVATAR_MAX_CARACTERES) return false;

  if (valor.startsWith('animal:')) return (AVATARES_ANIMAIS as readonly string[]).includes(valor.slice(7));

  const dados = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(valor);
  if (!dados) return false;
  const inicio = Buffer.from(dados[2].slice(0, 24), 'base64');
  switch (dados[1]) {
    case 'png':
      return inicio.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    case 'jpeg':
      return inicio.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    default: // webp: "RIFF" .... "WEBP"
      return inicio.subarray(0, 4).toString('ascii') === 'RIFF' && inicio.subarray(8, 12).toString('ascii') === 'WEBP';
  }
}

export const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const FOTO_MAX_BYTES = 400 * 1024;

/** Confere os bytes iniciais: o cabeçalho Content-Type sozinho não basta (SVG e HTML disfarçados são recusados). */
export function fotoValida(tipo: string, dados: Buffer): boolean {
  if (dados.length === 0 || dados.length > FOTO_MAX_BYTES) return false;
  switch (tipo) {
    case 'image/png':
      return dados.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    case 'image/jpeg':
      return dados.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    case 'image/webp':
      return dados.subarray(0, 4).toString('ascii') === 'RIFF' && dados.subarray(8, 12).toString('ascii') === 'WEBP';
    default:
      return false;
  }
}
