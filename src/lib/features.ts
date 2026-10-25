/**
 * Which parts of QuR Tag are switched on.
 *
 * QuR Tag runs the smallest loop that works: an owner signs up, adds an item, prints a
 * free QR tag; a finder scans it, sends a note with no account; the owner replies from
 * the inbox; the finder reads the reply on the tag page. Everything below was built for
 * a bigger plan and is kept in the code, but none of it can work yet: there is no
 * database table for it in schema `qurtag`, no payment, courier, flight or wallet
 * account behind it, and no partner. So each is hidden from every screen and route
 * until it is built for real.
 *
 * The flags are fixed at build time. `VITE_QURTAG_LABS=1` turns them all on for local
 * work on those features only; never set it on Vercel.
 */
const labs = import.meta.env.VITE_QURTAG_LABS === '1';

export const FEATURES = {
  /** Cash rewards held by Stripe and paid to the finder (RewardPicker, finder payout). */
  rewards: labs,
  /** Prepaid courier label requested by the finder (CourierForm, courier-fulfill). */
  courier: labs,
  /** Trip mode with flight details (Trips page, aero-trip-status). */
  trips: labs,
  /** Partner drop-off points (/partners staff screens). */
  partners: labs,
  /** Insurance claim packet for an item. */
  insurancePacket: labs,
  /** Apple and Google wallet passes. */
  walletPasses: labs,
  /** Finder shares their location (needs a map key). */
  shareLocation: labs,
  /** Web push to the owner's devices (needs push keys). */
  push: labs,
} as const;

export type Feature = keyof typeof FEATURES;
