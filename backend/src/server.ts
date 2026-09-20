import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { createApp } from './http/app.js';
dotenv.config({path:['.env.local','.env']});
async function startServer() {
 const app=createApp(); const production=process.env.NODE_ENV==='production';
 if(!production) {
  const {createServer}=await import('vite');
  const vite=await createServer({configFile:'frontend/vite.config.ts',server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);
 }else{
  const dist=path.resolve('build/frontend');app.use(express.static(dist));
  app.use((req,res)=>{if(req.method!=='GET'){res.status(405).end();return;}res.setHeader('Cache-Control','no-cache');res.sendFile(path.join(dist,'index.html'));});
 }
 const port=Number(process.env.PORT||3000);
 const server=app.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Cash Squirrel: http://${process.env.HOST||'127.0.0.1'}:${port}`));
 server.requestTimeout=30000; server.headersTimeout=10000;
 const close=()=>server.close(()=>process.exit(0));process.once('SIGTERM',close);process.once('SIGINT',close);
}
startServer().catch(()=>{console.error('Unable to start Cash Squirrel server');process.exitCode=1;});
