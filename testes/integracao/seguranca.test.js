/**
 * Correções da auditoria de segurança que dependem do banco: limite de
 * tentativas de login e de recuperação de senha, IP atrás de proxy e
 * isolamento da tabela de tentativas.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { NextRequest } from 'next/server';
import { prepararConexao } from '@/infraestrutura/banco/ssl.js';
import { fecharPool } from '@/infraestrutura/banco/pool.js';
import { gerarHash } from '@/infraestrutura/seguranca/senha.js';
import { entrar } from '@/aplicacao/autenticacao/entrar.js';
import { pedirRecuperacao, redefinirSenha } from '@/aplicacao/autenticacao/recuperar-senha.js';
import { REGRAS, esquecerFalhasDaConta } from '@/infraestrutura/seguranca/tentativas.js';
import { ipDaRequisicao } from '@/infraestrutura/http/limite.js';
import { ErroDeNegocio } from '@/dominio/erros.js';

const URL_APP = process.env.DATABASE_URL ?? '';
const URL_ADMIN = process.env.DATABASE_URL_ADMIN ?? '';
const rodar = URL_APP.length > 0 && URL_ADMIN.length > 0;

/** @type {import('pg').Client} */ let admin;
/** @type {import('pg').Client} */ let app;

const sufixo = Date.now();
const EMAIL = `seguranca.${sufixo}@teste.br`;
const SENHA = 'senhaCorreta123';
let usuarioId = '';
/** IPs de documentação (RFC 5737), um por cenário, para os cenários não se somarem. */
const ip = (n) => `198.51.100.${n}`;

/** @param {Promise<unknown>} p */
const muitasTentativas = (p) => assert.rejects(p,
  (e) => e instanceof ErroDeNegocio && e.codigo === 'MUITAS_TENTATIVAS' && e.status === 429);

before(async () => {
  if (!rodar) return;
  admin = new pg.Client(prepararConexao(URL_ADMIN));
  app = new pg.Client(prepararConexao(URL_APP));
  await admin.connect();
  await app.connect();
  const { rows } = await admin.query(
    `insert into usuario (nome, email, papel, senha_hash) values ('Seg', $1, 'diretoria', $2) returning id`,
    [EMAIL, await gerarHash(SENHA)]);
  usuarioId = rows[0].id;
});

after(async () => {
  if (!rodar) return;
  await admin.query(`delete from tentativa_acesso where chave like 'ip:198.51.100.%' or chave like 'conta:%'`);
  await admin.query('delete from token_recuperacao where usuario_id = $1', [usuarioId]);
  await admin.query('delete from usuario where id = $1', [usuarioId]);
  await admin.end();
  await app.end();
  await fecharPool();
});

describe('limite de login', { skip: !rodar }, () => {
  test('a conta bloqueia depois do limite de falhas, mesmo com a senha certa e IPs diferentes', async () => {
    const { maximo } = REGRAS.login.conta;
    for (let i = 0; i < maximo; i += 1) {
      const r = await entrar({ email: EMAIL, senha: 'errada', ip: ip(10 + i) });
      assert.equal(r.ok, false);
    }
    await muitasTentativas(entrar({ email: EMAIL, senha: SENHA, ip: ip(99) }));
    await esquecerFalhasDaConta('login', EMAIL);
  });

  test('e-mail sem cadastro bloqueia do mesmo jeito (não revela quem tem conta)', async () => {
    const fantasma = `ninguem.${sufixo}@teste.br`;
    for (let i = 0; i < REGRAS.login.conta.maximo; i += 1) {
      await entrar({ email: fantasma, senha: 'x', ip: ip(30 + i) });
    }
    await muitasTentativas(entrar({ email: fantasma, senha: 'x', ip: ip(98) }));
  });

  test('o IP bloqueia depois do limite, mesmo trocando de conta', async () => {
    const { maximo } = REGRAS.login.ip;
    for (let i = 0; i < maximo; i += 1) {
      await entrar({ email: `varias.${i}.${sufixo}@teste.br`, senha: 'x', ip: ip(200) });
    }
    await muitasTentativas(entrar({ email: EMAIL, senha: SENHA, ip: ip(200) }));
  });

  test('e-mail com outra caixa ou espaços conta como a mesma conta', async () => {
    const outro = `caixa.${sufixo}@teste.br`;
    for (let i = 0; i < REGRAS.login.conta.maximo; i += 1) {
      await entrar({ email: i % 2 ? outro.toUpperCase() : ` ${outro} `, senha: 'x', ip: ip(60 + i) });
    }
    await muitasTentativas(entrar({ email: outro, senha: 'x', ip: ip(97) }));
  });
});

describe('limite da recuperação de senha', { skip: !rodar }, () => {
  test('a mesma caixa só recebe alguns e-mails por hora', async () => {
    const silencio = console.log;
    console.log = () => {};
    try {
      for (let i = 0; i < REGRAS.recuperacao.conta.maximo; i += 1) {
        const r = await pedirRecuperacao({ email: EMAIL, ip: ip(120 + i) });
        assert.equal(r.ok, true);
      }
      await muitasTentativas(pedirRecuperacao({ email: EMAIL, ip: ip(130) }));
    } finally {
      console.log = silencio;
    }
  });

  test('token inválido repetido bloqueia o IP', async () => {
    for (let i = 0; i < REGRAS.redefinicao.ip.maximo; i += 1) {
      const r = await redefinirSenha({ token: `x${i}`, senha: 'novaSenha123', confirmacao: 'novaSenha123', ip: ip(140) });
      assert.equal(r.ok, false);
    }
    await muitasTentativas(redefinirSenha({ token: 'y', senha: 'novaSenha123', confirmacao: 'novaSenha123', ip: ip(140) }));
  });
});

describe('tabela de tentativas', { skip: !rodar }, () => {
  test('app_web não lê nem escreve direto; só pelas funções', async () => {
    await assert.rejects(app.query('select * from tentativa_acesso'), /permission denied/);
    await assert.rejects(app.query(`insert into tentativa_acesso (chave, acao) values ('x', 'login')`), /permission denied/);
    await assert.rejects(app.query(`delete from tentativa_acesso`), /permission denied/);
  });

  test('a conta é guardada como hash, nunca o e-mail', async () => {
    const { rows } = await admin.query(`select count(*)::int as n from tentativa_acesso where chave like '%@%'`);
    assert.equal(rows[0].n, 0);
  });
});

describe('IP atrás de proxy', () => {
  /** @param {string} xff */
  const req = (xff) => new NextRequest('https://api.exemplo.org/api/sessao', { headers: { 'x-forwarded-for': xff } });

  test('o cliente não escolhe o IP: vale o que o proxy acrescentou no fim', () => {
    assert.equal(ipDaRequisicao(req('1.2.3.4, 203.0.113.7')), '203.0.113.7');
    assert.equal(ipDaRequisicao(req('203.0.113.7')), '203.0.113.7');
  });

  test('PROXIES_CONFIAVEIS=2 (CDN + Railway) pega o penúltimo', () => {
    const antes = process.env.PROXIES_CONFIAVEIS;
    process.env.PROXIES_CONFIAVEIS = '2';
    try {
      assert.equal(ipDaRequisicao(req('1.2.3.4, 203.0.113.7, 10.0.0.1')), '203.0.113.7');
    } finally {
      if (antes === undefined) delete process.env.PROXIES_CONFIAVEIS; else process.env.PROXIES_CONFIAVEIS = antes;
    }
  });
});
