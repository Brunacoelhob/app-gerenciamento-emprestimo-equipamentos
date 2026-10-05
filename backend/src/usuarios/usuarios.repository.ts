import { Injectable } from '@nestjs/common';
import { Prisma, Role, Usuario } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Campos públicos de um usuário. O hash da senha NUNCA entra aqui: só os métodos de login o devolvem.
const PUBLICOS = {
  id: true,
  nome: true,
  email: true,
  role: true,
  ativo: true,
  cpf: true,
  telefone: true,
  cep: true,
  logradouro: true,
  numero: true,
  complemento: true,
  bairro: true,
  cidade: true,
  uf: true,
  avatar: true,
  criadoEm: true,
} as const;
export type UsuarioPublico = Prisma.UsuarioGetPayload<{ select: typeof PUBLICOS }>;

export interface FiltroUsuarios {
  role?: Role;
  ativo?: boolean;
  busca?: string;
}

// Única porta de acesso ao banco para usuários: o serviço decide as regras, aqui só se consulta e grava.
@Injectable()
export class UsuariosRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Devolve null se o e-mail já existir (violação do índice único), em vez de lançar erro do Prisma. */
  async criar(dados: { nome: string; email: string; senhaHash: string; role: Role }): Promise<UsuarioPublico | null> {
    try {
      return await this.prisma.usuario.create({ data: dados, select: PUBLICOS });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') return null;
      throw erro;
    }
  }

  /** Edita o perfil. Devolve o campo em conflito ("email" ou "cpf") se o valor já pertencer a outra conta. */
  async atualizarPerfil(
    id: number,
    dados: Prisma.UsuarioUpdateInput,
  ): Promise<{ usuario: UsuarioPublico } | { conflito: 'email' | 'cpf' }> {
    try {
      return { usuario: await this.prisma.usuario.update({ where: { id }, data: dados, select: PUBLICOS }) };
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        return { conflito: JSON.stringify(erro.meta ?? {}).includes('cpf') ? 'cpf' : 'email' };
      }
      throw erro;
    }
  }

  /** Para login: inclui o hash da senha. */
  buscarPorEmailComHash(email: string): Promise<Usuario | null> {
    return this.prisma.usuario.findUnique({ where: { email } });
  }

  buscarPorIdComHash(id: number): Promise<Usuario | null> {
    return this.prisma.usuario.findUnique({ where: { id } });
  }

  buscarPorId(id: number): Promise<UsuarioPublico | null> {
    return this.prisma.usuario.findUnique({ where: { id }, select: PUBLICOS });
  }

  /** Conferido a CADA requisição autenticada: papel e situação sempre atuais, nunca os do token. */
  buscarAutenticacao(id: number): Promise<{ id: number; role: Role; ativo: boolean } | null> {
    return this.prisma.usuario.findUnique({ where: { id }, select: { id: true, role: true, ativo: true } });
  }

  async listar(filtro: FiltroUsuarios, intervalo: { skip: number; take: number }) {
    const where: Prisma.UsuarioWhereInput = {
      ...(filtro.role && { role: filtro.role }),
      ...(filtro.ativo !== undefined && { ativo: filtro.ativo }),
      ...(filtro.busca?.trim() && {
        OR: [
          { nome: { contains: filtro.busca.trim(), mode: 'insensitive' } },
          { email: { contains: filtro.busca.trim().toLowerCase() } },
        ],
      }),
    };
    const [total, itens] = await Promise.all([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.findMany({ where, select: PUBLICOS, orderBy: { id: 'asc' }, ...intervalo }),
    ]);
    return { total, itens };
  }

  atualizar(id: number, dados: { role?: Role; ativo?: boolean; senhaHash?: string }): Promise<UsuarioPublico> {
    return this.prisma.usuario.update({ where: { id }, data: dados, select: PUBLICOS });
  }

  contarAdminsAtivos(): Promise<number> {
    return this.prisma.usuario.count({ where: { role: Role.ADMIN, ativo: true } });
  }
}
