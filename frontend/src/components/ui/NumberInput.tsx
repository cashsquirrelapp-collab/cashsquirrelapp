import React, { useRef, useLayoutEffect } from 'react';

// Drop-in replacement for <input type="number"> on baht-amount fields -- displays thousand
// separators ("1,000") while typing, but the value/onChange contract stays a plain unformatted
// numeric string (or number), so every existing parseFloat(value)/setState(value) call site at
// the caller needs no other changes beyond swapping the tag and dropping the `e.target.value`
// indirection (onChange here already hands back the raw string).
//
// type="text" + inputMode="decimal" instead of type="number", since a native number input can't
// display comma-formatted text at all -- inputMode keeps the numeric keyboard on mobile.

function formatDisplay(raw: string): string {
  if (!raw) return '';
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const dotIndex = unsigned.indexOf('.');
  const intPart = dotIndex === -1 ? unsigned : unsigned.slice(0, dotIndex);
  const decPart = dotIndex === -1 ? undefined : unsigned.slice(dotIndex + 1);
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = negative ? '-' : '';
  return decPart !== undefined ? `${sign}${withCommas}.${decPart}` : `${sign}${withCommas}`;
}

// Keeps at most one leading minus and one decimal point, strips everything else (including the
// commas formatDisplay adds) back out -- this is what callers' existing parseFloat/setState
// logic actually receives.
function stripToRaw(display: string): string {
  const negative = display.trim().startsWith('-');
  let s = display.replace(/[^\d.]/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  }
  return (negative ? '-' : '') + s;
}

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string | number | undefined;
  onChange: (raw: string) => void;
}

export default function NumberInput({ value, onChange, ...rest }: NumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCursorDigits = useRef<number | null>(null);

  const raw = value === undefined || value === null ? '' : String(value);
  const display = formatDisplay(raw);

  // Inserting/removing commas as you type shifts where the caret should land -- restore it by
  // counting digits from the left in the old display, then walking that many digits into the new
  // one, rather than letting the browser leave it wherever the raw re-render happens to put it
  // (typically the end, which makes editing anywhere but the tail feel broken).
  useLayoutEffect(() => {
    if (pendingCursorDigits.current === null || !inputRef.current) return;
    const digitsBeforeCursor = pendingCursorDigits.current;
    pendingCursorDigits.current = null;
    let count = 0;
    let pos = display.length;
    if (digitsBeforeCursor === 0) {
      pos = 0;
    } else {
      for (let i = 0; i < display.length; i++) {
        if (/[\d.]/.test(display[i])) count++;
        if (count >= digitsBeforeCursor) {
          pos = i + 1;
          break;
        }
      }
    }
    inputRef.current.setSelectionRange(pos, pos);
  }, [display]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const cursor = el.selectionStart ?? el.value.length;
    pendingCursorDigits.current = el.value.slice(0, cursor).replace(/[^\d.]/g, '').length;
    onChange(stripToRaw(el.value));
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={display}
      onChange={handleChange}
      {...rest}
    />
  );
}
