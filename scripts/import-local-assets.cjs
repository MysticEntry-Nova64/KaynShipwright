const fs=require('node:fs'),path=require('node:path');
const source=process.argv[2];if(!source)throw Error('Usage: npm run assets:local -- ABSOLUTE_PATH_TO_EXISTING_SHIPWRIGHT_ASSETS');
const root=path.resolve(__dirname,'..','assets');
const names=['verdant.png','talon-reference.png','lasher-reference.png','hammerhead-reference.png','eagle-reference.png','onslaught-reference.png'];
for(const name of names){const input=path.resolve(source,name);if(!fs.existsSync(input))throw Error('Missing local reference asset: '+name);}
for(const name of names){const input=path.resolve(source,name),target=path.join(root,name);if(input!==target)fs.copyFileSync(input,target);}
console.log('Copied six local-only sprite assets. These files remain ignored by Git.');
