-- =============================================================================
-- 018 — Limite de tentativas de acesso  ·  fix/auditoria-seguranca
-- Sistema de Gestão do Ecossistema de Inovação — Centro de Inovação
--
-- O login e a recuperação de senha não tinham limite: dava para testar
-- senhas sem parar e disparar e-mails de recuperação para qualquer caixa.
-- As falhas ficam no banco (não em memória) para valer entre réplicas e
-- reinícios, contadas por IP e por conta.
--
-- A conta entra como hash SHA-256 do e-mail normalizado: a tabela não vira
-- uma lista de e-mails tentados, inclusive de quem nem tem cadastro.
-- =============================================================================

begin;

create table tentativa_acesso (
  id         bigint generated always as identity primary key,
  chave      text        not null,   -- 'ip:<endereço>' ou 'conta:<sha256>'
  acao       text        not null,   -- login | recuperacao | redefinicao
  criada_em  timestamptz not null default now()
);

create index tentativa_acesso_busca on tentativa_acesso (chave, acao, criada_em desc);

-- Fechada ao acesso direto, como sessao e token_recuperacao: só as funções
-- abaixo (SECURITY DEFINER) leem e escrevem.
alter table tentativa_acesso enable row level security;
revoke all on tentativa_acesso from app_web;

create or replace function tentativa_contar(p_chave text, p_acao text, p_janela interval)
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer
    from tentativa_acesso
   where chave = p_chave and acao = p_acao and criada_em > now() - p_janela;
$$;

create or replace function tentativa_registrar(p_chave text, p_acao text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into tentativa_acesso (chave, acao) values (p_chave, p_acao);
  -- Limpeza oportunista (~1 em 100 chamadas): nenhuma janela passa de 1 dia.
  if random() < 0.01 then
    delete from tentativa_acesso where criada_em < now() - interval '1 day';
  end if;
end $$;

create or replace function tentativa_limpar(p_chave text, p_acao text)
returns void
language sql security definer set search_path = public as $$
  delete from tentativa_acesso where chave = p_chave and acao = p_acao;
$$;

revoke all on function tentativa_contar(text, text, interval) from public;
revoke all on function tentativa_registrar(text, text) from public;
revoke all on function tentativa_limpar(text, text) from public;
grant execute on function tentativa_contar(text, text, interval) to app_web;
grant execute on function tentativa_registrar(text, text) to app_web;
grant execute on function tentativa_limpar(text, text) to app_web;

commit;
