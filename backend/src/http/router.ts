import type { Handler,VercelRequest,VercelResponse } from './types.js';
import { HttpError,withGuard,readRawBody } from './guard.js';
import { ingressLimit } from '../security/ingress.js';
import auth from '../handlers/auth.js';
import data from '../handlers/data.js';
import groups from '../handlers/groups.js';
import adminUsers from '../handlers/admin-users.js';
import download from '../handlers/download-report.js';
import liffConfig from '../handlers/liff-config.js';
import liffSubmit from '../handlers/liff-submit.js';
import lineLink from '../handlers/line-link-code.js';
import lineWebhook from '../handlers/line-webhook.js';
import notify from '../handlers/notify.js';
import reset from '../handlers/password-reset-line.js';
import report from '../handlers/send-monthly-report.js';
import digest from '../handlers/send-overdue-digest.js';
import setup from '../handlers/setup-line-richmenu.js';
import stripe from '../handlers/stripe-webhook.js';
const routes:Record<string,Handler>={auth,data,groups,'admin-users':adminUsers,'download-report':download,'liff-config':liffConfig,'liff-submit':liffSubmit,'line-link-code':lineLink,'line-webhook':lineWebhook,notify,'password-reset-line':reset,'send-monthly-report':report,'send-overdue-digest':digest,'setup-line-richmenu':setup,'stripe-webhook':stripe};
const rawRoutes=new Set(['stripe-webhook','line-webhook']);
export function routeHandler(route:string):Handler {
 return withGuard(async(req,res)=>{
  const handler=Object.hasOwn(routes,route)?routes[route]:undefined;if(!handler)throw new HttpError(404,'API not found');
  await ingressLimit(req,route);
  if(!rawRoutes.has(route)&&!['GET','HEAD'].includes(req.method||'')) {
   const contentType=req.headers['content-type']||'';
   if(!contentType.startsWith('application/json'))throw new HttpError(415,'Expected application/json');
   const raw=await readRawBody(req,route==='data'?4*1024*1024:route==='notify'?128*1024:16*1024);
   try{req.body=raw.length?JSON.parse(raw.toString()):{};}catch{throw new HttpError(400,'Invalid JSON');}
  }
  await handler(req,res);
 },{csrf:['auth','data','groups','admin-users','line-link-code','password-reset-line','notify'].includes(route)});
}
export default withGuard(async(req:VercelRequest,res:VercelResponse)=>{
 const route=req.query.route;
 if(typeof route!=='string')throw new HttpError(404,'API not found');
 await routeHandler(route)(req,res);
});
