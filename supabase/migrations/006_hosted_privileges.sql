-- Hosted Supabase explicitly grants anon/authenticated privileges by default.
-- RLS does not protect TRUNCATE. Retain SELECT + approved RPCs only.
revoke all on all tables in schema public from anon;
revoke insert,update,delete,truncate,references,trigger on all tables in schema public from authenticated;
revoke all on all tables in schema private from anon,authenticated;
revoke execute on all functions in schema public,private from anon;
alter default privileges in schema public revoke all on tables from anon,authenticated;
alter default privileges in schema public revoke execute on functions from public,anon,authenticated;
alter default privileges in schema private revoke execute on functions from public,anon,authenticated;
