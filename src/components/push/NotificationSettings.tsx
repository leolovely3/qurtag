import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, EyeOff, Mail, ScanLine, MessageCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { db } from '@/lib/db';
import { pushPermission, turnOnPush, type PushPermission } from '@/lib/nativePush';
import { isNative } from '@/lib/platform';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

/**
 * The rows of Settings > Notifications. In the iPhone app: whether alerts are allowed, on or off
 * for each kind, hiding the note on the lock screen, then the email copy. On the website there
 * are no alerts: one row says where notes arrive, then the email copy. Saved per person
 * (qurtag.push_settings), so each member of a Family household has their own.
 *
 * Email rows follow `emailAvailable`, which the server reports from whether RESEND_API_KEY is
 * set (billing-config). While it is unknown nothing about email is shown; when email cannot be
 * sent the row is disabled and says "Email alerts are coming soon".
 */
interface PushSettings {
  found_on: boolean;
  message_on: boolean;
  scan_on: boolean;
  hide_text: boolean;
  email_copy: boolean;
}

const DEFAULTS: PushSettings = { found_on: true, message_on: true, scan_on: false, hide_text: false, email_copy: true };

const PUSH_ROWS: { key: keyof PushSettings; param: string; icon: LucideIcon; title: string; body: string }[] = [
  { key: 'found_on', param: 'p_found_on', icon: Bell, title: 'Someone found your item', body: 'An alert when a finder sends the first note about one of your things.' },
  { key: 'message_on', param: 'p_message_on', icon: MessageCircle, title: 'New messages', body: 'An alert for each later note in a conversation.' },
  { key: 'scan_on', param: 'p_scan_on', icon: ScanLine, title: 'Your tag was scanned', body: 'An alert when someone opens your tag but writes nothing. At most one an hour for each tag.' },
  { key: 'hide_text', param: 'p_hide_text', icon: EyeOff, title: 'Hide note text on the lock screen', body: 'The alert then says only "You have a new note", with no note and no item name.' },
];

const EMAIL_ROW = { key: 'email_copy' as const, param: 'p_email_copy', icon: Mail, title: 'Email me a copy' };

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill transition-colors duration-qurtag ease-qurtag disabled:opacity-60',
        checked ? 'bg-ink-900' : 'bg-ink-200',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-canvas shadow-card transition-transform duration-qurtag ease-qurtag',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

/** Same row as Settings' own (icon tile, title, one line of help, control at the right). */
function SettingRow({ icon: Icon, title, body, children }: { icon: LucideIcon; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-4 first:border-t-0">
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-card bg-ink-100">
          <Icon size={18} strokeWidth={1.75} className="text-ink-900" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="break-words text-base font-medium text-ink-900">{title}</span>
          <span className="text-sm text-muted text-pretty">{body}</span>
        </div>
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

export function NotificationSettings({ emailAvailable }: { emailAvailable: boolean | null }) {
  const toast = useToast();
  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [permission, setPermission] = useState<PermissionState>('unknown');

  const load = useCallback(async () => {
    const { data } = await db.rpc('my_push_settings');
    setSettings({ ...DEFAULTS, ...((data as Partial<PushSettings> | null) ?? {}) });
    if (isNative()) setPermission(await pushPermission());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function change(key: keyof PushSettings, param: string, next: boolean) {
    if (!settings) return;
    const before = settings;
    setSettings({ ...settings, [key]: next });
    const { data, error } = await db.rpc('set_push_settings', { [param]: next });
    if (error) {
      setSettings(before);
      toast.show({ kind: 'error', title: "Couldn't save that", body: 'Check your connection and try again.' });
      return;
    }
    setSettings({ ...DEFAULTS, ...(data as Partial<PushSettings>) });
  }

  async function allow() {
    const r = await turnOnPush();
    setPermission(await pushPermission());
    if (r === 'granted') toast.show({ kind: 'success', title: 'Alerts are on' });
  }

  const native = isNative();
  const emailBody = native
    ? 'If you have not opened an alert after 10 minutes, we email you about it.'
    : 'We email you when a finder writes. If you also use the iPhone app, only when an alert went unopened for 10 minutes.';

  return (
    <>
      {native && (
        <>
          <SettingRow
            icon={permission === 'granted' ? Bell : BellOff}
            title={permission === 'granted' ? 'Alerts on this iPhone' : 'Alerts on this iPhone are off'}
            body={
              permission === 'granted'
                ? 'You will hear from us when a finder writes. Choose which alerts below.'
                : permission === 'denied'
                  ? 'To turn them on, open the iPhone Settings app, then QuR Tag, then Notifications, and allow them.'
                  : 'Turn them on to know the moment someone finds your thing.'
            }
          >
            {permission === 'prompt' && <Button onClick={allow}>Turn on</Button>}
          </SettingRow>
          {settings &&
            PUSH_ROWS.map((row) => (
              <SettingRow key={row.key} icon={row.icon} title={row.title} body={row.body}>
                <Switch checked={settings[row.key]} label={row.title} onChange={(next) => void change(row.key, row.param, next)} />
              </SettingRow>
            ))}
        </>
      )}
      {!native && (
        <SettingRow
          icon={Mail}
          title="Notes from finders"
          body={
            emailAvailable
              ? 'Notes arrive in your QuR Tag inbox here, and we email you when one comes in.'
              : 'Notes arrive in your QuR Tag inbox here. Check it, especially when something is lost.'
          }
        />
      )}
      {emailAvailable !== null && (emailAvailable ? settings : true) && (
        <SettingRow
          icon={EMAIL_ROW.icon}
          title={EMAIL_ROW.title}
          body={emailAvailable ? emailBody : 'Email alerts are coming soon.'}
        >
          <Switch
            checked={emailAvailable && settings ? settings.email_copy : false}
            disabled={!emailAvailable}
            label={EMAIL_ROW.title}
            onChange={(next) => void change(EMAIL_ROW.key, EMAIL_ROW.param, next)}
          />
        </SettingRow>
      )}
    </>
  );
}

type PermissionState = PushPermission | 'unknown';
