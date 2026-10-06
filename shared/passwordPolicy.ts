export type PasswordRequirement = 'length' | 'uppercase' | 'lowercase' | 'number' | 'symbol';

export function passwordRequirements(password: string): Record<PasswordRequirement, boolean> {
  const length = password.length;
  return {
    length: length >= 8 && length <= 128,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[\p{P}\p{S}]/u.test(password),
  };
}

export function isValidPassword(password: string): boolean {
  return Object.values(passwordRequirements(password)).every(Boolean);
}
