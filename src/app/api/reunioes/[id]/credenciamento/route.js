/**
 * APRESENTAÇÃO — credenciamento da reunião ou do evento.
 *
 *   POST /api/reunioes/:id/credenciamento   { "acao": "abrir" | "fechar" | "novo_qr",
 *                                             "permiteConvidado": true }
 */
import { credenciamento } from '@/aplicacao/reunioes/credenciamento.js';
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
    return ok(await credenciamento(usuario, id, corpo));
  } catch (e) {
    return falha(e);
  }
}
