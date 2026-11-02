import type { PackageMetadata } from './desktop-api';
let settings:{single?:PackageMetadata;all?:PackageMetadata;singles?:Record<string,PackageMetadata>}={};
export const packageSettings=()=>structuredClone(settings);
export function restorePackageSettings(value:typeof settings|undefined){settings=value||{};}
export function choosePackageMetadata(defaultName:string,all=false,key=defaultName):Promise<PackageMetadata|false>{
 const dialog=document.getElementById('packageDialog') as HTMLDialogElement;
 if(dialog.open)throw Error('Finish the open package dialog first.');
 const saved=all?settings.all:(settings.singles&&Object.hasOwn(settings.singles,key)?settings.singles[key]:undefined),name=document.getElementById('packageName') as HTMLInputElement,version=document.getElementById('packageVersion') as HTMLInputElement;
 name.value=saved?.name||defaultName;version.value=saved?.version||'1.0.0';
 (document.getElementById('packageScope')!).textContent=all?'Combine every open ship into one design pack.':'Export the selected ship as a design pack.';
 dialog.returnValue='';dialog.showModal();name.focus();name.select();
 return new Promise(resolve=>dialog.addEventListener('close',()=>{
  if(dialog.returnValue!=='export'){resolve(false);return;}
  const metadata={name:name.value.trim(),version:version.value.trim()};if(all)settings.all=metadata;else Object.defineProperty(settings.singles??={},key,{value:metadata,enumerable:true,writable:true,configurable:true});document.dispatchEvent(new Event('package-settings-changed'));resolve(metadata);
 },{once:true}));
}
