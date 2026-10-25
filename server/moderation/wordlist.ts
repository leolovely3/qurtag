/**
 * The words the finder-note filter holds a note for (server/moderation/filter.ts). Kept in this
 * file on purpose: it is small, curated by hand, read by no outside service, and the only place to
 * edit when a word is missed or a harmless one is caught.
 *
 * Two lists. SLURS are single words, matched whole after the note is flattened (lower case, accents
 * and look-alike digits and symbols turned into letters, letters repeated three or more times cut to
 * two), so "n1gger" and "niggeeer" match and "Scunthorpe" does not. THREATS are short phrases
 * matched the same way, with any run of spaces between the words.
 *
 * Keep it conservative. A held note is not deleted: the owner sees "This note may be offensive. Show
 * it?" and can read it, report it or block the finder. A word that is often innocent (a place name,
 * a common first name, "kill" on its own) does not belong here.
 */

/** Racial, ethnic, religious, sexual-orientation, gender and disability slurs, and the worst abuse. */
export const SLURS: readonly string[] = [
  'nigger', 'niggers', 'nigga', 'niggas', 'darkie', 'spic', 'wetback', 'beaner',
  'chink', 'gook', 'slanty', 'paki', 'raghead', 'towelhead', 'sandnigger', 'kike', 'kyke',
  'faggot', 'faggots', 'dyke', 'tranny', 'shemale', 'retard', 'retarded', 'spaz',
  'cunt', 'cunts', 'whore', 'slut', 'bitch', 'bitches', 'motherfucker', 'cocksucker',
];

/** Threats and wishes of harm, as phrases. Spaces stand for any run of spaces. */
export const THREATS: readonly string[] = [
  'kill you', 'kill u', 'kill yourself', 'kys', 'kill your family', 'ill kill you', 'going to kill you', 'gonna kill you', 'want you dead', 'hope you die', 'hope u die', 'you should die', 'you deserve to die',
  'rape you', 'rape u', 'beat you up', 'beat your ass', 'shoot you', 'stab you', 'burn your house', 'burn your car',
  'hurt your family', 'know where you live', 'know where u live', 'blow you up',
];
