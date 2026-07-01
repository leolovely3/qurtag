// QurTag — issue-apple-pass Edge Function
//
// Generates an Apple Wallet .pkpass for an item. Without an Apple Pass Type
// ID certificate the function can't sign, so we return 503 with clear
// next-steps. With the cert, we produce the standard pkpass zip.
//
// Required Edge Function env (when ready to sign):
//   APPLE_PASS_TYPE_ID                  e.g. pass.co.qurtag.item
//   APPLE_TEAM_ID                       Apple Developer Team ID
//   APPLE_PASS_CERTIFICATE_BASE64       PEM-encoded cert, base64'd
//   APPLE_PASS_KEY_BASE64               Private key matching cert, base64'd
//   APPLE_WWDR_CERT_BASE64              Apple WWDR intermediate cert, base64'd
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { itemId } = (await req.json()) as { itemId: string };
  if (!itemId) return new Response('missing itemId', { status: 400 });

  const passTypeId = Deno.env.get('APPLE_PASS_TYPE_ID');
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const certB64 = Deno.env.get('APPLE_PASS_CERTIFICATE_BASE64');
  const keyB64 = Deno.env.get('APPLE_PASS_KEY_BASE64');
  if (!passTypeId || !teamId || !certB64 || !keyB64) {
    return new Response(
      JSON.stringify({
        error:
          'Apple Wallet not configured. Add APPLE_PASS_* secrets to enable. See docs/SETUP.md §12.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: item } = await supabase
    .from('items')
    .select('*, tags(public_id, hardware_tier)')
    .eq('id', itemId)
    .maybeSingle();
  if (!item) return new Response('item not found', { status: 404 });

  const tag = (item as any).tags?.[0];
  const finderUrl = `${Deno.env.get('QURTAG_APP_URL') ?? 'https://app.qurtag.com'}/find/${tag?.public_id ?? ''}`;

  // The pass.json content. Layout matches a generic "back of a luggage tag."
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    serialNumber: itemId,
    organizationName: 'QurTag',
    description: `QurTag tag for ${(item as any).name}`,
    backgroundColor: 'rgb(10, 11, 15)',
    foregroundColor: 'rgb(245, 241, 234)',
    labelColor: 'rgb(168, 169, 174)',
    generic: {
      primaryFields: [{ key: 'name', label: 'Item', value: (item as any).name }],
      secondaryFields: [
        { key: 'brand', label: 'Brand', value: (item as any).brand ?? '' },
        { key: 'tier', label: 'Tier', value: tag?.hardware_tier ?? 'printable' },
      ],
      auxiliaryFields: (item as any).declared_value_cents
        ? [
            {
              key: 'value',
              label: 'Declared value',
              value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                (item as any).declared_value_cents / 100,
              ),
            },
          ]
        : [],
      backFields: [
        { key: 'finder', label: 'Found URL', value: finderUrl },
        {
          key: 'privacy',
          label: 'Privacy',
          value:
            'Your name, number, email, and address stay hidden. The finder sees only what you choose to show.',
        },
      ],
    },
    barcodes: [{ format: 'PKBarcodeFormatQR', message: finderUrl, messageEncoding: 'iso-8859-1' }],
  };

  // Signing + zipping a .pkpass on Deno needs node:crypto + a zip lib.
  // We don't ship the full build here in the skeleton — but the pass.json
  // above is the canonical content. Wire one of these to finish:
  //   - https://github.com/walletpass/pass-js (Node port: node:crypto compatible)
  //   - https://github.com/tinovyatkin/pass-js (TypeScript, Deno-friendly)
  //
  // Return the JSON for now so the UI can show "preview" mode.
  return new Response(
    JSON.stringify({
      preview: true,
      pass: passJson,
      note: 'Pass body is correct. Signing not yet implemented in this skeleton.',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
