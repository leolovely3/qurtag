/**
 * The answers in the app's Help (src/routes/app/HelpCenter.tsx), grouped by what the person is
 * trying to do. Each answer can carry one link that does the thing. Answers are plain text so
 * search can read them. Statements here must match what the app does; the public Help page
 * (src/routes/marketing/Help.tsx) says the same things in its own order.
 */
export interface HelpEntry {
  id: string;
  q: string;
  a: string;
  action?: { label: string; to: string };
  /** About plans and prices: left out in the iPhone app while memberships are hidden. */
  paid?: boolean;
  /** About the iPhone app only. */
  iphone?: boolean;
}

export interface HelpSection {
  id: string;
  title: string;
  /** The title when memberships are hidden (the paid answers are gone). */
  titleWithoutPlans?: string;
  entries: HelpEntry[];
}

export const HELP: HelpSection[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    entries: [
      {
        id: 'first-item',
        q: 'How do I add my first item?',
        a: 'Tap + on Items. Pick what you are tagging, add a photo and a word for the finder if you like, and QuR Tag makes the tag. The walkthrough then helps you print it, stick it on and test it.',
        action: { label: 'Add an item', to: '/start/setup' },
      },
      {
        id: 'after-adding',
        q: 'What do I do after I add an item?',
        a: 'Print its tag, stick it on the thing, then test it. The Getting started card on Items keeps track of these steps. You can skip any of them.',
        action: { label: 'Print a tag', to: '/app/tags' },
      },
      {
        id: 'test-tag',
        q: 'How do I test my tag?',
        a: 'Scan the printed tag with your phone camera once it is on. If your item\'s page opens, the tag works at the size it printed. Your own scan shows in your scan history, like a finder\'s. With no tag yet, Test on the Tags screen shows the page a finder sees without counting anything, but it does not check the paper tag.',
        action: { label: 'Your tags', to: '/app/tags' },
      },
      {
        id: 'free-items',
        q: 'How many things can I tag?',
        a: 'Free covers up to three items, and you print your own tags.',
        action: { label: 'Add an item', to: '/start/setup' },
      },
    ],
  },
  {
    id: 'printing',
    title: 'Printing and sticking',
    entries: [
      {
        id: 'which-style',
        q: 'Which tag style should I print?',
        a: 'A small sticker or label strip suits bottles, lunchboxes, laptops and cases. A key fob insert suits keys. A bag tag suits backpacks, gym bags and luggage, a wallet card suits wallets and walkers, and a clothing strip suits jackets. Each comes in Clean, Bold and Playful looks, on US Letter or A4. The key fob, wallet card and bag tag go in a clear holder (about $3); the tag page says what each style needs and how to do without.',
        action: { label: 'Print a tag', to: '/app/tags' },
      },
      {
        id: 'no-printer',
        q: 'I have no printer. What can I do?',
        a: 'On the tag page choose Save the PDF, then print it at a library, a print shop or on any computer. Ask for 100% (actual size). In the Facebook or Instagram app printing usually does nothing: open the page in Safari or Chrome first.',
        action: { label: 'Your tags', to: '/app/tags' },
      },
      {
        id: 'several',
        q: 'Can I print tags for several things on one page?',
        a: 'Yes. On Tags choose Print several items on one page, tick the things and choose how many of each. They print in one style, and the top edge of the page lists each item with the short address printed on its tags, so you can tell them apart once cut.',
        action: { label: 'Your tags', to: '/app/tags' },
      },
      {
        id: 'make-it-last',
        q: 'How do I make my tag last?',
        a: 'Print on weatherproof sticker paper, or cover a paper tag with clear packing tape or laminate it. Stick it on a clean, flat, dry spot. Keep the code at least about 0.75 inch (2 cm) wide and do not crop its white border.',
        action: { label: 'Make it last guide', to: '/app/make-it-last' },
      },
      {
        id: 'print-ready',
        q: 'Can I have my tags printed as stickers?',
        a: 'Yes. On the tag page choose Get a print-ready file. You get a PNG and a PDF at exact size with bleed, which you can upload to any online sticker printer for waterproof vinyl. QuR Tag does not sell tags or stickers.',
        action: { label: 'Print a tag', to: '/app/tags' },
      },
      {
        id: 'damaged',
        q: 'What if my tag is damaged or lost?',
        a: 'Open the item and print its tag again. If the old tag went missing and you want it to stop working, choose Make a new code: the old tag and its short code stop working at once.',
        action: { label: 'Your tags', to: '/app/tags' },
      },
      {
        id: 'short-code',
        q: 'What is the short code on my tag?',
        a: 'A few letters and numbers printed beside the QR code, for example qurtag.com/k7m2p4. Typing it into a browser opens the same page as scanning the code, so a scuffed tag can still be used. It is not case sensitive.',
      },
    ],
  },
  {
    id: 'found',
    title: 'When someone finds your item',
    entries: [
      {
        id: 'finder-sees',
        q: 'What does the finder see?',
        a: "The item's name, its photo if you added one, and your short word for the finder. They never see your email, name or phone number. So keep names out of what they do see: call it purple backpack, not Maya's backpack, most of all for a child's things. They can write you a note from the page, with no app and no account.",
        action: { label: 'Test what a finder sees', to: '/app/tags' },
      },
      {
        id: 'reply',
        q: 'How do I read and reply to a note?',
        a: 'Notes from finders wait in your Inbox. Open one, read it and reply. The finder opens the same tag page on the same phone to read your reply.',
        action: { label: 'Open your inbox', to: '/app/inbox' },
      },
      {
        id: 'alerts',
        q: 'How do I get an alert when a finder writes?',
        a: 'In the iPhone app, turn on alerts in Settings, under Notifications. You choose which alerts you want, and you can reply from the alert itself. On the website, we email you when a finder writes, from no-reply@qurtag.com. In Settings, send yourself a test email and check it is not in spam.',
        action: { label: 'Turn on alerts', to: '/app/settings#alerts' },
      },
      {
        id: 'lost',
        q: 'How do I mark an item as lost?',
        a: 'Open the item and switch it to lost. Its tag page then says the item is missing, so a finder knows you are looking.',
        action: { label: 'Your items', to: '/app' },
      },
      {
        id: 'thank-you',
        q: 'Can I offer a thank-you?',
        a: 'You can write a word such as "Thank you! There is a reward for its safe return." It is only text. No money moves through QuR Tag.',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy and safety',
    entries: [
      {
        id: 'report-block',
        q: 'How do I report or block a finder?',
        a: 'Open the conversation in your inbox. To report one note, choose Report under it, pick a reason and send. The note is hidden from you at once, and we review every report within 24 hours. To stop a finder writing to you, choose Block this finder: they cannot write again and are only told the conversation is closed. You can unblock in Settings, under Blocked finders. A note with offensive words or a threat arrives held back so you choose whether to read it.',
        action: { label: 'Open your inbox', to: '/app/inbox' },
      },
      {
        id: 'details',
        q: 'Does a finder see my phone number or address?',
        a: 'No. Neither side sees the other\'s phone number, email or address unless you choose to write it in a message. Do not put your phone number or address in your word for the finder, because anyone who scans the tag can read it.',
      },
      {
        id: 'tracker',
        q: 'Is QuR Tag a tracker?',
        a: 'No. It cannot find anything on its own. It works when a kind person finds your item and scans the tag.',
      },
      {
        id: 'policy',
        q: 'How is my information used?',
        a: 'The privacy policy lists what we collect, why, who can see it and how to get it deleted.',
        action: { label: 'Read the privacy policy', to: '/app/privacy' },
      },
    ],
  },
  {
    id: 'account',
    title: 'Account and membership',
    titleWithoutPlans: 'Account',
    entries: [
      {
        id: 'password',
        q: 'How do I change my password?',
        a: 'Open Account from the top of Settings and choose Change password. Your other devices are signed out. If you cannot sign in, use Forgot password on the sign-in page.',
        action: { label: 'Change password', to: '/app/account' },
      },
      {
        id: 'name-email',
        q: 'How do I change my name or email?',
        a: 'Your name is on the Account screen. To change the email you sign in with, write to us and we will do it.',
        action: { label: 'Open Account', to: '/app/account' },
      },
      {
        id: 'data',
        q: 'How do I download or delete my data?',
        a: 'On the Account screen, choose Download my data to save a file of your items, tags, scans and conversations, or Delete my account to remove everything. A deleted account cannot be brought back, and its tags stop working.',
        action: { label: 'Open Account', to: '/app/account' },
      },
      {
        id: 'cost',
        q: 'What does it cost?',
        paid: true,
        a: 'Free for up to three items, and you print your own tags. Plus ($19 a year) has no limit on items and keeps your full scan history. Family ($29 a year) is Plus for up to five people who share the items and the inbox.',
        action: { label: 'See plans', to: '/app/membership' },
      },
      {
        id: 'cancel',
        q: 'How do I cancel?',
        paid: true,
        a: 'On the web, open Membership in your account and choose Manage membership. On iPhone, open Settings, tap your name, then Subscriptions. You keep your plan until the end of the period you paid for.',
        action: { label: 'Open Membership', to: '/app/membership' },
      },
      {
        id: 'downgrade',
        q: 'What happens to my items if I go back to Free?',
        paid: true,
        a: 'Nothing is deleted. Your three oldest items stay editable. The rest stay, and you can read them, print their tags and delete them, but not change them until you upgrade or delete some. Finders can still scan their tags and write to you.',
      },
      {
        id: 'family',
        q: 'How does Family work?',
        paid: true,
        a: 'The person who buys Family invites up to four others by email. Everyone sees the same items and inbox. The owner can remove people and anyone can leave. Invites are made on the Membership page.',
        action: { label: 'Open Membership', to: '/app/membership' },
      },
    ],
  },
];

/** Which answers to show: plan answers only where memberships are on, and only the ones that match the search. */
export function visibleHelp(sections: HelpSection[], opts: { memberships: boolean; native: boolean; query: string }): HelpSection[] {
  const words = opts.query.toLowerCase().split(/\s+/).filter(Boolean);
  return sections
    .map((s) => ({
      ...s,
      title: !opts.memberships && s.titleWithoutPlans ? s.titleWithoutPlans : s.title,
      entries: s.entries.filter((e) => {
        if (e.paid && !opts.memberships) return false;
        if (e.iphone && !opts.native) return false;
        if (!words.length) return true;
        const hay = `${s.title} ${e.q} ${e.a} ${e.action?.label ?? ''}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      }),
    }))
    .filter((s) => s.entries.length > 0);
}
