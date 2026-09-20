import { defineConfig } from '@playwright/test';
const port=process.env.PLAYWRIGHT_PORT||'3000';
const baseURL=`http://127.0.0.1:${port}`;
export default defineConfig({
 testDir:'./tests/e2e',timeout:30000,fullyParallel:false,workers:1,
 use:{baseURL,viewport:{width:1365,height:900},trace:'retain-on-failure'},
 webServer:{command:'npm start',url:baseURL,reuseExistingServer:!process.env.CI,env:{APP_URL:'https://cash-squirrel.test',PORT:port,HOST:'127.0.0.1'}},
});
