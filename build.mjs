import {build} from 'esbuild';
await build({entryPoints:['src/editor.ts'],bundle:true,outfile:'app.js',format:'iife',target:'chrome130'});
