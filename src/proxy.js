import { NextResponse } from 'next/server';
import { origemLiberada } from '@/infraestrutura/http/front.js';
import { LIMITE_CORPO_JSON, LIMITE_CORPO_MULTIPART } from '@/infraestrutura/http/limites-corpo.js';

/**
 * Executado antes de toda rota /api: CORS, conferência de origem (CSRF),
 * tamanho do corpo e presença do cookie de sessão.
 *
 * O cookie só é conferido pela PRESENÇA; a validade é checada no servidor, em
 * usuarioAtual(). A resposta é 401 em JSON, não redirecionamento: quem chama
 * é o front, que leva o usuário ao login.
 */
const ROTAS_PUBLICAS = [
  '/api/checkin',            // check-in por QR Code
  '/api/saude',
  '/api/sessao',             // entrar
  '/api/senha',              // recuperar e redefinir a senha
  '/api/publico',            // painel público: as funções publico_* recortam o dado
  '/api/governanca/publico',
  '/api/governanca/checkin',
  '/api/governanca/qr',      // o token é o conteúdo do QR
  '/api/governanca/arquivos', // link assinado
];

const METODOS_INSEGUROS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);


const CABECALHOS_SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

/**
 * @param {NextResponse} resposta
 * @param {string} origem  já conferida por origemLiberada()
 */
function finalizar(resposta, origem) {
  if (origem) {
    resposta.headers.set('Access-Control-Allow-Origin', origem);
    resposta.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  resposta.headers.set('Vary', 'Origin');
  for (const [k, v] of Object.entries(CABECALHOS_SEGURANCA)) {
    if (!resposta.headers.has(k)) resposta.headers.set(k, v);
  }
  return resposta;
}

/**
 * @param {string} codigo
 * @param {string} mensagem
 * @param {number} status
 * @param {string} origem
 */
const erro = (codigo, mensagem, status, origem) =>
  finalizar(NextResponse.json({ erro: { codigo, mensagem } }, { status }), origem);

/**
 * Proteção contra CSRF. O cookie de sessão vai com SameSite=None quando front
 * e API estão em domínios diferentes, então o navegador o anexa a POST vindo
 * de QUALQUER site. Toda requisição que muda estado precisa vir de uma origem
 * liberada em URL_FRONTEND (ou da própria API).
 *
 * Sem Origin, vale o Sec-Fetch-Site; sem nenhum dos dois não é um navegador
 * moderno (curl, script, teste), e esse cliente não carrega cookie alheio.
 *
 * @param {import('next/server').NextRequest} req
 */
export function origemConfiavel(req) {
  const origem = req.headers.get('origin');
  if (origem) {
    if (origemLiberada(origem)) return true;
    try {
      return new URL(origem).host === req.headers.get('host');
    } catch {
      return false; // inclui Origin: null (iframe sandbox, file://)
    }
  }
  const site = req.headers.get('sec-fetch-site');
  return !site || site === 'same-origin' || site === 'none';
}

/**
 * @param {import('next/server').NextRequest} req
 */
export function proxy(req) {
  const origem = origemLiberada(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    const r = new NextResponse(null, { status: 204 });
    r.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    r.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    r.headers.set('Access-Control-Max-Age', '86400');
    return finalizar(r, origem);
  }

  if (METODOS_INSEGUROS.has(req.method)) {
    if (!origemConfiavel(req)) {
      return erro('ORIGEM_NAO_PERMITIDA', 'Origem da requisição não permitida.', 403, origem);
    }
    const tamanho = Number(req.headers.get('content-length') ?? 0);
    const multipart = (req.headers.get('content-type') ?? '').includes('multipart/form-data');
    const limite = multipart ? LIMITE_CORPO_MULTIPART : LIMITE_CORPO_JSON;
    if (tamanho > limite) {
      return erro('ARQUIVO_GRANDE_DEMAIS', 'A requisição passa do tamanho permitido.', 413, origem);
    }
  }

  const caminho = req.nextUrl.pathname;
  const publica = ROTAS_PUBLICAS.some((r) => caminho === r || caminho.startsWith(`${r}/`));

  if (!publica && !req.cookies.get('sessao')) {
    return erro('NAO_AUTENTICADO', 'É preciso estar autenticado.', 401, origem);
  }

  return finalizar(NextResponse.next(), origem);
}

export const config = {
  matcher: ['/api/:path*'],
};
