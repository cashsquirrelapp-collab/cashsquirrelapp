import express from 'express';
import type { VercelRequest,VercelResponse } from './types.js';
import { routeHandler } from './router.js';
import { securityHeaders } from './securityHeaders.js';
import { appOrigin } from '../config/env.js';
export function createApp() {
 if(process.env.NODE_ENV==='production')appOrigin();
 const app=express(); app.disable('x-powered-by');
 app.use((_req,res,next)=>{securityHeaders(res as unknown as VercelResponse,process.env.NODE_ENV==='production');next();});
 // Body is read once in the router, preserving webhook signatures.
 app.use('/api',(req,res,next)=>{
  const route=req.path.slice(1);void Promise.resolve(routeHandler(route)(req as unknown as VercelRequest,res as unknown as VercelResponse)).catch(next);
 });
 return app;
}
