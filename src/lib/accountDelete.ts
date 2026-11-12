/**
 * Deleting an account removes every item and tag at once (and, for a Family owner, the family's
 * items for everyone in it). When that is a lot to lose, the dialog asks the owner to type DELETE,
 * so one stray tap on a phone cannot do it; it always offers "Download my data first".
 */
export const DELETE_WORD = 'DELETE';

/** True when the dialog asks for the typed word: a family with other people in it, or more than 3 items. */
export function needsTypedConfirm(input: { itemsUsed: number; familyRole: 'none' | 'owner' | 'member'; otherPeople: number }): boolean {
  return input.itemsUsed > 3 || (input.familyRole === 'owner' && input.otherPeople > 0);
}

export function typedOk(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_WORD;
}
