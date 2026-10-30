/**
 * APRESENTAÇÃO — encerramento de reunião (RF39).
 */
import { encerrarReuniao } from '@/aplicacao/reunioes/encerrar-reuniao.js';
import { usuarioAtual } from '@/infraestrutura/seguranca/sessao.js';
import { ok, falha } from '@/infraestrutura/http/resposta.js';

export const dynamic = 'force-dynamic';

/**
 * @param {import('next/server').NextRequest} _req
 * @param {{ params: Promise<{ id: string }> }} contexto
 */
export async function POST(_req, { params }) {
  const { id } = await params;
  try {
    const usuario = await usuarioAtual();
    return ok(await encerrarReuniao(usuario, id));
  } catch (e) {
    return falha(e);
  }
}
