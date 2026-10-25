import { PageHero, PageBody, Section, P, Steps, CtaBand } from './parts';

const owner = [
  { title: 'Make an account', body: 'Sign up with your email and a password. It is free for up to two items.' },
  { title: 'Add an item', body: 'Give it a name, such as "Blue water bottle". You can add a photo and a short note, for example "Small thank-you if you return it". The note is only words you write. No money moves through QuR Tag.' },
  { title: 'Print the tag', body: 'Print the QR tag on plain paper or sticker paper. Stick it on, tie it on or tuck it inside. Print it again whenever you need to.' },
  { title: 'Get the note and reply', body: 'When a finder writes to you, the note waits in your QuR Tag inbox. Open it, read it and reply. The QuR Tag iPhone app, coming soon to the App Store, alerts you the moment a note arrives and lets you reply from the alert.' },
  { title: 'Mark it lost if it goes missing', body: 'Switch the item to "lost" and its tag page says the item is missing, so a finder knows you are looking.' },
];

const finder = [
  { title: 'Scan the QR', body: 'Point your phone camera at the QR code. Tap the link that appears.' },
  { title: 'See the item', body: 'A web page shows the item name, a photo if the owner added one, and the owner\'s short note.' },
  { title: 'Write a note', body: 'Say where the item is and how to get it back to them. No app and no account.' },
  { title: 'Read the reply', body: 'Come back to the same page on the same phone to read the owner\'s reply. The page keeps your conversation in that browser.' },
];

export function HowItWorks() {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="A QR tag, a note, a reply."
        lede="No app for the finder, no phone numbers swapped. Here are both sides of it."
      />
      <PageBody>
        <Section title="If you own the thing">
          <Steps items={owner} />
        </Section>
        <Section title="If you found something">
          <Steps items={finder} />
        </Section>
        <Section title="Private on both sides">
          <P>
            The finder sees the item's name, photo and your note. The owner sees the finder's message.
            Neither side sees the other's phone number, email or address unless they choose to write
            it in a message.
          </P>
        </Section>
        <Section title="What it is not">
          <P>
            QuR Tag is not a tracker. It cannot locate anything on its own. It works when someone kind
            finds your thing and scans the tag.
          </P>
        </Section>
      </PageBody>
      <CtaBand title="Ready to try it?" />
    </>
  );
}
