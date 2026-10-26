-- Cadastro individual por editores já autorizados. Sem INSERT direto na tabela.
begin;
create or replace function public.criar_oficial(
  p_requisicao uuid,p_nome text,p_contingente text,p_situacao text,p_observacao text
) returns text
language plpgsql security definer set search_path=public as $$
declare v_id text; v_ordem integer; v_existente public.cavalaria_oficiais%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.cavalaria_membros where user_id=auth.uid() and role in ('admin','xerife')) then
    raise exception 'Apenas os editores autorizados do Registro Geral podem cadastrar oficiais';
  end if;
  if p_requisicao is null then raise exception 'Identificador de cadastro obrigatório'; end if;
  if p_nome is null or p_nome ~ '[[:cntrl:]]' then raise exception 'Nome inválido'; end if;
  p_nome=regexp_replace(btrim(p_nome),'[[:space:]]+',' ','g');
  if length(p_nome)<2 or length(p_nome)>120 then raise exception 'Nome deve ter de 2 a 120 caracteres'; end if;
  if p_contingente is null or p_contingente not in ('New Hanover','West Elizabeth','Lemoyne','Sem jurisdição') then raise exception 'Contingente inválido'; end if;
  if p_situacao is null or p_situacao not in ('Ativo','Pendente','Inativo') then raise exception 'Situação inicial inválida'; end if;
  p_observacao=btrim(coalesce(p_observacao,''));
  if length(p_observacao)>400 then raise exception 'Observação deve ter no máximo 400 caracteres'; end if;
  -- Serializa cadastros para reservar a próxima ordem e conferir duplicados.
  perform pg_advisory_xact_lock(763110261);
  v_id=p_requisicao::text;
  select * into v_existente from public.cavalaria_oficiais where id=v_id;
  if found then
    if v_existente.modified_by=auth.uid() and v_existente.executed_at is null
       and v_existente.nome=p_nome and v_existente.origem=p_contingente
       and v_existente.status=p_situacao and v_existente.observacao=p_observacao then
      return v_id;
    end if;
    raise exception 'Esta solicitação já foi usada. Confira o registro antes de tentar novamente';
  end if;
  if exists(select 1 from public.cavalaria_oficiais where executed_at is null
    and lower(regexp_replace(btrim(nome),'[[:space:]]+',' ','g'))=lower(p_nome)) then
    raise exception 'Já existe um oficial com esse nome no efetivo. Use Editar oficial para corrigir ou transferir';
  end if;
  select coalesce(max(ordem),0)+1 into v_ordem from public.cavalaria_oficiais;
  insert into public.cavalaria_oficiais(id,ordem,nome,origem,status,destino,observacao,modified_by)
    values(v_id,v_ordem,p_nome,p_contingente,p_situacao,'A definir',p_observacao,auth.uid());
  insert into public.cavalaria_auditoria(oficial_id,oficial_nome,autor_id,autor_email,antes,depois)
    values(v_id,p_nome,auth.uid(),coalesce(auth.jwt()->>'email','sistema'),null,
      jsonb_build_object('operacao','cadastro','nome',p_nome,'contingente',p_contingente,'situacao',p_situacao,'destino','A definir','observacao',p_observacao,'exonerado_em',null));
  return v_id;
end $$;
revoke all on function public.criar_oficial(uuid,text,text,text,text) from public,anon;
grant execute on function public.criar_oficial(uuid,text,text,text,text) to authenticated;
commit;
