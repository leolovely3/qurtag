/**
 * A gentle check on what an owner types where a finder will read it: the item's name (shown as
 * the heading of the finder's page) and the word for the finder. A child's name on a school bag
 * plus a stranger's friendly message is a safeguarding risk, and a phone number or address there
 * defeats the privacy QuR Tag is for. So the screens say "Describe the thing, not the person" and,
 * when the text looks like it holds a name, a phone number, an email or a street address, show a
 * plain warning under the box. It never blocks saving: it is advice, and names are guessed.
 *
 * What counts as a name: a capitalised word before 's ("Maya's backpack"), or a capitalised word
 * that is a common first name (from the short list below) anywhere in the text. Common first names
 * that are also everyday words (Will, Rose, June, Bill and so on) count only in the possessive.
 */

/** Common US first names; everyday words that are also names are left out on purpose. */
const FIRST_NAMES = new Set(
  `aaron abby abigail adam addison aiden alex alexa alexander alice allison alyssa amelia amy andrew angela anna
  anthony aria ariana ashley aubrey audrey austin ava avery bella ben benjamin blake brandon brayden brian brianna
  brooke caleb cameron camila carlos carter charlie charlotte chloe chris christian christopher claire cole connor
  daniel david delilah dylan easton eli elijah elizabeth ella ellie emily emma eric ethan eva evelyn ezra gabriel
  gavin genesis grayson hailey hannah harper hazel henry hudson ian isaac isabella isaiah jack jackson jacob jake
  james jasmine jason jayden jennifer jeremiah jessica john jonathan jordan joseph joshua josiah julia julian justin
  kaylee kevin kayla khloe kimberly kyle landon layla leah leo levi liam lillian lily lincoln logan lucas lucy luke
  luna madelyn madison maria mason matthew maya mia michael michelle mila nathan natalie nevaeh nicholas noah nora
  oliver olivia owen paisley penelope peyton riley robert ryan sadie samantha samuel sarah savannah scarlett
  sebastian sofia sophia sophie stella taylor thomas tyler valentina victoria violet william wyatt xavier zoe zoey
  aaliyah adrian alejandro alexis amanda andrea angel ashton bailey brady brody brooklyn caroline cassidy chase
  dominic eleanor elena eliana emilia gianna isla ivy jade jaxon jordyn josephine kai kennedy kinsley lauren lydia
  makayla mackenzie molly naomi nolan quinn reagan rylee serenity skylar sydney trinity vanessa wesley`.split(/\s+/),
);

export interface DetailWarning {
  kind: 'name' | 'phone' | 'email' | 'address';
  /** The word or text that set it off, as typed. */
  found: string;
  message: string;
}

const PHONE = /(?:\+?\d[\s().-]*){7,}/;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const ADDRESS = /\b\d{1,5}\s+(?:[A-Za-z]+\s+){0,3}(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|boulevard|blvd|way|place|pl|terrace|circle)\b\.?/i;
const POSSESSIVE = /\b([A-Z][a-z]{1,20})['’]s\b/;
const WORD = /\b[A-Z][a-z]{1,20}\b/g;

/** The first thing in `text` a finder should not read, or null. */
export function personalDetailWarning(text: string | null | undefined): DetailWarning | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  const email = EMAIL.exec(t);
  if (email) return { kind: 'email', found: email[0], message: 'This looks like an email address. Anyone who scans the tag can read it, and finders write to you through QuR Tag anyway.' };
  const phone = PHONE.exec(t);
  if (phone) return { kind: 'phone', found: phone[0].trim(), message: 'This looks like a phone number. Anyone who scans the tag can read it, and finders write to you through QuR Tag anyway.' };
  const address = ADDRESS.exec(t);
  if (address) return { kind: 'address', found: address[0], message: 'This looks like a street address. Anyone who scans the tag can read it. Leave it out.' };
  const own = POSSESSIVE.exec(t);
  if (own) return nameWarning(own[1]);
  for (const m of t.matchAll(WORD)) {
    if (FIRST_NAMES.has(m[0].toLowerCase())) return nameWarning(m[0]);
  }
  return null;
}

function nameWarning(name: string): DetailWarning {
  return {
    kind: 'name',
    found: name,
    message: `"${name}" looks like a name. Anyone who scans the tag can read it, so leave names out, most of all a child's. Describe the thing instead, such as "purple backpack".`,
  };
}

/** The hint under every item name box. */
export const NAME_HINT = "The finder sees this. Describe the thing, not the person: purple backpack, not Maya's backpack.";
