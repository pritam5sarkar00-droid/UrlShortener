const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = 62n;

export function encode(value) {
  let num = BigInt(value);
  if (num === 0n) return ALPHABET[0];
  if (num < 0n) throw new Error('Cannot Base62-encode a negative number');

  let result = '';
  while (num > 0n) {
    result = ALPHABET[Number(num % BASE)] + result;
    num /= BASE;
  }
  return result;
}

export function decode(code) {
  let result = 0n;
  for (const char of code) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid Base62 character: ${char}`);
    result = result * BASE + BigInt(index);
  }
  return result;
}
