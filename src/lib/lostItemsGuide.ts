/**
 * The guide at /qr-stickers-for-lost-items: the page for people who search for QR stickers for lost
 * things without knowing the name QuR Tag. The words live here, apart from the page, so a unit test
 * can check the question, the length of the first answer and the claims without rendering React.
 *
 * Every statement matches the live pages it repeats: How it works, Tag styles, Make it last and Help
 * (src/lib/faq.ts). Change those first, then this.
 */
export interface GuideSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export const LOST_ITEMS_GUIDE = {
  path: '/qr-stickers-for-lost-items',
  h1: 'How do QR stickers for lost items work?',
  answer:
    'A QR sticker for lost items carries a code that opens a web page about the thing it is stuck on. Put one on bottles, keys, bags and instruments. Whoever finds it scans the code with their phone camera, sees the item’s name and writes you a message, with no app and no account.',
  sections: [
    {
      title: 'What happens when someone finds your thing',
      bullets: [
        'They point their phone camera at the QR code and tap the link that appears.',
        'A web page shows the item’s name, a photo if you added one, and your short note.',
        'They write where the item is and how to get it back to you. They need no app and no account.',
        'Their note waits in your QuR Tag inbox. You read it and reply there.',
        'They read your reply by scanning the tag again on the same phone, or at qurtag.com/reply with the conversation code they were given.',
      ],
    },
    {
      title: 'What stays private',
      paragraphs: [
        'The finder sees the item’s name, its photo and your note. Neither of you sees the other’s phone number, email or address unless you choose to write it in a message. So a sticker never needs your phone number printed on it.',
      ],
    },
    {
      title: 'How to label bottles, keys, bags and instruments',
      bullets: [
        'Water bottles: use the small sticker on the flattest part, away from seams and ridges. Round its corners with scissors, and do not wrap the code round a tight curve.',
        'Keys: print the key fob insert, fold it once and slide it into a clear keychain photo holder on a split ring.',
        'Bags: put a wallet card or bag tag in a clear luggage tag holder with a strap that closes, or stick a label pocket inside the bag.',
        'Instruments: put a small sticker or label strip on the instrument case, on the back of the case or under the lid, where it is not gripped all day.',
        'The same small stickers suit glasses cases, chargers, lunchboxes and laptops. For jackets, print the clothing strip on iron-on transfer paper.',
      ],
    },
    {
      title: 'What size should the QR sticker be?',
      paragraphs: [
        'Print at 100% (actual size), never “fit to page”, so the code stays at least about 0.75 inch (2 cm) wide. Keep it black on white with its white edge uncropped, then scan it yourself once it is on. A short code such as qurtag.com/k7m2p4 is printed beside it, so a scuffed tag can still be typed into a browser.',
      ],
    },
    {
      title: 'How to get QR stickers for your things',
      paragraphs: [
        'Make an account, add an item and print its tag at home. It is free for up to three items. Print on weatherproof vinyl sticker paper, or on plain paper covered with clear packing tape.',
        'No printer, or want vinyl? Choose Get a print-ready file on the tag page for a PNG and a PDF at exact size, and upload it to any online sticker printer. QuR Tag does not sell tags or stickers.',
      ],
    },
    {
      title: 'If something goes missing',
      paragraphs: [
        'Switch the item to lost, and its tag page tells a finder the item is missing, so they know you are looking. If a tag itself is lost, make a new code for the item and the old tag stops working.',
        'QuR Tag is not a tracker. It cannot locate anything on its own and needs no battery. It works when someone kind finds your thing and scans the tag.',
      ],
    },
  ] satisfies GuideSection[],
};
