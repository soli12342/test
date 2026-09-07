create function private.member_role() returns text language sql stable security definer set search_path='' as $$select role from private.memberships where user_id=auth.uid() and active$$;
create function private.require_member() returns text language plpgsql stable security definer set search_path='' as $$declare r text; begin if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if; r:=private.member_role(); if r is null then raise exception 'NOT_INVITED'; end if; return r; end$$;
create function private.require_admin() returns void language plpgsql stable security definer set search_path='' as $$begin if private.require_member()<>'admin' then raise exception 'FORBIDDEN'; end if; end$$;
create function private.source_readable(s uuid) returns boolean language sql stable security definer set search_path='' as $$select private.member_role() is not null and exists(select 1 from public.source_permissions p where p.source_id=s and p.store_derived_allowed and (p.expires_at is null or p.expires_at>now()) and (private.member_role()='admin' or p.share_allowed))$$;
create function private.snapshot_readable(s uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.amazon_snapshots a where a.id=s and a.expires_at>now() and private.source_readable(a.source_id))$$;
grant usage on schema private to authenticated;
grant execute on function private.member_role(),private.require_member(),private.require_admin(),private.source_readable(uuid),private.snapshot_readable(uuid) to authenticated;
-- private tables are never available through the Data API.
alter table private.memberships enable row level security;
alter table private.invites enable row level security;
alter table private.audit_logs enable row level security;
alter table private.import_payloads enable row level security;
do $$declare t text; begin
 foreach t in array array['companies','brands','product_families','listings','listing_assignments','categories','sources','source_permissions','source_capabilities','import_batches','job_requests','collection_runs','source_objects','amazon_snapshots','amazon_rank_entries','amazon_product_observations','snapshot_selections'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
 foreach t in array array['companies','brands','product_families','categories'] loop
 execute format('create policy member_read on public.%I for select to authenticated using (private.member_role() is not null)',t);
 end loop;
 foreach t in array array['sources','source_permissions','source_capabilities','import_batches','job_requests','collection_runs','source_objects','listing_assignments'] loop
 execute format('create policy admin_read on public.%I for select to authenticated using (private.member_role()=''admin'')',t);
 end loop;
end$$;
create policy snapshot_read on amazon_snapshots for select to authenticated using(private.snapshot_readable(id));
create policy entry_read on amazon_rank_entries for select to authenticated using(private.snapshot_readable(snapshot_id));
create policy observation_read on amazon_product_observations for select to authenticated using(private.snapshot_readable(snapshot_id));
create policy selection_read on snapshot_selections for select to authenticated using(private.snapshot_readable(snapshot_id));
create policy listing_read on listings for select to authenticated using(private.member_role()='admin' or exists(select 1 from amazon_rank_entries e where e.listing_id=listings.id));

create function public.get_membership_v1() returns jsonb language plpgsql security definer set search_path='' as $$declare r text; begin r:=private.require_member(); return jsonb_build_object('role',r,'active',true); end$$;
create function public.redeem_invite_v1() returns jsonb language plpgsql security definer set search_path='' as $$declare e text; inv private.invites; begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if exists(select 1 from private.memberships where user_id=auth.uid()) then return public.get_membership_v1(); end if;
 select lower(trim(email)) into e from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into inv from private.invites where email_normalized=e and expires_at>now() and redeemed_by is null for update;
 if inv.id is null then raise exception 'NOT_INVITED'; end if;
 insert into private.memberships(user_id,role,invited_by) values(auth.uid(),'viewer',inv.invited_by);
 update private.invites set redeemed_by=auth.uid() where id=inv.id;
 insert into private.audit_logs(actor,action,target) values(auth.uid(),'invite_redeemed',inv.id::text);
 return public.get_membership_v1(); end$$;
create function public.invite_viewer_v1(email text) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid; begin
 perform private.require_admin(); if length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'VALIDATION_FAILED'; end if;
 insert into private.invites(email_normalized,expires_at,invited_by) values(lower(trim(email)),now()+interval '7 days',auth.uid()) on conflict(email_normalized) do update set expires_at=excluded.expires_at,redeemed_by=null returning id into result;
 insert into private.audit_logs(actor,action,target) values(auth.uid(),'invite_created',result::text); return result; end$$;
create function public.list_members_v1() returns jsonb language plpgsql security definer set search_path='' as $$begin perform private.require_admin(); return (select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'role',role,'active',active)),'[]') from private.memberships); end$$;
create function public.block_member_v1(target_user uuid) returns void language plpgsql security definer set search_path='' as $$begin perform private.require_admin(); if target_user=auth.uid() then raise exception 'FORBIDDEN'; end if; update private.memberships set active=false where user_id=target_user and role='viewer'; insert into private.audit_logs(actor,action,target) values(auth.uid(),'member_blocked',target_user::text); end$$;

create function public.assign_listing_v1(listing uuid,family uuid,approval text,valid_from date,evidence text) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid; begin
 perform private.require_admin(); if length(trim(evidence))<5 then raise exception 'VALIDATION_FAILED'; end if;
 perform 1 from public.listings where id=listing for update;
 insert into public.listing_assignments(listing_id,product_family_id,approval,valid_from,version,evidence_ref,approved_by) select listing,family,assign_listing_v1.approval,assign_listing_v1.valid_from,coalesce(max(version),0)+1,evidence,auth.uid() from public.listing_assignments where listing_id=listing returning id into result;
 insert into private.audit_logs(actor,action,target) values(auth.uid(),'mapping_revision',result::text); return result; end$$;
create function public.create_family_v1(brand uuid,name text,product_type text) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid; begin perform private.require_admin(); if length(trim(name))<1 or length(name)>200 then raise exception 'VALIDATION_FAILED'; end if; insert into public.product_families(brand_id,name,product_type) values(brand,name,product_type) returning id into result; return result; end$$;
create function public.select_snapshot_v1(snapshot uuid,reason text) returns uuid language plpgsql security definer set search_path='' as $$declare a public.amazon_snapshots; prev uuid; result uuid; m text; begin
 perform private.require_admin(); if length(trim(reason))<5 then raise exception 'VALIDATION_FAILED'; end if;
 select * into a from public.amazon_snapshots where id=snapshot; if a.id is null or not private.snapshot_readable(a.id) then raise exception 'FORBIDDEN'; end if;
 perform 1 from public.categories where id=a.category_id for update;
 select marketplace into m from public.categories where id=a.category_id;
 select id into prev from public.snapshot_selections where category_id=a.category_id and kst_date=a.kst_date and slot=a.slot order by selected_at desc,id desc limit 1;
 insert into public.snapshot_selections(marketplace,category_id,kst_date,slot,snapshot_id,supersedes_id,reason,selected_by) values(m,a.category_id,a.kst_date,a.slot,a.id,prev,reason,auth.uid()) returning id into result;
 insert into private.audit_logs(actor,action,target) values(auth.uid(),'canonical_revision',result::text); return result; end$$;

-- Source/category activation is explicit Admin work with recorded evidence, no network or paid activation.
create function public.review_source_v1(source uuid,collect boolean,store_raw boolean,store_derived boolean,share boolean,export_data boolean,evidence text,expiry timestamptz,hosts text[]) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.require_admin(); if length(trim(evidence))<5 or expiry is null or expiry<=now() or array_length(hosts,1) is null or exists(select 1 from unnest(hosts) h where h !~ '^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' or h ~ '(^|\.)(localhost|local|internal)$') then raise exception 'VALIDATION_FAILED'; end if;
 update public.source_permissions set collect_allowed=collect,store_raw_allowed=store_raw,store_derived_allowed=store_derived,share_allowed=share,export_allowed=export_data,evidence_ref=evidence,expires_at=expiry,reviewed_by=auth.uid(),reviewed_at=now() where source_id=source;
 update public.sources set enabled=collect and store_derived,mode='manual_file',allowed_hosts=hosts,status=case when collect and store_derived then 'permission_pending' else 'configuration_pending' end where id=source and kind='amazon_rank';
 insert into private.audit_logs(actor,action,target) values(auth.uid(),'source_review',source::text); end$$;
create function public.review_category_v1(category uuid,node text,path text,url text,evidence text) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.require_admin(); if node='' or path='' or url !~ '^https://[a-zA-Z0-9.-]+/' or length(trim(evidence))<5 then raise exception 'VALIDATION_FAILED'; end if;
 -- Definitions already referenced by observations are immutable; new versions need a migration.
 if exists(select 1 from public.amazon_snapshots where category_id=category) then raise exception 'CATEGORY_VERSION_REQUIRED'; end if;
 update public.categories set source_node_id=review_category_v1.node,path=review_category_v1.path,listing_url=review_category_v1.url,verification_status='verified',review_note=evidence,reviewed_at=now() where id=category;
 insert into private.audit_logs(actor,action,target) values(auth.uid(),'category_review',category::text); end$$;
-- Revoke the PostgreSQL default PUBLIC EXECUTE for every application function.
do $$declare f record; begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') loop execute 'revoke all on function '||f.signature||' from public'; end loop; end$$;
grant execute on all functions in schema public to authenticated;
grant usage on schema public,private to service_role;
grant all on all tables in schema public,private to service_role;
