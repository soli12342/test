create function public.stage_import_v1(source uuid,filename text,content text) returns uuid language plpgsql security definer set search_path='' as $$declare p public.source_permissions; b uuid; h text; begin
 perform private.require_admin();
 select * into p from public.source_permissions where source_id=source;
 if not coalesce(p.collect_allowed and p.store_raw_allowed and p.store_derived_allowed and (p.expires_at is null or p.expires_at>now()),false) or not exists(select 1 from public.sources where id=source and enabled and kind='amazon_rank') then raise exception 'SOURCE_NOT_CONFIGURED'; end if;
 if octet_length(content)>5242880 or filename !~ '^[^/\\]{1,200}\.(csv|json)$' or content='' then raise exception 'VALIDATION_FAILED'; end if;
 h:=encode(sha256(convert_to(content,'UTF8')),'hex');
 insert into public.import_batches(uploader_id,source_id,file_hash,filename) values(auth.uid(),source,h,filename) on conflict(source_id,file_hash) do nothing returning id into b;
 if b is null then select id into b from public.import_batches where source_id=source and file_hash=h; return b; end if;
 insert into private.import_payloads values(b,content,least(now()+make_interval(days=>p.raw_ttl),coalesce(p.expires_at,'infinity')));
 insert into public.job_requests(kind,requested_by,batch_id) values('validate_import',auth.uid(),b);
 insert into private.audit_logs(actor,action,target) values(auth.uid(),'import_uploaded',b::text); return b; end$$;
create function public.approve_import_v1(batch uuid) returns uuid language plpgsql security definer set search_path='' as $$declare j uuid; begin
 perform private.require_admin();
 perform 1 from public.import_batches where id=batch and state='needs_review' for update;
 if not found then raise exception 'VALIDATION_FAILED'; end if;
 if not exists(select 1 from private.import_payloads where batch_id=batch and expires_at>now()) then raise exception 'SOURCE_BLOCKED'; end if;
 update public.import_batches set state='approved' where id=batch;
 insert into public.job_requests(kind,requested_by,batch_id) values('commit_import',auth.uid(),batch) returning id into j;
 insert into private.audit_logs(actor,action,target) values(auth.uid(),'import_approved',batch::text); return j; end$$;

-- Worker RPCs are SECURITY INVOKER and executable only by service_role.
create function public.claim_import_job_v1() returns jsonb language plpgsql set search_path='' as $$declare j public.job_requests; b public.import_batches; payload text; hosts text[]; begin
 delete from private.import_payloads p where p.expires_at<=now() or exists(select 1 from public.import_batches ib join public.source_permissions sp on sp.source_id=ib.source_id where ib.id=p.batch_id and (not sp.store_raw_allowed or not sp.collect_allowed or (sp.expires_at is not null and sp.expires_at<=now())));
 select * into j from public.job_requests where attempts<3 and (state='queued' or (state='running' and lease_until<now())) order by requested_at for update skip locked limit 1;
 if j.id is null then return null; end if;
 update public.job_requests set state='running',started_at=now(),lease_until=now()+interval '5 minutes',attempts=attempts+1 where id=j.id;
 select * into b from public.import_batches where id=j.batch_id;
 select content into payload from private.import_payloads where batch_id=b.id and expires_at>now();
 select allowed_hosts into hosts from public.sources where id=b.source_id;
 return jsonb_build_object('id',j.id,'kind',j.kind,'batch_id',b.id,'filename',b.filename,'content',payload,'source_id',b.source_id,'allowed_hosts',hosts);
 end$$;
create function public.finish_validation_v1(job uuid,errors jsonb,warnings jsonb,summary jsonb) returns void language plpgsql set search_path='' as $$declare j public.job_requests; begin
 select * into j from public.job_requests where id=job and kind='validate_import' and state='running' for update;
 if j.id is null then raise exception 'VALIDATION_FAILED'; end if;
 update public.import_batches set state=case when jsonb_array_length(finish_validation_v1.errors)>0 then 'failed' else 'needs_review' end,errors=finish_validation_v1.errors,warnings=finish_validation_v1.warnings,summary=finish_validation_v1.summary where id=j.batch_id;
 if jsonb_array_length(finish_validation_v1.errors)>0 then update public.sources set status='failed',last_checked_at=now() where id=(select source_id from public.import_batches where id=j.batch_id); end if;
 update public.job_requests set state=case when jsonb_array_length(finish_validation_v1.errors)>0 then 'failed' else 'done' end,lease_until=null where id=j.id;
 insert into public.collection_runs(source_id,job_id,status,finished_at) select source_id,job,case when jsonb_array_length(finish_validation_v1.errors)>0 then 'failed' else 'validated' end,now() from public.import_batches where id=j.batch_id;
 end$$;
create function public.fail_import_job_v1(job uuid) returns void language plpgsql set search_path='' as $$begin
 update public.import_batches set state='failed',errors='[{"code":"SERVER_VALIDATION_FAILED"}]' where id=(select batch_id from public.job_requests where id=job);
 update public.sources set status='failed',last_checked_at=now() where id=(select source_id from public.import_batches where id=(select batch_id from public.job_requests where id=job));
 update public.job_requests set state='failed',lease_until=null where id=job;
 end$$;
create function public.commit_amazon_v1(rows jsonb,batch uuid default null) returns jsonb language plpgsql set search_path='' as $$declare
 grp record; r jsonb; src public.sources; perm public.source_permissions; cat public.categories; sid uuid; lid uuid; rid uuid; row_count integer; distinct_ranks integer; distinct_asins integer; hash text; rev integer; dt date; obs timestamptz; precision text; slot_value text; ids jsonb:='[]'; existing boolean; b public.import_batches;
 begin
 if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 10000 or octet_length(rows::text)>10485760 then raise exception 'VALIDATION_FAILED'; end if;
 if batch is not null then
 select * into b from public.import_batches where id=batch for update;
 if b.state='committed' then return jsonb_build_object('status','already_committed'); end if;
 if b.state is distinct from 'approved' or not exists(select 1 from private.memberships where user_id=b.uploader_id and active and role='admin') then raise exception 'FORBIDDEN'; end if;
 end if;
 -- Full validation precedes every write; exceptions roll back the whole multi-snapshot file.
 for r in select value from jsonb_array_elements(rows) loop
 if (select count(*) from jsonb_object_keys(r))<>13 or not r ?& array['schema_version','source_ref','marketplace','category_ref','observation_date','observed_at','time_precision','snapshot_ref','rank','asin','title','brand','source_url'] or r->>'schema_version' is distinct from '1.0' or r->>'rank' !~ '^([1-9]|[1-9][0-9]|100)$' or jsonb_typeof(r->'rank')<>'number' or r->>'asin' !~ '^[A-Z0-9]{10}$' or r->>'marketplace' not in ('US','GB','DE','FR','IT','ES') or r->>'time_precision' not in ('date','timestamp') or r->>'snapshot_ref' !~ '^[a-zA-Z0-9_.:-]{1,100}$' or coalesce(length(r->>'title'),0) not between 1 and 500 or coalesce(length(r->>'brand'),1000)>150 or (r->>'title') ~ '[<>]' or (r->>'brand') ~ '[<>]' or r->>'observation_date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'VALIDATION_FAILED'; end if;
 select * into src from public.sources where ref=r->>'source_ref' and kind='amazon_rank' and enabled;
 if src.id is null or (batch is not null and b.source_id<>src.id) then raise exception 'SOURCE_NOT_CONFIGURED'; end if;
 select * into perm from public.source_permissions where source_id=src.id;
 if not coalesce(perm.collect_allowed and perm.store_derived_allowed and perm.evidence_ref is not null and (perm.expires_at is null or perm.expires_at>now()),false) then raise exception 'SOURCE_BLOCKED'; end if;
 if not exists(select 1 from unnest(src.allowed_hosts) h where r->>'source_url' like 'https://'||h||'/%') or (r->>'source_url') ~ '[[:space:]]' then raise exception 'URL_NOT_ALLOWED'; end if;
 select * into cat from public.categories where ref=r->>'category_ref' and marketplace=r->>'marketplace' and verification_status='verified';
 if cat.id is null then raise exception 'SOURCE_NOT_CONFIGURED'; end if;
 dt:=(r->>'observation_date')::date;
 if r->>'time_precision'='date' then if r->'observed_at'<>'null'::jsonb then raise exception 'VALIDATION_FAILED'; end if;
 else
 if r->>'observed_at' is null or r->>'observed_at' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'VALIDATION_FAILED'; end if;
 obs:=(r->>'observed_at')::timestamptz; if (obs at time zone 'Asia/Seoul')::date<>dt then raise exception 'KST_DATE_MISMATCH'; end if;
 end if;
 end loop;
 for grp in select value->>'source_ref' source_ref,value->>'category_ref' category_ref,value->>'snapshot_ref' snapshot_ref,jsonb_agg(value order by (value->>'rank')::integer) items from jsonb_array_elements(rows) group by 1,2,3 order by 1,2,3 loop
 select * into src from public.sources where ref=grp.source_ref for update;
 select * into perm from public.source_permissions where source_id=src.id;
 select * into cat from public.categories where ref=grp.category_ref;
 select count(*),count(distinct value->>'rank'),count(distinct value->>'asin') into row_count,distinct_ranks,distinct_asins from jsonb_array_elements(grp.items);
 if row_count<>distinct_ranks or row_count<>distinct_asins or row_count>100 or (select count(distinct (value->>'observation_date',value->>'observed_at',value->>'time_precision')) from jsonb_array_elements(grp.items))<>1 then raise exception 'DUPLICATE_OR_METADATA_CONFLICT'; end if;
 r:=grp.items->0; dt:=(r->>'observation_date')::date; obs:=(r->>'observed_at')::timestamptz; precision:=r->>'time_precision'; slot_value:=case when precision='date' then 'date_only' else (obs at time zone 'UTC')::time::text end;
 hash:=encode(sha256(convert_to((select jsonb_agg(value-'snapshot_ref' order by (value->>'rank')::integer)::text from jsonb_array_elements(grp.items)),'UTF8')),'hex');
 select id into sid from public.amazon_snapshots where source_id=src.id and category_id=cat.id and content_hash=hash;
 existing:=sid is not null;
 if not existing then
 select coalesce(max(revision),0)+1 into rev from public.amazon_snapshots where source_id=src.id and category_id=cat.id and kst_date=dt and slot=slot_value;
 insert into public.collection_runs(source_id,status,counts,finished_at) values(src.id,case when row_count=100 then 'complete' else 'partial' end,jsonb_build_object('rows',row_count),now()) returning id into rid;
 insert into public.amazon_snapshots(source_id,run_id,category_id,snapshot_ref,observed_at,kst_date,time_precision,slot,actual_count,completeness,content_hash,revision,backfill,expires_at) values(src.id,rid,cat.id,grp.snapshot_ref,obs,dt,precision,slot_value,row_count,case when row_count=100 then 'complete' else 'partial' end,hash,rev,dt<(now() at time zone 'Asia/Seoul')::date,least(now()+make_interval(days=>perm.derived_ttl),coalesce(perm.expires_at,'infinity'))) returning id into sid;
 for r in select value from jsonb_array_elements(grp.items) loop
 insert into public.listings(marketplace,asin,title) values(r->>'marketplace',r->>'asin','ASIN '||(r->>'asin')) on conflict(marketplace,asin) do nothing;
 select id into lid from public.listings where marketplace=r->>'marketplace' and asin=r->>'asin';
 insert into public.amazon_rank_entries(snapshot_id,position,listing_id,raw_brand,observed_title,source_url) values(sid,(r->>'rank')::integer,lid,r->>'brand',r->>'title',r->>'source_url');
 end loop;
 if not exists(select 1 from public.snapshot_selections where category_id=cat.id and kst_date=dt and slot=slot_value) then
 insert into public.snapshot_selections(marketplace,category_id,kst_date,slot,snapshot_id,reason) values(cat.marketplace,cat.id,dt,slot_value,sid,'First validated observation; later revisions require Admin selection');
 end if;
 update public.sources set status=case when row_count=100 then 'normal' else 'partial' end,last_checked_at=now() where id=src.id;
 end if;
 ids:=ids||jsonb_build_object('snapshot_id',sid,'duplicate',existing);
 end loop;
 if batch is not null then
 update public.import_batches set state='committed' where id=batch;
 update public.job_requests set state='done',lease_until=null where batch_id=batch and kind='commit_import';
 delete from private.import_payloads where batch_id=batch;
 insert into private.audit_logs(actor,action,target) values(b.uploader_id,'import_committed',batch::text);
 end if;
 return jsonb_build_object('status','committed','snapshots',ids); end$$;
revoke all on function public.stage_import_v1(uuid,text,text),public.approve_import_v1(uuid) from public;
grant execute on function public.stage_import_v1(uuid,text,text),public.approve_import_v1(uuid) to authenticated;
revoke all on function public.claim_import_job_v1(),public.finish_validation_v1(uuid,jsonb,jsonb,jsonb),public.fail_import_job_v1(uuid),public.commit_amazon_v1(jsonb,uuid) from public,authenticated,anon;
grant execute on function public.claim_import_job_v1(),public.finish_validation_v1(uuid,jsonb,jsonb,jsonb),public.fail_import_job_v1(uuid),public.commit_amazon_v1(jsonb,uuid) to service_role;
