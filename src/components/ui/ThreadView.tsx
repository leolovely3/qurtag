import { useEffect, useRef } from 'react';
import { MapPin, Truck, ShieldCheck, PartyPopper } from 'lucide-react';
import type { Message, SenderKind } from '@/lib/database.types';
import { parseSystemPayload, type SystemPayload } from '@/lib/systemMessages';
import { mapboxStaticUrl, isMapboxConfigured } from '@/lib/mapbox';
import { cn } from '@/lib/cn';

interface ThreadViewProps {
  messages: Message[];
  viewerKind: SenderKind;
  autoScroll?: boolean;
  className?: string;
}

function timestamp(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  if (sameDay) {
    return then.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return then.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function senderLabel(sender: SenderKind, viewer: SenderKind): string {
  if (sender === 'system') return 'QurTag';
  if (sender === viewer) return 'You';
  return sender === 'owner' ? 'The owner' : 'The finder';
}

function centsToUSD(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function SystemCard({ payload }: { payload: SystemPayload }) {
  switch (payload.type) {
    case 'location': {
      const url = mapboxStaticUrl(payload.lat, payload.lng, { width: 560, height: 240 });
      return (
        <div className="rounded-modal overflow-hidden border border-hairline bg-canvas max-w-md">
          {url ? (
            <img
              src={url}
              alt={payload.label ?? `${payload.lat.toFixed(4)}, ${payload.lng.toFixed(4)}`}
              className="w-full aspect-[7/3] object-cover"
            />
          ) : (
            <div className="aspect-[7/3] bg-ink-50 grid place-items-center">
              <MapPin size={24} strokeWidth={1.5} className="text-muted" />
            </div>
          )}
          <div className="p-qurtag-3 flex items-start gap-2">
            <MapPin size={14} strokeWidth={1.75} className="mt-0.5 text-signal-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-caption font-medium text-ink-900 truncate">
                {payload.label ?? 'Location shared'}
              </p>
              <p className="text-caption text-muted">
                {payload.lat.toFixed(4)}, {payload.lng.toFixed(4)}
                {payload.accuracy ? ` · ±${Math.round(payload.accuracy)}m` : ''}
                {!isMapboxConfigured && ' · map preview unavailable'}
              </p>
            </div>
          </div>
        </div>
      );
    }
    case 'courier_request':
      return (
        <div className="rounded-modal border border-hairline bg-canvas p-qurtag-3 flex items-start gap-3 max-w-md">
          <div className="size-9 rounded-pill bg-verdigris-100 grid place-items-center shrink-0">
            <Truck size={16} strokeWidth={1.75} className="text-verdigris-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-caption font-medium text-ink-900">Courier pickup requested</p>
            <p className="text-caption text-muted">
              {payload.city ? `${payload.city} · ` : ''}
              Pickup window: {payload.pickupWindow}
            </p>
            {payload.label && (
              <p className="text-caption text-muted truncate mt-0.5">{payload.label}</p>
            )}
          </div>
        </div>
      );
    case 'reward_offered':
      return (
        <div className="rounded-modal border border-hairline bg-canvas p-qurtag-3 flex items-center gap-3 max-w-md">
          <div className="size-9 rounded-pill bg-signal-500 grid place-items-center shrink-0">
            <ShieldCheck size={16} strokeWidth={1.75} className="text-canvas" />
          </div>
          <p className="text-caption text-ink-900">
            <span className="font-medium">{centsToUSD(payload.amount_cents)}</span> reward placed in
            escrow.
          </p>
        </div>
      );
    case 'reunited':
      return (
        <div className="rounded-modal border border-hairline bg-canvas p-qurtag-3 flex items-center gap-3 max-w-md">
          <div className="size-9 rounded-pill bg-verdigris-500 grid place-items-center shrink-0">
            <PartyPopper size={16} strokeWidth={1.75} className="text-canvas" />
          </div>
          <p className="text-caption text-ink-900">Reunited at {timestamp(payload.at)}.</p>
        </div>
      );
  }
}

export function ThreadView({ messages, viewerKind, autoScroll = true, className }: ThreadViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoScroll) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, autoScroll]);

  if (messages.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-caption text-muted py-qurtag-8',
          className,
        )}
      >
        No messages yet. The first one breaks the ice.
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {messages.map((m) => {
        const system = m.sender_kind === 'system';
        const structured = system ? parseSystemPayload(m.body) : null;
        const mine = m.sender_kind === viewerKind;

        if (system && structured) {
          return (
            <div key={m.id} className="flex flex-col gap-1 items-center self-center max-w-full">
              <SystemCard payload={structured} />
              <span className="text-caption text-muted px-2">
                QurTag · {timestamp(m.created_at)}
              </span>
            </div>
          );
        }

        return (
          <div
            key={m.id}
            className={cn(
              'flex flex-col gap-1 max-w-[85%]',
              mine ? 'self-end items-end' : 'self-start items-start',
              system && 'self-center items-center max-w-md',
            )}
          >
            <div
              className={cn(
                'rounded-modal px-4 py-3 text-body whitespace-pre-wrap text-pretty',
                system
                  ? 'bg-paper text-muted italic text-caption border border-hairline'
                  : mine
                    ? 'bg-ink-900 text-canvas rounded-br-card'
                    : 'bg-paper text-ink-900 rounded-bl-card border border-hairline',
              )}
            >
              {m.body}
            </div>
            <span className="text-caption text-muted px-2">
              {senderLabel(m.sender_kind, viewerKind)} · {timestamp(m.created_at)}
            </span>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
