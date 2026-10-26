-- Organização do Registro Geral. Não exclui nem transfere registros existentes.
begin;

create or replace function public.cavalaria_antes_atualizar() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if old.executed_at is not null and coalesce(current_setting('app.cavalaria_reversao', true),'') <> '1' then
    raise exception 'Registro exonerado é imutável';
  end if;
  if new.id is distinct from old.id or new.ordem is distinct from old.ordem then
    raise exception 'Identificador e ordem do registro são preservados';
  end if;
  if new.nome is distinct from old.nome or new.origem is distinct from old.origem then
    if old.executed_at is not null or not public.cavalaria_autorizado()
       or coalesce(current_setting('app.cavalaria_edicao',true),'') <> '1' then
      raise exception 'Correção permitida apenas a autorizados, em registros do efetivo';
    end if;
    new.nome = btrim(new.nome);
    if new.nome is null or length(new.nome) < 2 or length(new.nome) > 120 or new.nome ~ '[[:cntrl:]]' then
      raise exception 'Nome deve ter de 2 a 120 caracteres, sem caracteres de controle';
    end if;
  end if;
  if old.executed_at is not null and coalesce(current_setting('app.cavalaria_reversao', true),'') = '1' then
    if new.status <> 'Ativo' or new.executed_at is not null or auth.uid() is null then raise exception 'Reversão de exoneração inválida'; end if;
  elsif new.executed_at is distinct from old.executed_at then
    if auth.uid() is null or new.status <> 'Exonerar' or new.executed_at is null then raise exception 'Confirmação de exoneração inválida'; end if;
  elsif new.executed_by is distinct from old.executed_by or new.executed_by_email is distinct from old.executed_by_email then
    raise exception 'Confirmação só pode ser realizada pela função segura';
  end if;
  new.modified_at=now(); new.modified_by=auth.uid();
  return new;
end $$;

create or replace function public.cavalaria_registrar_auditoria() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if old.nome is distinct from new.nome or old.origem is distinct from new.origem
     or old.status is distinct from new.status or old.destino is distinct from new.destino
     or old.observacao is distinct from new.observacao or old.executed_at is distinct from new.executed_at then
    insert into public.cavalaria_auditoria(oficial_id,oficial_nome,autor_id,autor_email,antes,depois)
    values(new.id,new.nome,auth.uid(),coalesce(auth.jwt()->>'email','sistema'),
      jsonb_build_object('nome',old.nome,'contingente',old.origem,'situacao',old.status,'destino',old.destino,'observacao',old.observacao,'exonerado_em',old.executed_at),
      jsonb_build_object('nome',new.nome,'contingente',new.origem,'situacao',new.status,'destino',new.destino,'observacao',new.observacao,'exonerado_em',new.executed_at,'justificativa',nullif(current_setting('app.cavalaria_justificativa', true),'')));
  end if;
  return new;
end $$;

-- Correções usam uma RPC limitada; não concede UPDATE direto em nome/origem.
create or replace function public.corrigir_oficial(
  p_oficial text, p_nome text, p_contingente text,
  p_nome_anterior text, p_contingente_anterior text, p_modificado_em timestamptz
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_atual public.cavalaria_oficiais%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.cavalaria_membros where user_id=auth.uid() and role in ('admin','xerife')) then
    raise exception 'Apenas os editores autorizados do Registro Geral podem corrigir oficiais';
  end if;
  p_nome=btrim(p_nome);
  if p_nome is null or length(p_nome)<2 or length(p_nome)>120 or p_nome ~ '[[:cntrl:]]' then raise exception 'Nome inválido'; end if;
  if p_contingente is null or p_contingente not in ('New Hanover','West Elizabeth','Lemoyne','Sem jurisdição') then raise exception 'Contingente inválido'; end if;
  select * into v_atual from public.cavalaria_oficiais where id=p_oficial for update;
  if not found or v_atual.executed_at is not null then raise exception 'Oficial indisponível para correção'; end if;
  if v_atual.nome is distinct from p_nome_anterior or v_atual.origem is distinct from p_contingente_anterior
     or v_atual.modified_at is distinct from p_modificado_em then
    raise exception 'O registro mudou desde a abertura. Feche a edição e confira os dados atualizados';
  end if;
  if v_atual.nome=p_nome and v_atual.origem=p_contingente then return true; end if;
  perform set_config('app.cavalaria_edicao','1',true);
  update public.cavalaria_oficiais set nome=p_nome,origem=p_contingente,
    destino=case when origem is distinct from p_contingente then 'A definir' else destino end
    where id=p_oficial and executed_at is null;
  perform set_config('app.cavalaria_edicao','',true);
  return true;
end $$;
revoke all on function public.corrigir_oficial(text,text,text,text,text,timestamptz) from public,anon;
grant execute on function public.corrigir_oficial(text,text,text,text,text,timestamptz) to authenticated;
commit;
