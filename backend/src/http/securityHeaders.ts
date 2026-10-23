import type { VercelResponse } from './types.js';
export const productionCsp="default-src 'self'; script-src 'self' https://static.line-scdn.net https://js.stripe.com https://checkout.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.stripe.com https://*.googleusercontent.com https://profile.line-scdn.net; connect-src 'self' https://fonts.googleapis.com https://api.stripe.com https://checkout.stripe.com https://merchant-ui-api.stripe.com https://api.emailjs.com https://api.line.me https://access.line.me https://liff.line.me; frame-src https://*.js.stripe.com https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://access.line.me https://liff.line.me; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";
export function securityHeaders(res:VercelResponse,production:boolean) {
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Cross-Origin-Resource-Policy','same-origin');
 res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 res.setHeader('Content-Security-Policy',production?productionCsp:productionCsp.replace("script-src 'self'","script-src 'self' 'unsafe-inline'").replace("connect-src 'self'","connect-src 'self' ws: wss:"));
 if(production)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
}
