import Stripe from 'stripe';
import { required } from './env.js';
let client: Stripe | undefined;
export function getStripe(): Stripe { return client ??= new Stripe(required('STRIPE_SECRET_KEY')); }
export const stripe = new Proxy({} as Stripe, { get(_target, key) { const value = Reflect.get(getStripe(), key); return typeof value === 'function' ? value.bind(getStripe()) : value; } });
