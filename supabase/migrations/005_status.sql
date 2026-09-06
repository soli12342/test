-- Safe, non-content source state, available to active members only.
create function private.category_status(category uuid) returns text language plpgsql stable security definer set search_path='' as $$declare status text; begin
 perform private.require_member();
 select s.status into status from public.sources s join public.source_capabilities cap on cap.source_id=s.id join public.categories c on c.marketplace=cap.marketplace and c.canonical_type=cap.category where c.id=category_status.category and s.kind='amazon_rank' order by s.last_checked_at desc nulls last limit 1;
 return coalesce(status,'configuration_pending'); end$$;
revoke all on function private.category_status(uuid) from public;
grant execute on function private.category_status(uuid) to authenticated;
-- Titles belong to their source snapshot; a shared listing must not inherit a private source's title.
create function public.get_listings_v1(market text,offset_rows integer default 0) returns jsonb language plpgsql stable set search_path='' as $$begin
 perform private.require_member(); if market not in ('US','GB','DE','FR','IT','ES') or offset_rows<0 or offset_rows>100000 then raise exception 'VALIDATION_FAILED'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select l.id,l.marketplace,l.asin,coalesce((select e.observed_title from public.amazon_rank_entries e join public.amazon_snapshots s on s.id=e.snapshot_id where e.listing_id=l.id order by s.first_seen_at desc limit 1),l.title) title from public.listings l where l.marketplace=market order by l.id offset offset_rows limit 100)x); end$$;
revoke all on function public.get_listings_v1(text,integer) from public;
grant execute on function public.get_listings_v1(text,integer) to authenticated;
-- Resolve canonical before filtering visibility. Never silently fall back to an older shared selection.
create function private.canonical_id(category uuid,day date,slot_name text,cutoff timestamptz) returns uuid language plpgsql stable security definer set search_path='' as $$declare snapshot uuid; begin
 perform private.require_member();
 select s.snapshot_id into snapshot from public.snapshot_selections s where s.category_id=canonical_id.category and s.kst_date=day and s.slot=slot_name and s.selected_at<=cutoff order by s.selected_at desc,s.id desc limit 1;
 if private.snapshot_readable(snapshot) then return snapshot; end if; return null; end$$;
revoke all on function private.canonical_id(uuid,date,text,timestamptz) from public;
grant execute on function private.canonical_id(uuid,date,text,timestamptz) to authenticated;
