/**
 * Limite de requisições por IP nas rotas públicas de check-in e do painel
 * (RNF14). O contador mora no banco (migration 005), não em memória.
 * Login e recuperação de senha têm limite próprio, por IP e por conta:
 * ver seguranca/tentativas.js.
 */
import { consultaUm } from '@/infraestrutura/banco/consulta.js';
import { ErroDeNegocio } from '@/dominio/erros.js';

/**
 * Limites por ação, na janela indicada.
 * A busca é mais apertada porque devolve nome, instituição e cargo de outras pessoas.
 */
const LIMITES = {
  buscar: { maximo: 20, janela: '1 minute' },
  registrar: { maximo: 10, janela: '1 minute' },
  consultar: { maximo: 60, janela: '1 minute' },
  // Dado agregado ou autorizado, mas sem login: impede raspagem em massa.
  publico: { maximo: 120, janela: '1 minute' },
};

/**
 * IP de quem chamou, tirado do X-Forwarded-For.
 *
 * Cada proxy ACRESCENTA o endereço de quem o chamou ao fim da lista; o que
 * vem antes foi escrito pelo próprio cliente e pode ser qualquer coisa. Por
 * isso o IP confiável é o N-ésimo a partir do FIM, sendo N o número de proxies
 * na frente da aplicação (PROXIES_CONFIAVEIS, padrão 1 — o do Railway). Com
 * uma CDN na frente do Railway, use 2.
 *
 * @param {import('next/server').NextRequest|Request} req
 * @returns {string}
 */
export function ipDaRequisicao(req) {
  const saltos = Math.max(1, Number.parseInt(process.env.PROXIES_CONFIAVEIS ?? '1', 10) || 1);
  const lista = (req.headers.get('x-forwarded-for') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (lista.length) return lista[Math.max(0, lista.length - saltos)];
  return req.headers.get('x-real-ip') ?? '';
}

/**
 * Conta a tentativa e recusa quando passar do limite.
 *
 * @param {keyof LIMITES} acao
 * @param {string} ip
 * @param {string|null} [token]
 * @returns {Promise<void>}
 */
export async function exigirDentroDoLimite(acao, ip, token = null) {
  const { maximo, janela } = LIMITES[acao];

  const linha = await consultaUm(
    'select checkin_contar_tentativa($1, $2, $3, $4::interval) as total',
    [ip, acao, token, janela],
  );
  const total = Number(linha?.total ?? 0);

  if (total > maximo) {
    throw new ErroDeNegocio('MUITAS_TENTATIVAS',
      'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.',
      { limite: maximo, janela });
  }
}

export const LIMITES_CONFIGURADOS = LIMITES;
