/**
 * Configuração sensível: TLS do banco e e-mail sem provedor.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararConexao } from '@/infraestrutura/banco/ssl.js';
import { enviar, entregar } from '@/infraestrutura/email/enviar.js';

describe('TLS do PostgreSQL', () => {
  test('endereço remoto verifica o certificado por padrão', () => {
    const { ssl } = prepararConexao('postgresql://u:s@banco.exemplo.com:5432/db', {});
    assert.deepEqual(ssl, { rejectUnauthorized: true });
  });

  test('sslmode=require da URL não desliga a verificação nem descarta a CA', () => {
    const r = prepararConexao('postgresql://u:s@banco.exemplo.com/db?sslmode=require',
      { DATABASE_SSL_CA: '-----BEGIN CERTIFICATE-----\\nAAA\\n-----END CERTIFICATE-----' });
    assert.equal(r.connectionString, 'postgresql://u:s@banco.exemplo.com/db');
    assert.equal(r.ssl && r.ssl.rejectUnauthorized, true);
    assert.match(r.ssl && r.ssl.ca, /^-----BEGIN CERTIFICATE-----\nAAA\n/);
  });

  test('CA em base64 é decodificada', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nBBB\n-----END CERTIFICATE-----';
    const r = prepararConexao('postgresql://u@h/db', { DATABASE_SSL_CA: Buffer.from(pem).toString('base64') });
    assert.equal(r.ssl && r.ssl.ca, pem);
  });

  test('localhost e soquete unix ficam sem TLS', () => {
    assert.equal(prepararConexao('postgresql://u:s@localhost:5432/db', {}).ssl, false);
    assert.equal(prepararConexao('postgresql://u:s@127.0.0.1/db', {}).ssl, false);
    assert.equal(prepararConexao('postgresql:///db?host=/var/run/postgresql', {}).ssl, false);
  });

  test('rede privada do Railway mantém TLS sem verificar; o proxy público do Railway verifica', () => {
    assert.deepEqual(prepararConexao('postgresql://u:s@postgres.railway.internal:5432/railway', {}).ssl,
      { rejectUnauthorized: false });
    assert.deepEqual(prepararConexao('postgresql://u:s@junction.proxy.rlwy.net:12345/railway', {}).ssl,
      { rejectUnauthorized: true });
    assert.deepEqual(prepararConexao('postgresql://u:s@railway.internal.atacante.com/db', {}).ssl,
      { rejectUnauthorized: true });
  });

  test('"localhost" no meio do nome não conta como local', () => {
    const { ssl } = prepararConexao('postgresql://u:s@localhost.atacante.com/db', {});
    assert.deepEqual(ssl, { rejectUnauthorized: true });
  });

  test('desligar a verificação exige pedido explícito', () => {
    assert.deepEqual(prepararConexao('postgresql://u@h/db', { DATABASE_SSL: 'sem-verificacao' }).ssl,
      { rejectUnauthorized: false });
    assert.equal(prepararConexao('postgresql://u@h/db', { DATABASE_SSL: 'desativado' }).ssl, false);
    assert.equal(prepararConexao('postgresql://u@h/db?sslmode=disable', {}).ssl, false);
  });
});

describe('e-mail sem provedor', () => {
  const mensagem = {
    para: 'pessoa@exemplo.org',
    assunto: 'Redefinir sua senha',
    texto: 'Abra: https://front/redefinir-senha?token=SEGREDO123',
  };

  /** @param {string} nome @param {string|undefined} valor */
  const restaurar = (nome, valor) => {
    if (valor === undefined) delete process.env[nome]; else process.env[nome] = valor;
  };

  /** @param {() => Promise<unknown>} fazer */
  async function capturar(fazer) {
    const saida = [];
    const originais = { log: console.log, warn: console.warn, error: console.error };
    for (const k of /** @type {const} */ (['log', 'warn', 'error'])) {
      console[k] = (...a) => saida.push(a.map(String).join(' '));
    }
    try { await fazer(); } finally { Object.assign(console, originais); }
    return saida.join('\n');
  }

  test('em produção, o link com token nunca vai para o log', async () => {
    const antes = { NODE_ENV: process.env.NODE_ENV, EMAIL_PROVEDOR: process.env.EMAIL_PROVEDOR };
    process.env.NODE_ENV = 'production';
    delete process.env.EMAIL_PROVEDOR;
    try {
      const log1 = await capturar(() => enviar(mensagem));
      const log2 = await capturar(async () => {
        const r = await entregar(mensagem);
        assert.equal(r.status, 'falhou');
      });
      for (const log of [log1, log2]) {
        assert.doesNotMatch(log, /SEGREDO123|token=|pessoa@exemplo\.org/);
        assert.match(log, /email_nao_enviado/);
      }
    } finally {
      restaurar('NODE_ENV', antes.NODE_ENV);
      restaurar('EMAIL_PROVEDOR', antes.EMAIL_PROVEDOR);
    }
  });

  test('fora de produção, o e-mail aparece no terminal para quem desenvolve', async () => {
    const antes = { NODE_ENV: process.env.NODE_ENV, EMAIL_PROVEDOR: process.env.EMAIL_PROVEDOR };
    process.env.NODE_ENV = 'development';
    delete process.env.EMAIL_PROVEDOR;
    try {
      const log = await capturar(() => enviar(mensagem));
      assert.match(log, /SEGREDO123/);
    } finally {
      restaurar('NODE_ENV', antes.NODE_ENV);
      restaurar('EMAIL_PROVEDOR', antes.EMAIL_PROVEDOR);
    }
  });
});

describe('link assinado de arquivo', async () => {
  const { assinar, verificar } = await import('@/infraestrutura/seguranca/assinatura.js');

  test('confere quem, o quê e até quando', () => {
    const t = assinar({ t: 'doc', id: 'd1', u: 'u1' });
    assert.deepEqual({ ...verificar(t), exp: 0 }, { t: 'doc', id: 'd1', u: 'u1', exp: 0 });
  });

  test('trocar o documento ou o dono invalida a assinatura', () => {
    const [, assinatura] = assinar({ t: 'doc', id: 'd1', u: 'u1' }).split('.');
    const outro = Buffer.from(JSON.stringify({ t: 'doc', id: 'd2', u: 'u1', exp: Date.now() + 60_000 })).toString('base64url');
    assert.equal(verificar(`${outro}.${assinatura}`), null);
  });

  test('vencido não vale', () => {
    assert.equal(verificar(assinar({ t: 'rel', id: 'r1', u: 'u1' }, -1)), null);
  });

  test('lixo não derruba a verificação', () => {
    for (const t of ['', 'a', 'a.b', '..', null, undefined]) assert.equal(verificar(/** @type {any} */ (t)), null);
  });
});
