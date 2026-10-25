import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { markPushExplained, turnOnPush } from '@/lib/nativePush';

/**
 * The short explanation shown once, right after the first item is saved, before iOS asks its
 * own permission question. Asking cold, at launch, gets a "Don't Allow" that cannot be taken
 * back from inside the app; asking at the moment alerts clearly matter gets a yes.
 */
export function PushPrimer({ open, itemName, onDone }: { open: boolean; itemName: string; onDone: () => void }) {
  const [working, setWorking] = useState(false);

  async function allow() {
    setWorking(true);
    markPushExplained();
    await turnOnPush();
    setWorking(false);
    onDone();
  }

  function later() {
    markPushExplained();
    onDone();
  }

  return (
    <Modal
      open={open}
      onClose={later}
      eyebrow="Alerts"
      title={itemName ? `Know the moment someone finds your ${itemName}` : 'Know the moment someone finds your thing'}
      description="Allow alerts and your iPhone tells you as soon as a finder writes, so you can reply in seconds. iPhone will ask for permission next. You can change this any time in Settings."
      primaryAction={{ label: 'Turn on alerts', onClick: allow, pending: working }}
      secondaryAction={{ label: 'Not now', onClick: later }}
    />
  );
}
