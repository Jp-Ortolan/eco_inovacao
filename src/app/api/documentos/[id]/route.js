/**
 * APRESENTAÇÃO — um documento.
 *
 *   DELETE /api/documentos/:id
 */
import { removerDocumento } from '@/aplicacao/documentos/remover-documento.js';
import { usuarioAtual } from '@/infraestrutura/seguranca/sessao.js';
import { ok, falha } from '@/infraestrutura/http/resposta.js';

export const dynamic = 'force-dynamic';

/**
 * @param {import('next/server').NextRequest} _req
 * @param {{ params: Promise<{ id: string }> }} contexto
 */
export async function DELETE(_req, { params }) {
  const { id } = await params;
  try {
    return ok(await removerDocumento(await usuarioAtual(), id));
  } catch (e) {
    return falha(e);
  }
}
