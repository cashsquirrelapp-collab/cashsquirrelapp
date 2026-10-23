import { httpServerHandler } from 'cloudflare:node';
import { createApp } from '../backend/src/http/app.js';
import { withCloudflareClientIp } from '../backend/src/security/requestContext.js';

// Candidate full backend transport. The staging entry point does not expose it
// until separately verified test integrations are configured and reviewed.
const app = createApp();
app.listen(3001);
const handler = httpServerHandler({ port: 3001 });
export function backendFetch(request: Request, env: unknown, ctx: unknown) {
  return withCloudflareClientIp(request, () => handler.fetch(request, env, ctx as any));
}
