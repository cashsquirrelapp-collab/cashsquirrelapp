// One Vercel function: route rewrites share the same tested backend handlers.
import handler from '../backend/src/http/router.js';
export const config={api:{bodyParser:false}};
export default handler;
