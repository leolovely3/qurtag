// QurTag — aero-trip-status Edge Function (skeleton)
//
// Polls AeroAPI (FlightAware) for the live status of every active trip,
// updates trips.live_status + scheduled times. Intended to run on a cron
// (Supabase Database Triggers → Schedule Functions, every 5–10 minutes).
//
// Required Edge Function env:
//   AEROAPI_KEY                — FlightAware AeroAPI key
//   SUPABASE_URL               — provided automatically
//   SUPABASE_SERVICE_ROLE_KEY  — provided automatically
//
// Deploy with:
//   supabase functions deploy aero-trip-status

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const aeroKey = Deno.env.get('AEROAPI_KEY');
  if (!aeroKey) return new Response('AEROAPI_KEY missing', { status: 500 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Active trips: not yet 24h past their scheduled arrival.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: trips } = await supabase
    .from('trips')
    .select('id, flight_number')
    .gt('active_from', cutoff)
    .not('flight_number', 'is', null);

  if (!trips || trips.length === 0) {
    return new Response(JSON.stringify({ updated: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let updated = 0;
  for (const trip of trips as Array<{ id: string; flight_number: string }>) {
    try {
      const res = await fetch(
        `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(trip.flight_number)}`,
        { headers: { 'x-apikey': aeroKey } },
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { flights?: Array<any> };
      const next = json.flights?.[0];
      if (!next) continue;
      await supabase
        .from('trips')
        .update({
          live_status: next.status ?? null,
          scheduled_departure: next.scheduled_out ?? null,
          scheduled_arrival: next.scheduled_in ?? null,
          origin_iata: next.origin?.code_iata ?? null,
          destination_iata: next.destination?.code_iata ?? null,
          live_status_updated_at: new Date().toISOString(),
        })
        .eq('id', trip.id);
      updated++;
    } catch (e) {
      console.error('[QurTag aero] trip', trip.id, e);
    }
  }

  return new Response(JSON.stringify({ updated }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
