/**
 * Short, URL-safe public id for tags.
 *
 * Alphabet excludes 0/O/1/I/l for human readability. Print these on tags
 * so they remain legible if the QR is scuffed.
 *
 * 10 chars × 56 alphabet ≈ 2.9e17 keyspace, way more than enough.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function generateTagPublicId(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
