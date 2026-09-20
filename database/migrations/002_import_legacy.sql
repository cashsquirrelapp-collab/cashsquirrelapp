-- Apply once, after 001, while the old app and LINE/cron writes are paused.
begin;
do $$ declare field text; t text; begin
 if to_regclass('public.user_cashflow_data') is null then return; end if;
 if exists(select 1 from public.user_cashflow_data where nullif(notif_settings->>'lineUserId','') is not null group by notif_settings->>'lineUserId' having count(*)>1) then
  raise exception 'Duplicate LINE owners: resolve links before importing';
 end if;
 foreach field in array array['jobs','expenses','goals'] loop
  t:='cashflow_'||field;
  execute format('insert into public.%I(user_id,id,data) select old.user_id,item->>''id'',item from public.user_cashflow_data old join auth.users u on u.id=old.user_id cross join lateral jsonb_array_elements(coalesce(old.%I,''[]'')) item where nullif(item->>''id'','''') is not null on conflict do nothing',t,field);
 end loop;
 foreach field in array array['settings','statuses','job_types','avatar_data_url'] loop
  -- The avatar column may not exist in very old installations.
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='user_cashflow_data' and column_name=field) then
   execute format('insert into public.cashflow_documents(user_id,id,data) select old.user_id,$1,to_jsonb(old.%I) from public.user_cashflow_data old join auth.users u on u.id=old.user_id where old.%I is not null on conflict do nothing',field,field) using field;
  end if;
 end loop;
 insert into public.cashflow_documents(user_id,id,data)
 select old.user_id,'notif_settings',coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(old.notif_settings,'{}')) where key in ('enabled','alertEmail','serviceType','emailjsServiceId','emailjsTemplateId','emailjsPublicKey','pendingQueue','dailyDigestEnabled','monthlyReportEnabled')),'{}')
 from public.user_cashflow_data old join auth.users u on u.id=old.user_id on conflict do nothing;
 insert into public.cashflow_private_state(user_id,data)
 select old.user_id,coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(old.notif_settings,'{}')) where key in ('pendingJobDraft','pendingExpenseDraft','userName','nameAskedAt','chatHistory','chatHistoryUpdatedAt','lastDigestSentDate','lastMonthlyReportSentMonth')),'{}')
 from public.user_cashflow_data old join auth.users u on u.id=old.user_id on conflict do nothing;
 insert into public.cashflow_line_links(user_id,line_user_id)
 select old.user_id,old.notif_settings->>'lineUserId' from public.user_cashflow_data old join auth.users u on u.id=old.user_id where nullif(old.notif_settings->>'lineUserId','') is not null on conflict do nothing;
 -- Preserve the original table for reconciliation; old tokens can no longer read or modify it.
 revoke all on public.user_cashflow_data from public,anon,authenticated,service_role;
 grant select on public.user_cashflow_data to service_role;
end $$;
commit;
