import React, { useLayoutEffect, useRef, useState } from 'react';
import { bindJobValueInput, formatJobValue } from './jobValueInput';

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string;
  onChange: (raw: string) => void;
}

export default function PhoneMoneyInput({ value, onChange, ...props }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [rejection, setRejection] = useState('');
  useLayoutEffect(() => {
    if (!input.current) return;
    const el = input.current;
    const unbind = bindJobValueInput(el);
    const rejected = (event: Event) => setRejection((event as CustomEvent<string>).detail);
    el.addEventListener('money-input-rejected', rejected);
    return () => { unbind?.(); el.removeEventListener('money-input-rejected', rejected); };
  }, []);
  useLayoutEffect(() => {
    if (input.current && input.current.value !== formatJobValue(value)) input.current.value = formatJobValue(value);
  }, [value]);
  return <>
    <input {...props} ref={input} type="text" inputMode="decimal" autoComplete="off" defaultValue={formatJobValue(value)}
      onInput={e => { setRejection(''); onChange(e.currentTarget.value.replace(/,/g, '')); }} />
    {rejection && <span role="alert" className="text-xs text-[#C43A3A]">{rejection}</span>}
  </>;
}
