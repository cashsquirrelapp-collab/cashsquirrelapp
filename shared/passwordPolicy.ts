// Sign-up and reset rules (owner, 2026-10-21: the old ones were too strict).
// 8–128 characters with at least one letter (Thai or English) and one digit.
// Upper case, lower case and symbols are welcome but no longer required.
export type PasswordRequirement = 'length' | 'letter' | 'number';

export function passwordRequirements(password: string): Record<PasswordRequirement, boolean> {
  const length = [...password].length;
  return {
    length: length >= 8 && length <= 128,
    letter: /\p{L}/u.test(password),
    number: /\p{Nd}/u.test(password),
  };
}

export function isValidPassword(password: string): boolean {
  return Object.values(passwordRequirements(password)).every(Boolean);
}
