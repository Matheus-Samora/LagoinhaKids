import {defineConfig} from 'vite';
import {cpSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';

// The downloadable APK belongs to the server, not inside the next mobile APK.
let publicPath,outPath;
export default defineConfig(({mode})=>{
 const release={schema:1,id:randomUUID(),built_at:new Date().toISOString()};
 return {
  define:{__APP_RELEASE_ID__:JSON.stringify(release.id)},
  server:{proxy:{'/api':'http://127.0.0.1:8770'}},
  build:{target:'es2022',copyPublicDir:false,rollupOptions:{input:{kids:resolve('index.html'),systems:resolve('systems.html')}}},
  plugins:[{
    name:'web-assets-without-native-installers',
    configResolved(config){publicPath=resolve(config.root,'public');outPath=resolve(config.root,config.build.outDir);},
    closeBundle(){mkdirSync(outPath,{recursive:true});cpSync(publicPath,outPath,{recursive:true,filter:source=>mode==='server'||!source.toLowerCase().endsWith('.apk')});writeFileSync(resolve(outPath,'app-release.json'),JSON.stringify(release));}
  }]
 };});
