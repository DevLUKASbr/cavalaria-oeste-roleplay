-- QA transacional: dados fictícios, alterações e auditoria desfeitos no final.
-- Executar como postgres no SQL Editor, depois da migração 20261026.
begin;
do $$
declare v_user uuid;
begin
  select user_id into v_user from public.cavalaria_membros where role='admin' limit 1;
  if v_user is null then raise exception 'QA requer uma conta de comando existente'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated','email','qa-registro@example.test')::text,true);
  insert into public.cavalaria_oficiais(id,ordem,nome,origem,status,destino)
  select 'qa-registros-transacional',coalesce(max(ordem),0)+1,'Oficial fictício QA','New Hanover','Ativo','West Elizabeth' from public.cavalaria_oficiais;
end $$;
set local role authenticated;
select public.corrigir_oficial(id,'Oficial QA corrigido','West Elizabeth',nome,origem,modified_at) from public.cavalaria_oficiais where id='qa-registros-transacional';
do $$
begin
  if not exists(select 1 from public.cavalaria_auditoria where oficial_id='qa-registros-transacional'
    and antes->>'nome'='Oficial fictício QA' and depois->>'nome'='Oficial QA corrigido'
    and antes->>'contingente'='New Hanover' and depois->>'contingente'='West Elizabeth' and autor_id=auth.uid()) then raise exception 'QA: auditoria de correção e transferência ausente'; end if;
  begin
    perform public.corrigir_oficial(id,' ','West Elizabeth',nome,origem,modified_at) from public.cavalaria_oficiais where id='qa-registros-transacional';
    raise exception 'QA: nome inválido aceito';
  exception when raise_exception then
    if sqlerrm='QA: nome inválido aceito' then raise; end if;
  end;
  begin
    update public.cavalaria_oficiais set id='qa-id-alterado' where id='qa-registros-transacional';
    raise exception 'QA: identificador alterado';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.cavalaria_oficiais set status='Exonerar' where id='qa-registros-transacional';
select public.confirmar_exoneracao('qa-registros-transacional');
do $$
declare v_count integer;
begin
  begin
    perform public.corrigir_oficial(id,'Tentativa bloqueada',origem,nome,origem,modified_at) from public.cavalaria_oficiais where id='qa-registros-transacional';
    raise exception 'QA: exonerado editável';
  exception when raise_exception then
    if sqlerrm='QA: exonerado editável' then raise; end if;
  end;
end $$;
select public.reverter_exoneracao('qa-registros-transacional','Reversão fictícia de QA transacional');
do $$
begin
  if not exists(select 1 from public.cavalaria_oficiais where id='qa-registros-transacional' and status='Ativo' and executed_at is null and nome='Oficial QA corrigido') then raise exception 'QA: reversão ou nome não preservado'; end if;
end $$;
reset role;
do $$
begin
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
end $$;
set local role authenticated;
do $$
declare v_count integer;
begin
  begin
    perform public.corrigir_oficial('qa-registros-transacional','Sem autorização','West Elizabeth','Oficial QA corrigido','West Elizabeth',null);
    raise exception 'QA: conta não autorizada editou';
  exception when raise_exception then
    if sqlerrm='QA: conta não autorizada editou' then raise; end if;
  end;
end $$;
reset role;
rollback;
select 'QA de nome, transferência, auditoria, RLS, exoneração e reversão aprovado; dados fictícios revertidos.' as resultado;
