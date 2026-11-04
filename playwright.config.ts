import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
import { CONSENT_VERSIONS } from './shared/consents';
const port=process.env.PLAYWRIGHT_PORT||'3000';
const baseURL=`http://127.0.0.1:${port}`;
const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
// Every test account has agreed to the terms, เลขากระรอก and LINE (shared/consents.ts, 2026-11-05), as this device
// remembers it (services/consent.ts); tests/e2e/consent.spec.ts clears it to test the dialogs. The accounts are the ids
// the specs use.
const testAccounts=[...new Set(readdirSync('./tests/e2e').filter(name=>/\.ts$/.test(name))
 .flatMap(name=>readFileSync(`./tests/e2e/${name}`,'utf8').match(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g)??[]))];
const agreed=Object.fromEntries(testAccounts.map(id=>[id,{...CONSENT_VERSIONS}]));
export default defineConfig({
 testDir:'./tests/e2e',timeout:30000,fullyParallel:false,workers:1,
 // Every test starts with the cookie choice made (tests/e2e/cookie-consent.spec.ts clears it to test the banner).
 use:{baseURL,viewport:{width:1365,height:900},trace:'retain-on-failure',launchOptions:executablePath?{executablePath}:undefined,
  storageState:{cookies:[],origins:[{origin:baseURL,localStorage:[
   {name:'krarok_cookie_consent',value:JSON.stringify({v:1,stats:true,at:'2026-11-02T00:00:00.000Z'})},
   {name:'krarok_consent',value:JSON.stringify(agreed)},
  ]}]}},
 webServer:{command:'npm start',url:baseURL,reuseExistingServer:!process.env.CI,env:{APP_URL:'https://cash-squirrel.test',PORT:port,HOST:'127.0.0.1'}},
});
