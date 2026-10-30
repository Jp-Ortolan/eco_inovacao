/**
 * Tamanho máximo do corpo das requisições.
 * O multipart precisa casar com experimental.proxyClientMaxBodySize do
 * next.config.mjs: acima dele o Next corta o corpo sem avisar a rota.
 */
export const LIMITE_CORPO_MULTIPART = 25 * 1024 * 1024;
export const LIMITE_CORPO_JSON = 2 * 1024 * 1024;
