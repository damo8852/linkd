---
name: new-migration
description: Change the Supabase schema - a new SQL migration with RLS policies, a pgTAP test, and regenerated TypeScript types in the same change.
---

Rules: [supabase_protocol.md](../../../docs/protocol/supabase_protocol.md).

1. `supabase migration new <name>`. Never edit an applied migration.
2. Write the schema change **and its RLS policies** in the same file. RLS enabled on every new table.
3. pgTAP test in `supabase/tests/`: the owner can read/write, another user cannot, anonymous cannot, plus any constraint the table enforces. (Tables can't be tested before they exist, so write the test in the same change and drive to green.)
4. `supabase db reset` then `supabase test db` - green.
5. Regenerate types (`supabase gen types typescript --local`) and update callers.
6. Seed data stays synthetic.

## Checks
- [ ] RLS enabled + policies in the migration
- [ ] pgTAP covers owner / other user / anon
- [ ] types regenerated
- [ ] PR Risk section notes the migration
