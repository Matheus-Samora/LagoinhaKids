import {defineConfig} from 'vite';
import {cpSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

// The downloadable APK belongs to the server, not inside the next mobile APK.
let publicPath,outPath;
export default defineConfig({
  server:{proxy:{'/api':'http://127.0.0.1:8770'}},
  build:{target:'es2022',copyPublicDir:false,rollupOptions:{input:{kids:resolve('index.html'),systems:resolve('systems.html')}}},
  plugins:[{
    name:'web-assets-without-native-installers',
    configResolved(config){publicPath=resolve(config.root,'public');outPath=resolve(config.root,config.build.outDir);},
    closeBundle(){mkdirSync(outPath,{recursive:true});cpSync(publicPath,outPath,{recursive:true,filter:source=>!source.toLowerCase().endsWith('.apk')});}
  }]
});
