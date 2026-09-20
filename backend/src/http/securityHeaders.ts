import type { VercelResponse } from './types.js';
export const productionCsp="default-src 'self'; script-src 'self' https://static.line-scdn.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://api.emailjs.com https://api.line.me https://access.line.me https://liff.line.me; frame-src https://access.line.me https://liff.line.me; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
export function securityHeaders(res:VercelResponse,production:boolean) {
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 res.setHeader('Content-Security-Policy',production?productionCsp:productionCsp.replace("script-src 'self'","script-src 'self' 'unsafe-inline'").replace("connect-src 'self'","connect-src 'self' ws: wss:"));
 if(production)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
}
