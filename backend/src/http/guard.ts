import type { Handler, VercelRequest, VercelResponse } from './types.js';
import { appOrigin } from '../config/env.js';
export class HttpError extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } }
export function assertSameOrigin(req: VercelRequest): void {
  if (req.headers.origin !== appOrigin() || req.headers['x-csrf-protection'] !== '1') throw new HttpError(403, 'Invalid request origin');
}
export function withGuard(handler: Handler, options: { csrf?: boolean } = {}): Handler {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (options.csrf && !['GET', 'HEAD'].includes(req.method || '')) assertSameOrigin(req);
      await handler(req, res);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if(status===429 && !res.hasHeader('Retry-After'))res.setHeader('Retry-After','60');
      console.error('API request failed', { path: req.url?.split('?')[0], status, type: error instanceof Error ? error.name : 'UnknownError' });
      if (!res.headersSent) res.status(status).json({ error: status === 500 ? 'บริการไม่พร้อมใช้งาน กรุณาลองใหม่' : (error as Error).message,
        ...(error instanceof HttpError && error.code ? { code: error.code } : {}) });
    }
  };
}
export async function readRawBody(req: VercelRequest, limit = 1024 * 1024): Promise<Buffer> {
  if(Number(req.headers?.['content-length'])>limit)throw new HttpError(413,'Request too large');
  if (Buffer.isBuffer(req.body)) { if (req.body.length > limit) throw new HttpError(413, 'Request too large'); return req.body; }
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { const part = Buffer.from(chunk); size += part.length; if (size > limit) throw new HttpError(413, 'Request too large'); chunks.push(part); }
  return Buffer.concat(chunks);
}
