/**
 * APRESENTAÇÃO — uma solicitação.
 *
 *   GET /api/solicitacoes/:id
 */
import { obterSolicitacao } from '@/aplicacao/solicitacoes/obter-solicitacao.js';
import { usuarioAtual } from '@/infraestrutura/seguranca/sessao.js';
import { ok, falha } from '@/infraestrutura/http/resposta.js';

export const dynamic = 'force-dynamic';

/**
 * @param {import('next/server').NextRequest} _req
 * @param {{ params: Promise<{ id: string }> }} contexto
 */
export async function GET(_req, { params }) {
  const { id } = await params;
  try {
    return ok(await obterSolicitacao(await usuarioAtual(), id));
  } catch (e) {
    return falha(e);
  }
}
