// Copy to config.js (gitignored) and fill in. Both values are public by design:
// the anon key can only add rows to the waitlist (supabase/migrations/*_waitlist.sql).
window.LINKD_CONFIG = {
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseAnonKey: '<anon key from `npx supabase status -o env`>',
};
