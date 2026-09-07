create function private.apr_family(listing uuid,day date,cutoff timestamptz) returns uuid language plpgsql stable security definer set search_path='' as $$declare a public.listing_assignments; begin
 perform private.require_member();
 select * into a from public.listing_assignments where listing_id=listing and recorded_at<=cutoff and valid_from<=day order by recorded_at desc,version desc limit 1;
 if a.approval='approved' and exists(select 1 from public.product_families f join public.brands b on b.id=f.brand_id join public.companies c on c.id=b.company_id where f.id=a.product_family_id and c.slug='apr') then return a.product_family_id; end if;
 return null; end$$;
create function private.source_meta(source uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.source_readable(source) then raise exception 'FORBIDDEN'; end if;
 return (select jsonb_build_object('id',s.id,'display_name',s.display_name,'mode',s.mode,'status',s.status,'last_checked_at',s.last_checked_at,'share_allowed',p.share_allowed) from public.sources s join public.source_permissions p on p.source_id=s.id where s.id=source); end$$;
create function public.get_amazon_series_v1(markets text[] default array['US','GB','DE','FR','IT','ES'],category text default 'beauty',date_from date default current_date-29,date_to date default current_date,as_of timestamptz default now(),as_of_mode text default 'system_known',observation_slot text default 'date_only') returns jsonb language plpgsql stable set search_path='' as $$declare output jsonb; cutoff timestamptz; begin
 perform private.require_member();
 if date_to<date_from or date_to-date_from>399 or cardinality(markets) not between 1 and 6 or not markets<@array['US','GB','DE','FR','IT','ES'] or category not in ('beauty','skincare') or as_of_mode not in ('system_known','latest_restated') or as_of>now() then raise exception 'VALIDATION_FAILED'; end if;
 cutoff:=case when as_of_mode='latest_restated' then now() else as_of end;
 with days as (select g::date as day from generate_series((date_from-29)::timestamp,date_to::timestamp,interval '1 day') g),
 base as (select c.marketplace,c.id category_id,c.version category_version,c.verification_status,d.day,a.id snapshot_id,a.source_id,a.completeness,a.actual_count,a.observed_at,a.time_precision,a.first_seen_at,a.revision,a.slot,
 case when a.completeness='complete' then count(e.listing_id) filter(where private.apr_family(e.listing_id,d.day,cutoff) is not null)::numeric end apr_listing_count,
 case when a.completeness='complete' then count(e.listing_id) filter(where e.position<=10 and private.apr_family(e.listing_id,d.day,cutoff) is not null)::numeric end apr_top10_count,
 case when a.completeness='complete' then min(e.position) filter(where private.apr_family(e.listing_id,d.day,cutoff) is not null) end apr_best_rank,
 case when a.completeness='complete' then percentile_cont(0.5) within group(order by e.position) filter(where private.apr_family(e.listing_id,d.day,cutoff) is not null) end apr_median_rank,
 case when a.completeness='complete' then count(distinct private.apr_family(e.listing_id,d.day,cutoff)) end apr_product_family_count,
 count(e.listing_id) filter(where private.apr_family(e.listing_id,d.day,cutoff) is null) unassigned_listing_count,
 case when a.completeness='complete' then 100*coalesce(sum(101-e.position) filter(where private.apr_family(e.listing_id,d.day,cutoff) is not null),0)::numeric/5050 end exposure_index
 from public.categories c cross join days d
 left join lateral(select private.canonical_id(c.id,d.day,observation_slot,cutoff) snapshot_id) selected on true
 left join public.amazon_snapshots a on a.id=selected.snapshot_id and a.first_seen_at<=cutoff
 left join public.amazon_rank_entries e on e.snapshot_id=a.id
 where c.marketplace=any(markets) and c.canonical_type=category
 group by c.id,d.day,a.id),
 averaged as (select *,count(exposure_index) over w7 n_valid_7d,count(exposure_index) over w30 n_valid_30d,
 case when count(exposure_index) over w7>=5 then avg(exposure_index) over w7 end avg_7d,
 case when count(exposure_index) over w30>=24 then avg(exposure_index) over w30 end avg_30d
 from base window w7 as(partition by category_id order by day rows between 6 preceding and current row),w30 as(partition by category_id order by day rows between 29 preceding and current row)),
 shown as (select *,case when day=date_to and private.category_status(category_id) in ('failed','source_blocked','permission_pending') then private.category_status(category_id) when snapshot_id is null then case when verification_status<>'verified' then 'configuration_pending' else 'not_collected' end when completeness='partial' then 'partial' when coalesce(observed_at,(day+1)::timestamp at time zone 'Asia/Seoul')<now()-interval '36 hours' then 'stale' else 'normal' end status from averaged where day between date_from and date_to),
 europe as(select day,count(exposure_index) filter(where marketplace<>'US') n_valid,5 n_expected,case when count(exposure_index) filter(where marketplace<>'US')=5 then sum(exposure_index) filter(where marketplace<>'US')/5 end value from shown group by day)
 select jsonb_build_object('schema_version','1.0','data',coalesce((select jsonb_agg(to_jsonb(s) order by day,marketplace) from shown s),'[]'),
 'europe5',coalesce((select jsonb_agg(to_jsonb(e) order by day) from europe e),'[]'),
 'meta',jsonb_build_object('as_of',cutoff,'as_of_mode',as_of_mode,'metric_version','amazon_exposure_v1','n_valid',(select count(*) from shown where exposure_index is not null),'n_expected',(date_to-date_from+1)*cardinality(markets),'source_refs',(select coalesce(jsonb_agg(private.source_meta(x.source_id)),'[]') from(select distinct source_id from shown where source_id is not null)x),'warnings',jsonb_build_array('순위 기반 노출지수이며 매출·시장점유율이 아닙니다.','미매핑 항목은 APR 집계에서 제외됩니다.')),'error',null) into output;
 return output; end$$;
create function public.get_evidence_v1(evidence_id uuid,as_of timestamptz default now()) returns jsonb language plpgsql stable set search_path='' as $$declare a public.amazon_snapshots; c public.categories; begin
 perform private.require_member(); select * into a from public.amazon_snapshots where id=evidence_id and first_seen_at<=as_of; if a.id is null then raise exception 'FORBIDDEN'; end if;
 select * into c from public.categories where id=a.category_id;
 return jsonb_build_object('snapshot',to_jsonb(a),'category',jsonb_build_object('marketplace',c.marketplace,'canonical_type',c.canonical_type,'node',c.source_node_id,'path',c.path,'version',c.version),'source',private.source_meta(a.source_id),'formula','100 × Σ(101 − APR rank) / 5050','metric_version','amazon_exposure_v1','revisions',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'revision',v.revision,'source_id',v.source_id,'first_seen_at',v.first_seen_at) order by v.first_seen_at),'[]') from public.amazon_snapshots v where v.category_id=a.category_id and v.kst_date=a.kst_date and v.slot=a.slot and v.first_seen_at<=as_of),'selection_history',(select coalesce(jsonb_agg(to_jsonb(x) order by selected_at),'[]') from public.snapshot_selections x where category_id=a.category_id and kst_date=a.kst_date and slot=a.slot and selected_at<=as_of)); end$$;
create function public.get_amazon_snapshot_v1(snapshot_id uuid,as_of timestamptz default now(),as_of_mode text default 'system_known') returns jsonb language plpgsql stable set search_path='' as $$declare a public.amazon_snapshots; prev public.amazon_snapshots; cutoff timestamptz; result jsonb; begin
 perform private.require_member(); if as_of_mode not in ('system_known','latest_restated') or as_of>now() then raise exception 'VALIDATION_FAILED'; end if; cutoff:=case when as_of_mode='latest_restated' then now() else as_of end;
 select * into a from public.amazon_snapshots where id=snapshot_id and first_seen_at<=cutoff; if a.id is null then raise exception 'FORBIDDEN'; end if;
 select s.* into prev from public.amazon_snapshots s where s.source_id=a.source_id and s.category_id=a.category_id and s.slot=a.slot and s.kst_date<a.kst_date and s.completeness='complete' and s.first_seen_at<=cutoff and s.id=private.canonical_id(s.category_id,s.kst_date,s.slot,cutoff) order by s.kst_date desc limit 1;
 with current_rows as(select e.*,l.asin,l.marketplace,e.observed_title title,private.apr_family(l.id,a.kst_date,cutoff) family from public.amazon_rank_entries e join public.listings l on l.id=e.listing_id where e.snapshot_id=a.id),
 prior as(select e.listing_id,e.position,private.apr_family(e.listing_id,prev.kst_date,cutoff) family from public.amazon_rank_entries e where e.snapshot_id=prev.id),
 changes as(select coalesce(c.listing_id,p.listing_id) listing_id,c.asin,c.position rank,p.position previous_rank,
 case when a.completeness='complete' and prev.id is not null then p.position-c.position end rank_change,
 case when c.position is not null then 'ranked' when a.completeness='complete' then 'out_of_top100' else 'unknown' end rank_state,
 a.completeness='complete' and prev.id is not null and p.position is null and c.position is not null new_entry,
 a.completeness='complete' and prev.id is not null and p.position is not null and c.position is null exit
 from current_rows c full join prior p on p.listing_id=c.listing_id where c.family is not null or p.family is not null)
 select jsonb_build_object('snapshot',to_jsonb(a),'entries',coalesce((select jsonb_agg(to_jsonb(c) order by position) from current_rows c),'[]'),'changes',case when a.completeness='complete' and prev.id is not null then coalesce((select jsonb_agg(to_jsonb(x)) from changes x),'[]') else '[]'::jsonb end,'comparison_date',prev.kst_date,'comparison_label',case when prev.kst_date=a.kst_date-1 then '전일 대비' when prev.id is not null then '직전 유효 관측일 대비' else '비교 자료 없음' end,'evidence',public.get_evidence_v1(a.id,cutoff)) into result;
 return result; end$$;
create function public.get_product_history_v1(listing_id uuid,date_from date,date_to date,as_of timestamptz default now()) returns jsonb language plpgsql stable set search_path='' as $$begin
 perform private.require_member(); if date_to<date_from or date_to-date_from>399 or as_of>now() then raise exception 'VALIDATION_FAILED'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('date',s.kst_date,'snapshot_id',s.id,'category_id',s.category_id,'rank',e.position,'rank_state',case when e.position is not null then 'ranked' when s.completeness='complete' then 'out_of_top100' else 'unknown' end) order by s.kst_date),'[]') from public.amazon_snapshots s join public.categories c on c.id=s.category_id join public.listings l on l.marketplace=c.marketplace and l.id=get_product_history_v1.listing_id left join public.amazon_rank_entries e on e.snapshot_id=s.id and e.listing_id=l.id where s.kst_date between date_from and date_to and s.first_seen_at<=as_of and s.id=private.canonical_id(s.category_id,s.kst_date,s.slot,as_of)); end$$;
create function public.get_overview_v1(as_of_date date default current_date) returns jsonb language plpgsql stable set search_path='' as $$begin perform private.require_member(); return jsonb_build_object('beauty',public.get_amazon_series_v1(date_from=>as_of_date,date_to=>as_of_date,category=>'beauty'),'skincare',public.get_amazon_series_v1(date_from=>as_of_date,date_to=>as_of_date,category=>'skincare')); end$$;
revoke all on function private.apr_family(uuid,date,timestamptz),private.source_meta(uuid) from public;
grant execute on function private.apr_family(uuid,date,timestamptz),private.source_meta(uuid) to authenticated;
revoke all on function public.get_amazon_series_v1(text[],text,date,date,timestamptz,text,text),public.get_evidence_v1(uuid,timestamptz),public.get_amazon_snapshot_v1(uuid,timestamptz,text),public.get_product_history_v1(uuid,date,date,timestamptz),public.get_overview_v1(date) from public;
grant execute on function public.get_amazon_series_v1(text[],text,date,date,timestamptz,text,text),public.get_evidence_v1(uuid,timestamptz),public.get_amazon_snapshot_v1(uuid,timestamptz,text),public.get_product_history_v1(uuid,date,date,timestamptz),public.get_overview_v1(date) to authenticated;
