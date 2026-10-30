/**
 * APRESENTAÇÃO — contrato /api/governanca do front (versão 1).
 *
 * Uma só rota recebe tudo e a tabela em rotas-governanca.js decide. Ver
 * docs/13-contrato-governanca.md.
 */
import { despachar } from '@/infraestrutura/http/rotas-governanca.js';
import '@/aplicacao/governanca/rotas.js';

export const dynamic = 'force-dynamic';

/** @param {import('next/server').NextRequest} req @param {{ params: Promise<{ caminho: string[] }> }} c */
const tratar = async (req, { params }) => despachar(req, (await params).caminho ?? []);

export const GET = tratar;
export const POST = tratar;
export const PATCH = tratar;
export const PUT = tratar;
export const DELETE = tratar;
