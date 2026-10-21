-- Valgfritt steg 2: kjør kampene kl. 18.00 uten at noen er innlogget.
-- Forutsetter at Edge Function "tick" er deployet (Verify JWT: av).
-- Bytt ut ANON_KEY under med den publiserbare nøkkelen din før du kjører.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'ligamester-tick',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://smhzszluqoatojlnjyow.supabase.co/functions/v1/tick',
       headers := jsonb_build_object('Content-Type','application/json','apikey','ANON_KEY'),
       body := '{}'::jsonb
     ); $$
);
