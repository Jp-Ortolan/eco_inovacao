/**
 * APRESENTAÇÃO — um evento.
 *
 *   GET    /api/eventos/:id
 *   PATCH  /api/eventos/:id
 *   DELETE /api/eventos/:id
 */
import { obterReuniao } from '@/aplicacao/reunioes/obter-reuniao.js';
import { editarReuniao } from '@/aplicacao/reunioes/editar-reuniao.js';
import { excluirReuniao } from '@/aplicacao/reunioes/excluir-reuniao.js';
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
    return ok(await obterReuniao(await usuarioAtual(), id, 'evento'));
  } catch (e) {
    return falha(e);
  }
}

/**
 * @param {import('next/server').NextRequest} req
 * @param {{ params: Promise<{ id: string }> }} contexto
 */
export async function PATCH(req, { params }) {
  const { id } = await params;
  try {
    const usuario = await usuarioAtual();
    const corpo = await req.json().catch(() => null);
    return ok(await editarReuniao(usuario, id, corpo, 'evento'));
  } catch (e) {
    return falha(e);
  }
}

/**
 * @param {import('next/server').NextRequest} _req
 * @param {{ params: Promise<{ id: string }> }} contexto
 */
export async function DELETE(_req, { params }) {
  const { id } = await params;
  try {
    return ok(await excluirReuniao(await usuarioAtual(), id, 'evento'));
  } catch (e) {
    return falha(e);
  }
}
