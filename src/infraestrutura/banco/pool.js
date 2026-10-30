import pg from 'pg';
import { prepararConexao } from './ssl.js';

const { Pool } = pg;

/**
 * Coluna `date` volta como texto, não como Date.
 * Virando Date, o JSON.stringify manda timestamp UTC e a data da reunião pode
 * cair um dia para trás; e comparação com string para de funcionar em silêncio.
 */
pg.types.setTypeParser(1082, (valor) => valor);

/**
 * Pool de conexões. Fica no globalThis porque o Next recarrega os módulos em
 * desenvolvimento e cada recarga abriria um pool novo.
 *
 * @type {{ poolPg?: import('pg').Pool }}
 */
const global_ = globalThis;

/** @returns {import('pg').Pool} */
export function pool() {
  if (!global_.poolPg) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL não está definida.');

    global_.poolPg = new Pool({
      ...prepararConexao(url),
      max: Number(process.env.DB_MAX_CONEXOES ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    global_.poolPg.on('error', (e) => {
      console.error('[pg] erro em conexão ociosa', e);
    });
  }
  return global_.poolPg;
}

/**
 * Encerra o pool. Só teste e script precisam: sem isso o processo fica de pé
 * esperando o timeout das conexões ociosas.
 *
 * @returns {Promise<void>}
 */
export async function fecharPool() {
  if (!global_.poolPg) return;
  const p = global_.poolPg;
  global_.poolPg = undefined;
  await p.end();
}
