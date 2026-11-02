// Existing workflows now reach secondary file actions through their real menu.
async function fileAction(page,id){
 const button=page.locator(id);if(!await button.isVisible()){
  const menu=page.locator(id.startsWith('#export')||id==='#saveAll'?'#moreMenu':'#openMenu');
  if(await menu.count()&&(await menu.getAttribute('open'))===null)await menu.locator('summary').click();
 }
 await button.click();
}
async function revealSettings(page){
 await page.locator('#shipDetails').waitFor({state:'attached'});
 await page.addLocatorHandler(page.locator('#locationDialog'),async()=>page.locator('#locationLater').click());
 for(const id of ['shipDetails','placementControls','layerControls']){
  const details=page.locator('#'+id);if(await details.count()&&(await details.getAttribute('open'))===null)await details.locator('summary').click();
 }
}
module.exports={fileAction,revealSettings};
