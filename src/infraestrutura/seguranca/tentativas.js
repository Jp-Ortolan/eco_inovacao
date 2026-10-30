/**
 * Limite de tentativas de login e de recuperação de senha, por IP e por
 * conta, persistido no banco (migration 018).
 *
 * Login: só as FALHAS contam, e o acerto zera as da conta. A conta é o hash
 * do e-mail digitado, exista ou não o cadastro — a resposta de bloqueio é a
 * mesma nos dois casos e não revela quem tem conta.
 */
import { createHash } from 'node:crypto';
import { consulta, consultaUm } from '@/infraestrutura/banco/consulta.js';
import { ErroDeNegocio } from '@/dominio/erros.js';

/** @typedef {'login'|'recuperacao'|'redefinicao'} AcaoProtegida */

/**
 * O limite por conta é menor que o por IP: segura a força bruta distribuída
 * contra uma conta, enquanto o por IP segura um IP testando várias contas.
 * O bloqueio da conta dura só a janela — quem errou a própria senha espera
 * 15 minutos, não precisa de administrador.
 *
 * @type {Record<AcaoProtegida, { ip: { maximo: number, janela: string }, conta?: { maximo: number, janela: string } }>}
 */
export const REGRAS = {
  login: {
    ip: { maximo: 30, janela: '15 minutes' },
    conta: { maximo: 8, janela: '15 minutes' },
  },
  recuperacao: {
    ip: { maximo: 10, janela: '1 hour' },
    conta: { maximo: 3, janela: '1 hour' },
  },
  redefinicao: {
    ip: { maximo: 20, janela: '15 minutes' },
  },
};

/** @param {string} email */
const chaveConta = (email) =>
  `conta:${createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex')}`;

/** @param {string} ip */
const chaveIp = (ip) => `ip:${String(ip).trim() || 'desconhecido'}`;

/**
 * Chaves a conferir. Sem `ip` (chamada interna, fora de HTTP) não há limite
 * por IP; rota HTTP sempre passa o IP, mesmo vazio.
 *
 * @param {AcaoProtegida} acao
 * @param {{ ip?: string|null, email?: string|null }} quem
 */
function chaves(acao, { ip, email }) {
  const regra = REGRAS[acao];
  /** @type {{ chave: string, maximo: number, janela: string }[]} */
  const lista = [];
  if (ip !== null && ip !== undefined) lista.push({ chave: chaveIp(ip), ...regra.ip });
  if (regra.conta && email) lista.push({ chave: chaveConta(email), ...regra.conta });
  return lista;
}

/**
 * Recusa com 429 quando IP ou conta passaram do limite na janela.
 *
 * @param {AcaoProtegida} acao
 * @param {{ ip?: string|null, email?: string|null }} quem
 */
export async function exigirTentativaPermitida(acao, quem) {
  for (const { chave, maximo, janela } of chaves(acao, quem)) {
    const l = await consultaUm('select tentativa_contar($1, $2, $3::interval) as total', [chave, acao, janela]);
    if (Number(l?.total ?? 0) >= maximo) {
      throw new ErroDeNegocio('MUITAS_TENTATIVAS',
        'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.');
    }
  }
}

/**
 * @param {AcaoProtegida} acao
 * @param {{ ip?: string|null, email?: string|null }} quem
 */
export async function registrarTentativa(acao, quem) {
  for (const { chave } of chaves(acao, quem)) {
    await consulta('select tentativa_registrar($1, $2)', [chave, acao]);
  }
}

/**
 * Acerto do login: as falhas da CONTA são esquecidas. As do IP ficam — um IP
 * que acerta uma conta de vez em quando não ganha passe livre para as outras.
 *
 * @param {AcaoProtegida} acao
 * @param {string} email
 */
export async function esquecerFalhasDaConta(acao, email) {
  await consulta('select tentativa_limpar($1, $2)', [chaveConta(email), acao]);
}
