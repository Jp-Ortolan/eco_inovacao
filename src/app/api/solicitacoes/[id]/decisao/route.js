/**
 * APRESENTAÇÃO — aprovar ou recusar.
 *
 *   POST /api/solicitacoes/:id/decisao   { "decisao": "aprovar" | "recusar", "resposta": "..." }
 */
import { decidirSolicitacao } from '@/aplicacao/solicitacoes/decidir-solicitacao.js';
import { usuarioAtual } from '@/infraestrutura/seguranca/sessao.js';
import { ok, falha } from '@/infraestrutura/http/resposta.js';

export const dynamic = 'force-dynamic';

/**
 * @param {import('next/server').NextRequest} req
 * @param {{ params: Promise<{ id: string }> }} contexto
 */
export async function POST(req, { params }) {
  const { id } = await params;
  try {
    const usuario = await usuarioAtual();
    const corpo = await req.json().catch(() => null);
    return ok(await decidirSolicitacao(usuario, id, corpo));
  } catch (e) {
    return falha(e);
  }
}
