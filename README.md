# Ligamester

Fotballmanagerspill i Hattrick-stil. Statisk side (`index.html`) med Supabase som database og innlogging.

1. Kjør `supabase/setup.sql` i Supabase (SQL Editor).
2. Slå av "Confirm email" i Authentication → Providers → Email (valgfritt, enklest for venner).
3. Slå på GitHub Pages for repoet (branch main, root).
4. Valgfritt: deploy `supabase/functions/tick/index.ts` som Edge Function "tick" (Verify JWT av), og kjør `supabase/cron.sql`, så starter kampene kl. 18.00 uten at noen er innlogget.
