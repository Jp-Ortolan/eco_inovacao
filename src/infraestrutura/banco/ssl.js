/**
 * TLS da conexão com o PostgreSQL. Usado pela aplicação e pelos scripts.
 *
 * Fora de endereço local, o certificado do servidor é VERIFICADO por padrão:
 * sem verificação, quem estiver no caminho se passa pelo banco e lê a senha e
 * os dados. As saídas são explícitas:
 *
 *   DATABASE_SSL_CA=<PEM ou PEM em base64>   CA (ou o próprio certificado, se
 *                                            for autoassinado) a confiar
 *   DATABASE_SSL=desativado                  sem TLS — só em rede privada
 *                                            (ex.: *.railway.internal)
 *   DATABASE_SSL=sem-verificacao             TLS sem conferir o certificado.
 *                                            Inseguro; avisa no log
 *
 * O `sslmode` da URL é tirado antes de chegar ao `pg`: o driver deixa o da URL
 * sobrepor o objeto `ssl`, e a CA configurada se perderia. `sslmode=disable` e
 * `sslmode=no-verify` na URL valem como os dois últimos casos acima.
 */

/** Loopback ou soquete unix: não há rede no caminho. */
function ehLocal(url) {
  if (/[?&]host=(\/|%2F)/i.test(url)) return true;
  const host = /^postgres(?:ql)?:\/\/(?:[^@/]*@)?(\[[^\]]*\]|[^/:?]*)/i.exec(url)?.[1] ?? '';
  return ['', 'localhost', '127.0.0.1', '[::1]'].includes(host.toLowerCase());
}

let avisou = false;

/** @param {string} valor */
function lerCa(valor) {
  const texto = valor.includes('-----BEGIN')
    ? valor
    : Buffer.from(valor, 'base64').toString('utf8');
  return texto.replace(/\\n/g, '\n');
}

/**
 * @param {string} url
 * @param {Record<string, string|undefined>} [env]
 * @returns {{ connectionString: string, ssl: false | { rejectUnauthorized: boolean, ca?: string } }}
 */
export function prepararConexao(url, env = process.env) {
  const modoUrl = /[?&]sslmode=([^&]+)/i.exec(url)?.[1]?.toLowerCase() ?? null;
  const connectionString = url
    .replace(/([?&])(sslmode|sslrootcert|sslcert|sslkey|ssl)=[^&]*&?/gi, '$1')
    .replace(/[?&]$/, '');

  const modo = (env.DATABASE_SSL ?? '').toLowerCase()
    || (modoUrl === 'disable' ? 'desativado' : modoUrl === 'no-verify' ? 'sem-verificacao' : '');

  if (modo === 'desativado') return { connectionString, ssl: false };
  if (!modo && ehLocal(url) && !env.DATABASE_SSL_CA) return { connectionString, ssl: false };

  if (modo === 'sem-verificacao') {
    if (!avisou) {
      avisou = true;
      console.warn('[pg] DATABASE_SSL=sem-verificacao: o certificado do banco NÃO é verificado.');
    }
    return { connectionString, ssl: { rejectUnauthorized: false } };
  }

  return {
    connectionString,
    ssl: {
      rejectUnauthorized: true,
      ...(env.DATABASE_SSL_CA ? { ca: lerCa(env.DATABASE_SSL_CA) } : {}),
    },
  };
}
