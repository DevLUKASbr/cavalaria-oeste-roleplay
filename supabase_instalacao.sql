-- Execute uma única vez em Supabase > SQL Editor (projeto NOVO).
-- Autenticação por e-mail/senha + allowlist; NUNCA expor service_role no navegador.
create extension if not exists pgcrypto;
create table if not exists public.cavalaria_membros (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('admin','xerife')),
  cadastrado_em timestamptz not null default now()
);
create table if not exists public.cavalaria_oficiais (
  id text primary key, ordem integer not null unique, nome text not null,
  origem text not null check (origem in ('New Hanover','West Elizabeth','Lemoyne','Sem jurisdição')),
  status text not null default 'Pendente' check (status in ('Pendente','Ativo','Inativo','Exonerar')),
  destino text not null default 'A definir' check (destino in ('A definir','New Hanover','West Elizabeth','Lemoyne','Sem jurisdição')),
  observacao text not null default '' check(length(observacao)<=400),
  executed_at timestamptz,
  executed_by uuid references auth.users(id),
  executed_by_email text,
  modified_at timestamptz not null default now(),
  modified_by uuid references auth.users(id),
  constraint exec_consistency check ((executed_at is null and executed_by is null) or (executed_at is not null and executed_by is not null and status='Exonerar'))
);
create table if not exists public.cavalaria_auditoria (
  id bigint generated always as identity primary key,
  oficial_id text not null,
  oficial_nome text not null,
  alterado_em timestamptz not null default now(),
  autor_id uuid,
  autor_email text,
  antes jsonb,
  depois jsonb
);
-- Permite checar a lista autorizada sem recursão nas políticas.
create or replace function public.cavalaria_autorizado() returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.cavalaria_membros where user_id=auth.uid()); $$;
revoke all on function public.cavalaria_autorizado() from public;
grant execute on function public.cavalaria_autorizado() to authenticated;

alter table public.cavalaria_membros enable row level security;
alter table public.cavalaria_oficiais enable row level security;
alter table public.cavalaria_auditoria enable row level security;

create policy "Membro ve o proprio cargo" on public.cavalaria_membros for select to authenticated using(user_id=auth.uid());
create policy "Autorizados leem oficiais" on public.cavalaria_oficiais for select to authenticated using(public.cavalaria_autorizado());
create policy "Autorizados editam oficiais" on public.cavalaria_oficiais for update to authenticated using(public.cavalaria_autorizado() and executed_at is null) with check(public.cavalaria_autorizado());
create policy "Autorizados leem auditoria" on public.cavalaria_auditoria for select to authenticated using(public.cavalaria_autorizado());

revoke all on public.cavalaria_membros,public.cavalaria_oficiais,public.cavalaria_auditoria from anon;
grant select on public.cavalaria_membros to authenticated;
grant select,update(status,destino,observacao) on public.cavalaria_oficiais to authenticated;
grant select on public.cavalaria_auditoria to authenticated;

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
create trigger cavalaria_verificar_atualizacao before update on public.cavalaria_oficiais
for each row execute function public.cavalaria_antes_atualizar();

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
create trigger cavalaria_auditar_atualizacao after update on public.cavalaria_oficiais
for each row execute function public.cavalaria_registrar_auditoria();

create or replace function public.confirmar_exoneracao(p_oficial text) returns boolean
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if not public.cavalaria_autorizado() then raise exception 'Acesso negado'; end if;
 update public.cavalaria_oficiais
 set executed_at=now(),executed_by=auth.uid(),executed_by_email=coalesce(auth.jwt()->>'email','não informado')
 where id=p_oficial and executed_at is null and status='Exonerar';
 get diagnostics n=row_count;
 return n=1;
end $$;
revoke all on function public.confirmar_exoneracao(text) from public,anon;
grant execute on function public.confirmar_exoneracao(text) to authenticated;

create or replace function public.reverter_exoneracao(p_oficial text, p_justificativa text) returns boolean
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if not exists(select 1 from public.cavalaria_membros where user_id=auth.uid() and role='admin') then raise exception 'Apenas o Alto Comando pode reverter exonerações'; end if;
 if p_justificativa is null or length(trim(p_justificativa)) < 10 then raise exception 'Justificativa obrigatória com pelo menos 10 caracteres'; end if;
 perform set_config('app.cavalaria_reversao','1',true);
 perform set_config('app.cavalaria_justificativa',trim(p_justificativa),true);
 update public.cavalaria_oficiais
 set status='Ativo',executed_at=null,executed_by=null,executed_by_email=null
 where id=p_oficial and executed_at is not null;
 get diagnostics n=row_count;
 return n=1;
end $$;
revoke all on function public.reverter_exoneracao(text,text) from public,anon;
grant execute on function public.reverter_exoneracao(text,text) to authenticated;

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

-- Realtime (executar uma só vez; o bloco evita erro se a tabela já estiver na publicação).
do $$begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cavalaria_oficiais') then
   alter publication supabase_realtime add table public.cavalaria_oficiais;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cavalaria_auditoria') then
   alter publication supabase_realtime add table public.cavalaria_auditoria;
 end if;
end$$;

-- Carga inicial: 109 oficiais, sem duplicar registros existentes.
insert into public.cavalaria_oficiais(id,ordem,nome,origem) values
('1-1',1,'Troy Riley','New Hanover'),
('1-2',2,'Alexandre Buck','New Hanover'),
('1-3',3,'Bahia De La Plata','New Hanover'),
('1-4',4,'Clarck Bunneth','New Hanover'),
('1-5',5,'Mary Bennet','New Hanover'),
('1-6',6,'Pele Demoin','New Hanover'),
('1-7',7,'Scobar Campbell','New Hanover'),
('1-8',8,'Thonny Hawke','New Hanover'),
('1-9',9,'Vasco da Gama','New Hanover'),
('1-10',10,'Gilbert Soprano','New Hanover'),
('1-11',11,'Chico Prado','New Hanover'),
('1-12',12,'Jhon Wayne','New Hanover'),
('1-13',13,'Miguel Ranger','New Hanover'),
('1-14',14,'Shasta Hammer','New Hanover'),
('1-15',15,'Thomas Abravanel','New Hanover'),
('1-16',16,'Toom Salles','New Hanover'),
('1-17',17,'Alex Zruk','New Hanover'),
('1-18',18,'Amanda Abravanel','New Hanover'),
('1-19',19,'Arian wholker','New Hanover'),
('1-20',20,'Arthur Corleone','New Hanover'),
('1-21',21,'Arturo Sebastião','New Hanover'),
('1-22',22,'Ben Silver','New Hanover'),
('1-23',23,'Billy Buck','New Hanover'),
('1-24',24,'Bruce Spindola','New Hanover'),
('1-25',25,'Cleson Pinto','New Hanover'),
('1-26',26,'Dhom Australopithecus','New Hanover'),
('1-27',27,'Diego','New Hanover'),
('1-28',28,'Doug Morgan','New Hanover'),
('1-29',29,'Duane Johnson','New Hanover'),
('1-30',30,'Edi Bill','New Hanover'),
('1-31',31,'Everton greves','New Hanover'),
('1-32',32,'Felipe Abravanel','New Hanover'),
('1-33',33,'Frank Gallagher','New Hanover'),
('1-34',34,'Gezar Gallagher','New Hanover'),
('1-35',35,'GIBIMBA BADECO','New Hanover'),
('1-36',36,'Guto Hernandez','New Hanover'),
('1-37',37,'Harry Hayes','New Hanover'),
('1-38',38,'Jhon Mackenzie','New Hanover'),
('1-39',39,'Korea Hwangbo','New Hanover'),
('1-40',40,'Leno Witer','New Hanover'),
('1-41',41,'Lindomar jackson','New Hanover'),
('1-42',42,'Marco Lajoy','New Hanover'),
('1-43',43,'Mateo Santiago','New Hanover'),
('1-44',44,'Mitsuke Yamoshi','New Hanover'),
('1-45',45,'Moe McCord','New Hanover'),
('1-46',46,'Nathan','New Hanover'),
('1-47',47,'Debi','New Hanover'),
('1-48',48,'Loid','New Hanover'),
('1-49',49,'Ruanito Spellman','New Hanover'),
('1-50',50,'Shao Kahn','New Hanover'),
('1-51',51,'Silas Black','New Hanover'),
('1-52',52,'Taison Argentti','New Hanover'),
('1-53',53,'Thomas Walker','New Hanover'),
('1-54',54,'Victória Ashford','New Hanover'),
('1-55',55,'Vladimir Buck','New Hanover'),
('1-56',56,'Wyatt Coler','New Hanover'),
('1-57',57,'Xandao da Muamba','New Hanover'),
('2-1',58,'Carter Slade','West Elizabeth'),
('2-2',59,'Charles Lansky','West Elizabeth'),
('2-3',60,'Cevero Sneipe','West Elizabeth'),
('2-4',61,'Clint McCoy','West Elizabeth'),
('2-5',62,'Bella Dobre Sombra','West Elizabeth'),
('2-6',63,'Antônio Lampião','West Elizabeth'),
('2-7',64,'Arthur Hendrix','West Elizabeth'),
('2-8',65,'Bat Masterson','West Elizabeth'),
('2-9',66,'Becker Jass','West Elizabeth'),
('2-10',67,'Buck Sarampo','West Elizabeth'),
('2-11',68,'César Castillo','West Elizabeth'),
('2-12',69,'David Mihalk','West Elizabeth'),
('2-13',70,'Erick Pulgar De Arrascaeta','West Elizabeth'),
('2-14',71,'Finley Morton','West Elizabeth'),
('2-15',72,'Gabriela SanwhitersonJhonson','West Elizabeth'),
('2-16',73,'Hazard Forastey','West Elizabeth'),
('2-17',74,'Henry Bartolomeu','West Elizabeth'),
('2-18',75,'James Jhonson','West Elizabeth'),
('2-19',76,'Jenny Hawtorn','West Elizabeth'),
('2-20',77,'Jesse James','West Elizabeth'),
('2-21',78,'Jessie Hendrix','West Elizabeth'),
('2-22',79,'Jessie May','West Elizabeth'),
('2-23',80,'Jhom Cárter','West Elizabeth'),
('2-24',81,'Jhonn Reese','West Elizabeth'),
('2-25',82,'Jhoony Marron','West Elizabeth'),
('2-26',83,'Julião Meireles','West Elizabeth'),
('2-27',84,'Kawan Thorne','West Elizabeth'),
('2-28',85,'Leonardo Kowalski','West Elizabeth'),
('2-29',86,'Lilian Bloom','West Elizabeth'),
('2-30',87,'LUKINHA','West Elizabeth'),
('2-31',88,'Milena Bianchi','West Elizabeth'),
('2-32',89,'Muh Said','West Elizabeth'),
('2-33',90,'Pelezinha Clementina','West Elizabeth'),
('2-34',91,'Polly Bowdin','West Elizabeth'),
('2-35',92,'Tonho Mortadela','West Elizabeth'),
('2-36',93,'Vanderlei Jackson','West Elizabeth'),
('3-1',94,'Bella Jackson','Lemoyne'),
('3-2',95,'Alexei Jackson','Lemoyne'),
('3-3',96,'Dallas Cooper','Lemoyne'),
('3-4',97,'Levi','Lemoyne'),
('3-5',98,'Sivirino Lampião','Lemoyne'),
('4-1',99,'Black Frost','Sem jurisdição'),
('4-2',100,'Chico Shenko','Sem jurisdição'),
('4-3',101,'Claine Brasa','Sem jurisdição'),
('4-4',102,'Edward Serafim','Sem jurisdição'),
('4-5',103,'Italo Novak','Sem jurisdição'),
('4-6',104,'Jack Kovarik','Sem jurisdição'),
('4-7',105,'Jose Raimundo','Sem jurisdição'),
('4-8',106,'Odger Brewer','Sem jurisdição'),
('4-9',107,'Rafael Landic','Sem jurisdição'),
('4-10',108,'Rip Wheeler','Sem jurisdição'),
('4-11',109,'Rolando Carter','Sem jurisdição')
on conflict (id) do nothing;
