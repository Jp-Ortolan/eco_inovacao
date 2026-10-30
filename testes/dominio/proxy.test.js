/**
 * Proxy (src/proxy.js): CSRF, tamanho do corpo, sessão e cabeçalhos.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { LIMITE_CORPO_JSON, LIMITE_CORPO_MULTIPART } from '@/infraestrutura/http/limites-corpo.js';

process.env.URL_FRONTEND = 'https://front.exemplo.org,http://localhost:5173';

/** @type {typeof import('../../src/proxy.js')} */
let modulo;
before(async () => { modulo = await import('@/proxy.js'); });

/**
 * @param {string} metodo
 * @param {string} caminho
 * @param {Record<string, string>} [cabecalhos]
 */
const pedido = (metodo, caminho, cabecalhos = {}) =>
  new NextRequest(`https://api.exemplo.org${caminho}`, {
    method: metodo,
    headers: { host: 'api.exemplo.org', ...cabecalhos },
  });

const SESSAO = { cookie: 'sessao=abc' };

/** @param {Response} r */
const codigo = async (r) => (await r.json()).erro?.codigo;

describe('CSRF', () => {
  test('POST com sessão vindo de outro site é recusado', async () => {
    const r = modulo.proxy(pedido('POST', '/api/governanca/contas',
      { ...SESSAO, origin: 'https://atacante.example', 'content-type': 'text/plain' }));
    assert.equal(r.status, 403);
    assert.equal(await codigo(r), 'ORIGEM_NAO_PERMITIDA');
  });

  test('vale para rota pública também (login CSRF, check-in em nome de outro)', async () => {
    for (const caminho of ['/api/sessao', '/api/governanca/checkin/abc', '/api/senha/recuperar']) {
      const r = modulo.proxy(pedido('POST', caminho, { origin: 'https://atacante.example' }));
      assert.equal(r.status, 403, caminho);
    }
  });

  test('Origin: null é recusado', () => {
    assert.equal(modulo.proxy(pedido('DELETE', '/api/sessao', { ...SESSAO, origin: 'null' })).status, 403);
  });

  test('sem Origin, Sec-Fetch-Site cross-site é recusado', () => {
    assert.equal(modulo.proxy(pedido('PATCH', '/api/usuarios/1',
      { ...SESSAO, 'sec-fetch-site': 'cross-site' })).status, 403);
  });

  test('front liberado, mesma origem e cliente sem navegador passam', () => {
    const casos = [
      { origin: 'https://front.exemplo.org' },
      { origin: 'http://localhost:5173' },
      { origin: 'https://api.exemplo.org' },
      { 'sec-fetch-site': 'same-origin' },
      {},
    ];
    for (const c of casos) {
      const r = modulo.proxy(pedido('POST', '/api/governanca/contas', { ...SESSAO, ...c }));
      assert.equal(r.status, 200, JSON.stringify(c));
    }
  });

  test('GET de outro site segue (não muda estado; CORS decide quem lê)', () => {
    const r = modulo.proxy(pedido('GET', '/api/publico', { origin: 'https://atacante.example' }));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  });
});

describe('corpo e sessão', () => {
  test('JSON acima do limite → 413 antes de chegar à rota', async () => {
    const r = modulo.proxy(pedido('POST', '/api/governanca/contas', {
      ...SESSAO, 'content-type': 'application/json',
      'content-length': String(LIMITE_CORPO_JSON + 1),
    }));
    assert.equal(r.status, 413);
  });

  test('multipart tem limite próprio, maior', () => {
    const ok = modulo.proxy(pedido('POST', '/api/governanca/instituicoes/x/documentos', {
      ...SESSAO, 'content-type': 'multipart/form-data; boundary=x',
      'content-length': String(10 * 1024 * 1024),
    }));
    assert.equal(ok.status, 200);
    const grande = modulo.proxy(pedido('POST', '/api/governanca/instituicoes/x/documentos', {
      ...SESSAO, 'content-type': 'multipart/form-data; boundary=x',
      'content-length': String(LIMITE_CORPO_MULTIPART + 1),
    }));
    assert.equal(grande.status, 413);
  });

  test('rota privada sem cookie → 401; prefixo parecido com rota pública não engana', async () => {
    for (const caminho of ['/api/usuarios', '/api/publicoX', '/api/sessaoAdmin']) {
      const r = modulo.proxy(pedido('GET', caminho));
      assert.equal(r.status, 401, caminho);
      assert.equal(await codigo(r), 'NAO_AUTENTICADO');
    }
  });

  test('respostas levam os cabeçalhos de segurança', () => {
    const r = modulo.proxy(pedido('GET', '/api/publico'));
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  });
});
