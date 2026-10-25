import { CONTACT } from './contact';

/**
 * The questions on the Help page, written once. The page shows them (src/routes/marketing/Help.tsx)
 * and the build writes the same list into the page's FAQPage markup for search (src/seo/structured.ts),
 * so the markup can never name a question or an answer the page does not show.
 *
 * An answer is plain text with two markers: {contact} stands for the contact address, and
 * [words](/path) is a link to another page of the site. `plainAnswer` removes the markers.
 * `paid` marks the answers about plans; the iPhone app leaves them out until memberships can be
 * bought there (src/lib/membership-flag.ts).
 */
export interface Faq {
  q: string;
  a: string;
  paid?: boolean;
}

export const FAQS: Faq[] = [
  {
    q: 'What does the finder see?',
    a: 'The item\'s name, its photo if you added one, and your short note. They do not see your email, name or phone number. They can write you a message from the page, with no app and no account.',
  },
  {
    q: 'What do I see as the owner?',
    a: 'Your QuR Tag inbox shows each note from a finder. You can reply there. In the iPhone app you can also get an alert the moment a finder writes, and reply from the alert itself. Turn it on in Settings, under Notifications. You choose which alerts you want.',
  },
  {
    q: 'Report or block a finder',
    a: 'Open the conversation in your inbox. To report one note, choose Report under it, pick a reason and send. The note is hidden from you at once, and we review every report within 24 hours. To stop a finder writing to you, choose Block this finder: that conversation is closed to them and they are only told it is closed. If they scan the tag again from another phone or browser they could start a new conversation, so to stop all new notes, switch the tag off in Tags. You can unblock from Settings, under Blocked finders. If a note threatens you or a child, do not meet alone, do not share your address, and contact your local police if you feel unsafe. A note with offensive words or a threat arrives held back with "This note may be offensive. Show it?" so you choose whether to read it. For anything else, email {contact}.',
  },
  {
    q: 'How does the finder read my reply?',
    a: 'They open the same tag page on the same phone. The page keeps their conversation in that browser and shows your reply there.',
  },
  {
    q: 'Is QuR Tag a tracker?',
    a: 'No. It cannot find anything on its own. It works when a kind person finds your item and scans the tag.',
  },
  {
    q: 'Do I need this if I already have a tracker?',
    a: 'A Bluetooth tracker shows where your thing is. A QuR Tag helps an honest finder send it back: they scan it with any phone camera, with no app, and write you a note without seeing your phone number or email. It needs no battery, so it keeps working after a tracker\'s battery runs out. For the things that matter most, like luggage, backpacks and instrument cases, use both.',
  },
  {
    q: 'What does it cost?',
    paid: true,
    a: 'Free for up to three items, and you print your own tags. Plus ($19 a year) has no limit on items and keeps your full scan history. Family ($29 a year) is Plus for up to five people who share the items and the inbox.',
  },
  {
    q: 'How do I cancel?',
    paid: true,
    a: 'On the web, open Membership in your account and choose Manage membership. On iPhone, open Settings, tap your name, then Subscriptions. You keep your plan until the end of the period you paid for.',
  },
  {
    q: 'What happens to my items if I go back to Free?',
    paid: true,
    a: 'Nothing is deleted. Your three oldest items stay editable. The rest stay, and you can read them, print their tags and delete them, but not change them until you upgrade or delete some. Finders can still scan their tags and write to you.',
  },
  {
    q: 'How does Family work?',
    paid: true,
    a: 'The person who buys Family invites up to four others by email. Everyone sees the same items and inbox. The owner can remove people and anyone can leave. Invites are made on the Membership page.',
  },
  {
    q: 'Can I offer a thank-you?',
    a: 'You can write a note such as "Small thank-you if you return it". It is only text. No money moves through QuR Tag.',
  },
  {
    q: 'What if my tag is damaged or lost?',
    a: 'Open the item and print its tag again. If the old tag went missing and you want it to stop working, choose Make a new code: the old tag and its short code stop working at once.',
  },
  {
    q: 'Which tag style should I print?',
    a: 'Choose a style on the tag page. A small sticker or label strip suits bottles, lunchboxes and laptops, a key fob insert suits keys, a wallet card or bag tag suits bags, and a clothing strip suits jackets. Each comes in Clean, Bold and Playful looks, on US Letter or A4, with several copies on a page.',
  },
  {
    q: 'What is the short code on my tag?',
    a: 'A few letters and numbers printed beside the QR code, for example qurtag.com/k7m2p4. Typing it into a browser opens the same page as scanning the code, so a scuffed tag can still be used. It is not case sensitive.',
  },
  {
    q: 'How do I make my tag last?',
    a: 'Print on weatherproof sticker paper, or cover a paper tag with clear packing tape, and use a clear holder for bags. Our [Make it last guide](/make-it-last) has the details, including curved bottles and clothing.',
  },
  {
    q: 'Can I have my tags printed as stickers?',
    a: 'Yes. On the tag page choose Get a print-ready file. You get a PNG and a PDF at exact size with bleed, which you can upload to any online sticker printer for waterproof vinyl. QuR Tag does not sell tags or stickers, so you choose the printer.',
  },
  {
    q: 'How do I mark an item as lost?',
    a: 'Open the item in the app and switch it to lost. Its tag page then says the item is missing.',
  },
  {
    q: 'How do I delete my account?',
    a: 'From Settings, or email {contact}.',
  },
  {
    q: 'Who runs QuR Tag?',
    a: 'Impact Consulting AI LLC, a Florida limited liability company.',
  },
];

/** The questions to show: all of them on the web, without the plan ones where memberships cannot be bought. */
export function visibleFaqs(memberships: boolean): Faq[] {
  return FAQS.filter((f) => memberships || !f.paid);
}

/** An answer as plain text, for search markup: links keep their words, {contact} becomes the address. */
export function plainAnswer(a: string): string {
  return a.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\{contact\}/g, CONTACT);
}
