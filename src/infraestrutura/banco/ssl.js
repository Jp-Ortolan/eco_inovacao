/**
 * TLS da conexão com o PostgreSQL. Usado pela aplicação e pelos scripts.
 *
 * Pela rede pública, o certificado do servidor é VERIFICADO: sem isso, quem
 * estiver no caminho se passa pelo banco e lê a senha e os dados.
 *
 *   localhost / soquete unix     sem TLS
 *   *.railway.internal           TLS sem verificar o certificado (autoassinado).
 *                                A rede privada do Railway é um túnel WireGuard
 *                                que já autentica e criptografa os dois lados
 *   qualquer outro endereço      TLS com certificado verificado
 *
 * Ajustes explícitos:
 *   DATABASE_SSL_CA=<PEM ou base64>   CA a confiar (ou o certificado autoassinado);
 *                                     com ela, verifica também na rede privada
 *   DATABASE_SSL=desativado           sem TLS
 *   DATABASE_SSL=sem-verificacao      TLS sem verificar. Inseguro na rede
 *                                     pública; avisa no log
 *
 * O `sslmode` da URL é tirado antes de chegar ao `pg`, que o deixaria
 * sobrepor esta configuração (e descartar a CA). `sslmode=disable` e
 * `sslmode=no-verify` valem como os dois últimos ajustes acima.
 */

/** @param {string} url */
function hostDe(url) {
  if (/[?&]host=(\/|%2F)/i.test(url)) return 'localhost';
  return (/^postgres(?:ql)?:\/\/(?:[^@/]*@)?(\[[^\]]*\]|[^/:?]*)/i.exec(url)?.[1] ?? '').toLowerCase();
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
  const host = hostDe(url);

  if (modo === 'desativado') return { connectionString, ssl: false };

  if (!modo && !env.DATABASE_SSL_CA) {
    if (['', 'localhost', '127.0.0.1', '[::1]'].includes(host)) return { connectionString, ssl: false };
    if (host.endsWith('.railway.internal')) return { connectionString, ssl: { rejectUnauthorized: false } };
  }

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
