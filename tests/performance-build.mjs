import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
for(const page of ['index.html','systems.html']){
 const html=fs.readFileSync('dist/'+page,'utf8');
 const paths=[...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+\.js)"/g)].map(m=>m[1]);
 assert.ok(!paths.some(p=>p.includes('map-library')),'Map must not be preloaded by login');
 const bytes=paths.reduce((total,p)=>total+gzipSync(fs.readFileSync('dist'+p)).length,0);
 assert.ok(bytes<120000,`${page}: initial JS exceeds 120 kB gzip (${bytes})`);
 console.log(`${page}: ${bytes} gzip bytes; map deferred; budget passed.`);
}
