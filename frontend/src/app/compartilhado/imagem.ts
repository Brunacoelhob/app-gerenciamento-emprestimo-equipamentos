const TIPOS = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_ORIGINAL = 5 * 1024 * 1024;
const MAX_CARACTERES = 70_000; // a API aceita até 80.000

/**
 * Prepara uma foto de perfil: recorta o centro em quadrado, reduz para 192x192 e devolve uma data URL pequena.
 * A API confere o conteúdo de novo: isto aqui existe para a imagem caber no limite e carregar rápido.
 */
export async function prepararAvatar(arquivo: File, lado = 192): Promise<string> {
  if (!TIPOS.includes(arquivo.type)) throw new Error('Use uma imagem PNG, JPEG ou WEBP.');
  if (arquivo.size > MAX_ORIGINAL) throw new Error('A imagem deve ter no máximo 5 MB.');

  let imagem: ImageBitmap;
  try {
    imagem = await createImageBitmap(arquivo);
  } catch {
    throw new Error('Não foi possível ler essa imagem.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = lado;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Seu navegador não conseguiu processar a imagem.');

  const menor = Math.min(imagem.width, imagem.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lado, lado);
  ctx.drawImage(
    imagem,
    (imagem.width - menor) / 2,
    (imagem.height - menor) / 2,
    menor,
    menor,
    0,
    0,
    lado,
    lado,
  );
  imagem.close();

  for (const [tipo, qualidade] of [
    ['image/webp', 0.85],
    ['image/webp', 0.6],
    ['image/jpeg', 0.7],
    ['image/jpeg', 0.5],
  ] as const) {
    const url = canvas.toDataURL(tipo, qualidade);
    if (url.startsWith(`data:${tipo}`) && url.length <= MAX_CARACTERES) return url;
  }
  throw new Error('Não foi possível reduzir essa imagem. Tente outra.');
}
