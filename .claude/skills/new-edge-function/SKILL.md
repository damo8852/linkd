---
name: new-edge-function
description: Add or change a Supabase Edge Function (Deno/TS), e.g. send-alert or dispatch, with providers behind fakeable interfaces and a failing Deno test first.
---

Rules: [supabase_protocol.md](../../../docs/protocol/supabase_protocol.md). Alert behavior: [sos_alert_flow.md](../../../docs/design/sos_alert_flow.md).

1. **Test first (Deno):** test the logic module with providers faked (SMS, dispatch). For alert-path functions cover: correct recipients, message content, **idempotency on retry**, and each provider failure being reported. Run red.
2. **Build:** `supabase/functions/<name>/index.ts` is a thin handler (verify JWT user, validate input, call the module). Logic in sibling modules. Providers via interfaces; select fake/sandbox/live from config.
3. **Green** (`deno test`), then serve locally (`supabase functions serve`) and call it once against sandbox providers.
4. New secrets: `supabase secrets set`, names documented in [integrations.md](../../../docs/reference/integrations.md).

## Checks
- [ ] failing Deno test before implementation
- [ ] no live provider reachable from tests/dev
- [ ] identity from the verified JWT, not the request body
- [ ] failures recorded and returned, never swallowed
