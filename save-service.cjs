const fs=require('node:fs/promises'),path=require('node:path');

// Stage on the destination filesystem. A failed write/readback/rename never
// opens the previous destination for writing. This is not a power-loss guarantee.
async function saveFile(destination,text){
 const stage=await fs.mkdtemp(path.join(path.dirname(destination),'.shipwright-save-'));
 const temporary=path.join(stage,'document');
 try{
  const bytes=Buffer.from(text,'utf8');
  await fs.writeFile(temporary,bytes,{flag:'wx'});
  if(!(await fs.readFile(temporary)).equals(bytes))throw Error('Save readback mismatch.');
  await fs.rename(temporary,destination);
 }catch(error){
  try{await fs.rm(stage,{recursive:true,force:true});}
  catch(cleanupError){throw new AggregateError([error,cleanupError],`Save failed; temporary data could not be removed: ${stage}`,{cause:error});}
  throw error;
 }
 // Publication already succeeded: report cleanup trouble without claiming the
 // document was not saved, which would leave the renderer's saved state wrong.
 try{await fs.rm(stage,{recursive:true,force:true});}
 catch(error){console.warn(`Project saved, but temporary folder cleanup failed: ${stage}`,error);}
 return true;
}
module.exports={saveFile};
