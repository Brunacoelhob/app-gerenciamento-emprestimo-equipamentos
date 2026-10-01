import { SetMetadata } from '@nestjs/common';

export const ROTA_PUBLICA = 'rotaPublica';

// Por padrão TODA rota exige login (guard global). Este decorador libera uma rota específica.
export const Publica = () => SetMetadata(ROTA_PUBLICA, true);
