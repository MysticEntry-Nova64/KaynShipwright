import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('release metadata and visible HTML use consistent version and valid UTF8',()=>{
 const read=(name:string)=>fs.readFileSync(new URL('../'+name,import.meta.url));
 const pkg=JSON.parse(read('package.json').toString()),lock=JSON.parse(read('package-lock.json').toString());
 assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
 const html=new TextDecoder('utf-8',{fatal:true}).decode(read('index.html'));
 assert.ok(html.includes('<small>V'+pkg.version+'</small>'));assert.ok(html.includes('<title>'+pkg.productName+' V'+pkg.version+'</title>'));
 assert.ok(html.includes('Direction °'));assert.ok(html.includes('BOW ↑'));assert.ok(!html.includes('Â°'));
});
