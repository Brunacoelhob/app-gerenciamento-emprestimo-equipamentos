import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Role } from '../../generated/prisma/enums';
import { intervalo, montarPagina } from '../common/dto/pagina';
import { EmailService } from '../email/email.service';
import { emailContaCriada } from '../email/modelos';
import { SessoesRepository } from '../sessoes/sessoes.repository';
import { AtualizarPerfilDto } from './dto/atualizar-perfil.dto';
import { AtualizarUsuarioDto } from './dto/atualizar-usuario.dto';
import { CriarUsuarioDto } from './dto/criar-usuario.dto';
import { ListarUsuariosDto } from './dto/listar-usuarios.dto';
import { UsuariosRepository } from './usuarios.repository';

// Gestão de contas pelo ADMIN. As regras que protegem o sistema de ficar sem administrador ficam aqui.
@Injectable()
export class UsuariosService {
  constructor(
    private readonly usuarios: UsuariosRepository,
    private readonly sessoes: SessoesRepository,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async criar(dto: CriarUsuarioDto) {
    const senhaHash = await bcrypt.hash(dto.senha, this.config.getOrThrow<number>('bcryptCusto'));
    const criado = await this.usuarios.criar({
      nome: dto.nome,
      email: dto.email,
      senhaHash,
      role: dto.role ?? Role.USER,
    });
    if (!criado) throw new ConflictException('Já existe um usuário com esse e-mail.');

    // Avisa a pessoa de que a conta existe (a senha NUNCA vai no e-mail: quem criou a combina por outro canal).
    // Em segundo plano: falha de e-mail não desfaz a criação.
    this.email
      .enviar(
        emailContaCriada({
          para: criado.email,
          nome: criado.nome,
          link: `${this.config.getOrThrow<string>('appUrl')}/login`,
        }),
      )
      .catch(() => undefined);
    return criado;
  }

  async listar(dto: ListarUsuariosDto) {
    const { total, itens } = await this.usuarios.listar(
      { role: dto.role, ativo: dto.ativo, busca: dto.busca },
      intervalo(dto),
    );
    return montarPagina(itens, total, dto);
  }

  async obter(id: number) {
    const usuario = await this.usuarios.buscarPorId(id);
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');
    return usuario;
  }

  // Edição do próprio perfil (quem chama é sempre o dono da conta: o id vem do token, nunca do corpo).
  async atualizarPerfil(id: number, dto: AtualizarPerfilDto) {
    const resultado = await this.usuarios.atualizarPerfil(id, dto);
    if ('conflito' in resultado) {
      throw new ConflictException(
        resultado.conflito === 'cpf' ? 'Já existe um usuário com esse CPF.' : 'Já existe um usuário com esse e-mail.',
      );
    }
    return resultado.usuario;
  }

  async atualizar(id: number, dto: AtualizarUsuarioDto, idDoAdmin: number) {
    const atual = await this.obter(id);

    const rebaixa = dto.role !== undefined && dto.role !== atual.role && atual.role === Role.ADMIN;
    const desativa = dto.ativo === false && atual.ativo;

    // Um admin não mexe nas próprias permissões: evita se trancar para fora por engano.
    if (id === idDoAdmin && (rebaixa || desativa)) {
      throw new ForbiddenException('Você não pode rebaixar nem desativar a sua própria conta.');
    }
    // Nunca deixar o sistema sem nenhum administrador ativo.
    if (
      atual.role === Role.ADMIN &&
      atual.ativo &&
      (rebaixa || desativa) &&
      (await this.usuarios.contarAdminsAtivos()) <= 1
    ) {
      throw new ConflictException('Não é possível remover o último administrador ativo.');
    }

    const atualizado = await this.usuarios.atualizar(id, { role: dto.role, ativo: dto.ativo });
    // Desativar ou rebaixar encerra as sessões: o refresh token antigo deixa de valer na hora.
    if (desativa || rebaixa) await this.sessoes.revogarTodasDoUsuario(id);
    return atualizado;
  }
}
