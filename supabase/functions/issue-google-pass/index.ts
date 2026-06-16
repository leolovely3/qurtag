// QurTag — issue-google-pass Edge Function
//
// Issues a Google Wallet generic pass for an item. Returns a "Save" URL
// the client can navigate to: https://pay.google.com/gp/v/save/<jwt>.
//
// Without Google Wallet API credentials the function returns 503 with
// setup instructions.
//
// Required Edge Function env:
//   GOOGLE_WALLET_ISSUER_ID              from Google Pay & Wallet Console
//   GOOGLE_WALLET_CLASS_SUFFIX           e.g. cairn_item_v1
//   GOOGLE_WALLET_SA_EMAIL               service account email
//   GOOGLE_WALLET_SA_PRIVATE_KEY         PEM private key (PKCS#8)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { itemId } = (await req.json()) as { itemId: string };
  if (!itemId) return new Response('missing itemId', { status: 400 });

  const issuerId = Deno.env.get('GOOGLE_WALLET_ISSUER_ID');
  const classSuffix = Deno.env.get('GOOGLE_WALLET_CLASS_SUFFIX') ?? 'cairn_item_v1';
  const saEmail = Deno.env.get('GOOGLE_WALLET_SA_EMAIL');
  const saKey = Deno.env.get('GOOGLE_WALLET_SA_PRIVATE_KEY');
  if (!issuerId || !saEmail || !saKey) {
    return new Response(
      JSON.stringify({
        error:
          'Google Wallet not configured. Add GOOGLE_WALLET_* secrets to enable. See docs/SETUP.md §12.',
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
    .select('*, tags(public_id)')
    .eq('id', itemId)
    .maybeSingle();
  if (!item) return new Response('item not found', { status: 404 });

  const tag = (item as any).tags?.[0];
  const finderUrl = `${Deno.env.get('CAIRN_APP_URL') ?? 'https://app.qurtag.com'}/find/${tag?.public_id ?? ''}`;

  const objectId = `${issuerId}.cairn_item_${itemId}`;
  const classId = `${issuerId}.${classSuffix}`;

  const genericObject = {
    id: objectId,
    classId,
    state: 'ACTIVE',
    cardTitle: { defaultValue: { language: 'en-US', value: 'QurTag' } },
    header: { defaultValue: { language: 'en-US', value: (item as any).name } },
    subheader: {
      defaultValue: { language: 'en-US', value: (item as any).brand ?? '' },
    },
    hexBackgroundColor: '#0a0b0f',
    barcode: { type: 'QR_CODE', value: finderUrl },
  };

  // Import the RSA key.
  const keyPem = saKey.replace(/\\n/g, '\n');
  const importedKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(keyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const jwt = await create(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: saEmail,
      aud: 'google',
      typ: 'savetowallet',
      iat: getNumericDate(0),
      payload: { genericObjects: [genericObject] },
    },
    importedKey,
  );

  const url = `https://pay.google.com/gp/v/save/${jwt}`;
  return new Response(JSON.stringify({ url }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

function pemToBytes(pem: string): ArrayBuffer {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
