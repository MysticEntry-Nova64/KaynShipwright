import {build} from 'esbuild';
await build({entryPoints:['src/editor.ts'],bundle:true,outfile:'app.js',format:'iife',target:'chrome130'});

await build({entryPoints:['src/core.ts'],bundle:true,outfile:'core-node.cjs',platform:'node',format:'cjs',target:'node22'});
