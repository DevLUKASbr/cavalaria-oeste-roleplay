-- QA com cadastros fictícios; tudo é revertido ao final.
begin;
do $$
declare v_user uuid;
begin
  select user_id into v_user from public.cavalaria_membros where role='admin' limit 1;
  if v_user is null then raise exception 'QA requer um editor autorizado'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated','email','qa-cadastro@example.test')::text,true);
  perform set_config('app.qa_cadastro_id',gen_random_uuid()::text,true);
  perform set_config('app.qa_cadastro_nome','QA Cadastro '||right(current_setting('app.qa_cadastro_id'),8),true);
  if has_table_privilege('authenticated','public.cavalaria_oficiais','INSERT') then raise exception 'QA: INSERT direto não deveria estar disponível'; end if;
  if has_function_privilege('anon','public.criar_oficial(uuid,text,text,text,text)','EXECUTE') then raise exception 'QA: anon não pode cadastrar'; end if;
end $$;
set local role authenticated;
select public.criar_oficial(current_setting('app.qa_cadastro_id')::uuid,current_setting('app.qa_cadastro_nome'),'Lemoyne','Ativo','Teste reversível');
select public.criar_oficial(current_setting('app.qa_cadastro_id')::uuid,current_setting('app.qa_cadastro_nome'),'Lemoyne','Ativo','Teste reversível');
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.cavalaria_oficiais where id=current_setting('app.qa_cadastro_id');
  if v_count<>1 then raise exception 'QA: repetição duplicou o cadastro'; end if;
  if not exists(select 1 from public.cavalaria_oficiais where id=current_setting('app.qa_cadastro_id') and origem='Lemoyne' and status='Ativo' and destino='A definir' and executed_at is null and modified_by=auth.uid()) then raise exception 'QA: cadastro incorreto'; end if;
  select count(*) into v_count from public.cavalaria_auditoria where oficial_id=current_setting('app.qa_cadastro_id') and antes is null and depois->>'operacao'='cadastro' and autor_id=auth.uid();
  if v_count<>1 then raise exception 'QA: auditoria de criação incorreta'; end if;
  begin
    perform public.criar_oficial(gen_random_uuid(),lower(current_setting('app.qa_cadastro_nome')),'New Hanover','Ativo','');
    raise exception 'QA: duplicado aceito';
  exception when raise_exception then
    if sqlerrm='QA: duplicado aceito' then raise; end if;
  end;
  begin
    perform public.criar_oficial(gen_random_uuid(),'QA inválido','Contingente inexistente','Ativo','');
    raise exception 'QA: contingente inválido aceito';
  exception when raise_exception then
    if sqlerrm='QA: contingente inválido aceito' then raise; end if;
  end;
  begin
    perform public.criar_oficial(gen_random_uuid(),'QA inválido','Lemoyne','Exonerar','');
    raise exception 'QA: situação inicial inválida aceita';
  exception when raise_exception then
    if sqlerrm='QA: situação inicial inválida aceita' then raise; end if;
  end;
end $$;
update public.cavalaria_oficiais set status='Exonerar' where id=current_setting('app.qa_cadastro_id');
select public.confirmar_exoneracao(current_setting('app.qa_cadastro_id'));
select public.criar_oficial(gen_random_uuid(),current_setting('app.qa_cadastro_nome'),'West Elizabeth','Pendente','Readmissão fictícia');
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.cavalaria_oficiais where nome=current_setting('app.qa_cadastro_nome');
  if v_count<>2 then raise exception 'QA: histórico de readmissão não preservado'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
begin
  begin
    perform public.criar_oficial(gen_random_uuid(),'QA sem autorização','Lemoyne','Ativo','');
    raise exception 'QA: conta não autorizada cadastrou';
  exception when raise_exception then
    if sqlerrm='QA: conta não autorizada cadastrou' then raise; end if;
  end;
end $$;
reset role;
rollback;
select 'Cadastro, repetição segura, validações, duplicados, auditoria e autorização aprovados; testes revertidos.' as resultado;
