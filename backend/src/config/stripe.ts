import { isStaging, stagingProviderReady } from '../security/staging.js';
import Stripe from 'stripe';
import { required } from './env.js';

let client: Stripe | undefined;

export function stripeLivemodeForKey(key: string): boolean {
  if (/^(?:sk|rk)_live_/.test(key)) return true;
  if (/^(?:sk|rk)_test_/.test(key)) return false;
  throw new Error('STRIPE_SECRET_KEY must be a Stripe test or live secret/restricted key');
}

export function configuredStripeLivemode(): boolean {
  const keyLivemode = stripeLivemodeForKey(required('STRIPE_SECRET_KEY'));
  const mode = required('STRIPE_MODE').toLowerCase();
  if (mode !== 'test' && mode !== 'live') throw new Error('STRIPE_MODE must be test or live');
  if ((mode === 'live') !== keyLivemode) throw new Error('STRIPE_MODE does not match STRIPE_SECRET_KEY');
  return keyLivemode;
}

export function getStripe(): Stripe {
  if (isStaging() && !stagingProviderReady('stripe')) throw new Error('Stripe staging is not configured safely');
  const key = required('STRIPE_SECRET_KEY');
  configuredStripeLivemode();
  // Workers use fetch directly; avoid retaining Node HTTP agent sockets across requests.
  return client ??= new Stripe(key, { httpClient: Stripe.createFetchHttpClient(), timeout: 20_000, maxNetworkRetries: 2 });
}

export const stripe = new Proxy({} as Stripe, { get(_target, key) { const value = Reflect.get(getStripe(), key); return typeof value === 'function' ? value.bind(getStripe()) : value; } });
