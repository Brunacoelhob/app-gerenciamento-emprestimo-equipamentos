import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { lerConfiguracao } from './config/variaveis';
import { EmprestimosModule } from './emprestimos/emprestimos.module';
import { EquipamentosModule } from './equipamentos/equipamentos.module';
import { PrismaModule } from './prisma/prisma.module';
import { SaudeModule } from './saude/saude.module';
import { SessoesModule } from './sessoes/sessoes.module';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  imports: [
    // Lê e VALIDA o ambiente na partida (veja config/variaveis.ts): configuração ruim derruba o boot, não o runtime.
    ConfigModule.forRoot({ isGlobal: true, load: [() => lerConfiguracao()] }),
    // Limite geral: 100 requisições por minuto por IP. Login, cadastro e troca de senha têm limites próprios, mais rígidos.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    SessoesModule,
    UsuariosModule,
    AuthModule,
    EquipamentosModule,
    EmprestimosModule,
    SaudeModule,
  ],
  providers: [
    // A ordem importa: limite de requisições -> autenticação -> autorização.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
