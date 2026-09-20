import type { IncomingMessage, ServerResponse } from 'node:http';
export interface VercelRequest extends IncomingMessage { body?: any; query: Record<string, string | string[] | undefined>; }
export interface VercelResponse extends ServerResponse { status(code: number): this; json(data: unknown): this; send(data: unknown): this; }
export type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void;
