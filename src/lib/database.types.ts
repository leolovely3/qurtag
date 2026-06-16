/**
 * QurTag database types.
 *
 * Hand-maintained until we wire `supabase gen types`. Mirrors
 * supabase/migrations/20260614000000_initial_schema.sql exactly.
 *
 * Shape intentionally matches what `supabase gen types typescript` emits so
 * the file is drop-in replaceable later.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PlanTier = 'free' | 'plus' | 'family' | 'business';
export type MemberRole = 'admin' | 'member' | 'child' | 'viewer';
export type HardwareTier = 'printable' | 'sticker' | 'core' | 'pro' | 'signature' | 'track';
export type TagStatus = 'active' | 'inactive' | 'replaced';

export interface Household {
  id: string;
  name: string | null;
  plan_tier: PlanTier;
  owner_user_id: string;
  created_at: string;
  return_address_line: string | null;
  return_city: string | null;
  return_state: string | null;
  return_postal_code: string | null;
  return_country: string | null;
}

export type RewardState = 'pending' | 'held' | 'released' | 'refunded' | 'failed';

export interface Reward {
  id: string;
  item_id: string;
  household_id: string;
  thread_id: string | null;
  amount_cents: number;
  currency: string;
  stripe_payment_intent_id: string | null;
  stripe_client_secret: string | null;
  finder_payout_email: string | null;
  state: RewardState;
  created_at: string;
  held_at: string | null;
  released_at: string | null;
}

export interface Trip {
  id: string;
  household_id: string;
  name: string;
  flight_number: string | null;
  origin_iata: string | null;
  destination_iata: string | null;
  scheduled_departure: string | null;
  scheduled_arrival: string | null;
  live_status: string | null;
  live_status_updated_at: string | null;
  active_from: string;
  active_until: string | null;
  created_at: string;
}

export interface TripItem {
  trip_id: string;
  item_id: string;
  added_at: string;
}

export type CourierOrderState =
  | 'requested'
  | 'paid'
  | 'label_generated'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

export interface CourierOrder {
  id: string;
  thread_id: string;
  item_id: string;
  household_id: string;
  address_line: string;
  city: string | null;
  pickup_window: string;
  carrier: string | null;
  service_level: string | null;
  label_url: string | null;
  tracking_number: string | null;
  state: CourierOrderState;
  created_at: string;
  updated_at: string;
}

export interface BlockedFinderSession {
  household_id: string;
  finder_session_id: string;
  reason: string | null;
  created_at: string;
}

export type PartnerKind = 'hotel' | 'airline' | 'coworking' | 'gym' | 'other';
export type PartnerDropoffStatus = 'received' | 'awaiting_pickup' | 'collected' | 'shipped';

export interface Partner {
  id: string;
  name: string;
  kind: PartnerKind;
  contact_email: string | null;
  address: string | null;
  city: string | null;
  brand_props: Json | null;
  created_at: string;
}

export interface PartnerMember {
  partner_id: string;
  user_id: string;
  role: 'admin' | 'member';
  created_at: string;
}

export interface PartnerDropoff {
  id: string;
  partner_id: string;
  staff_user_id: string | null;
  tag_id: string | null;
  item_id: string | null;
  thread_id: string | null;
  status: PartnerDropoffStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type AbuseKind = 'spam' | 'harassment' | 'fraud' | 'other';

export interface AbuseReport {
  id: string;
  thread_id: string | null;
  household_id: string;
  reporter_user_id: string | null;
  kind: AbuseKind;
  body: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface HouseholdMember {
  household_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

export interface Item {
  id: string;
  household_id: string;
  name: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  declared_value_cents: number | null;
  hero_photo_url: string | null;
  lost_mode: boolean;
  reward_amount_cents: number | null;
  drop_off_preference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  public_id: string;
  household_id: string;
  current_item_id: string | null;
  hardware_tier: HardwareTier;
  status: TagStatus;
  activated_at: string;
  created_at: string;
}

export type ThreadStatus = 'open' | 'closed' | 'reunited';
export type SenderKind = 'finder' | 'owner' | 'system';

export interface Thread {
  id: string;
  item_id: string;
  household_id: string;
  tag_id: string | null;
  finder_session_id: string | null;
  status: ThreadStatus;
  last_message_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_kind: SenderKind;
  body: string;
  read_by_owner_at: string | null;
  read_by_finder_at: string | null;
  created_at: string;
}

export interface FinderSession {
  id: string;
  first_seen_at: string;
  locale: string | null;
  user_agent_class: string | null;
}

export interface Scan {
  id: string;
  tag_id: string;
  item_id: string | null;
  scanned_at: string;
  ip_country: string | null;
  user_agent_class: string | null;
  finder_session_id: string | null;
}

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      households: {
        Row: Household;
        Insert: Omit<Household, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Household>;
        Relationships: [];
      };
      household_members: {
        Row: HouseholdMember;
        Insert: Omit<HouseholdMember, 'created_at'> & { created_at?: string };
        Update: Partial<HouseholdMember>;
        Relationships: [];
      };
      items: {
        Row: Item;
        Insert: Omit<Item, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Item>;
        Relationships: [];
      };
      tags: {
        Row: Tag;
        Insert: Omit<Tag, 'id' | 'activated_at' | 'created_at'> & {
          id?: string;
          activated_at?: string;
          created_at?: string;
        };
        Update: Partial<Tag>;
        Relationships: [];
      };
      scans: {
        Row: Scan;
        Insert: Omit<Scan, 'id' | 'scanned_at'> & { id?: string; scanned_at?: string };
        Update: Partial<Scan>;
        Relationships: [];
      };
      threads: {
        Row: Thread;
        Insert: Omit<Thread, 'id' | 'last_message_at' | 'created_at'> & {
          id?: string;
          last_message_at?: string;
          created_at?: string;
        };
        Update: Partial<Thread>;
        Relationships: [];
      };
      messages: {
        Row: Message;
        Insert: Omit<Message, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Message>;
        Relationships: [];
      };
      finder_sessions: {
        Row: FinderSession;
        Insert: Omit<FinderSession, 'first_seen_at'> & { first_seen_at?: string };
        Update: Partial<FinderSession>;
        Relationships: [];
      };
      rewards: {
        Row: Reward;
        Insert: Omit<Reward, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Reward>;
        Relationships: [];
      };
      trips: {
        Row: Trip;
        Insert: Omit<Trip, 'id' | 'created_at' | 'active_from'> & {
          id?: string;
          created_at?: string;
          active_from?: string;
        };
        Update: Partial<Trip>;
        Relationships: [];
      };
      trip_items: {
        Row: TripItem;
        Insert: Omit<TripItem, 'added_at'> & { added_at?: string };
        Update: Partial<TripItem>;
        Relationships: [];
      };
      blocked_finder_sessions: {
        Row: BlockedFinderSession;
        Insert: Omit<BlockedFinderSession, 'created_at'> & { created_at?: string };
        Update: Partial<BlockedFinderSession>;
        Relationships: [];
      };
      abuse_reports: {
        Row: AbuseReport;
        Insert: Omit<AbuseReport, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<AbuseReport>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
