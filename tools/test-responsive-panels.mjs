// Requires the Re-shoot example installed in a running ComfyUI and Playwright.
// Optional: COMFY_URL, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, APP_VIEW_NODE2.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless:true, executablePath:process.env.BROWSER_EXECUTABLE,
  args:['--use-angle=swiftshader','--enable-webgl'] });
const page = await browser.newPage({viewport:{width:1600,height:1100}});
const output = path.join(tmpdir(),'comfy-app-responsive');
await mkdir(output,{recursive:true});
const errors=[];
page.on('pageerror',error=>errors.push(error.stack ?? String(error)));
let settings;
async function ready() {
  await page.waitForFunction(()=>document.documentElement.dataset.comfyAppViewExtension==='loaded' && globalThis.LiteGraph?.registered_node_types?.CrossViewWarp);
  await page.waitForFunction(async()=>{const {app}=await import('/scripts/app.js');return app.isGraphReady && !app.configuringGraph;});
  await page.waitForLoadState('networkidle');
}
async function load(workflow) {
  await page.evaluate(async workflow=>{
    const {app}=await import('/scripts/app.js');window.testApp=app;
    await app.loadGraphData(workflow,true,true);
  },workflow);
  await page.waitForFunction(()=>window.testApp.graph.nodes.some(n=>n.__comfyAppView));
  await page.waitForTimeout(200);
  await page.evaluate(()=>{
    const app=window.testApp;
    window.testHost=app.graph.nodes.find(n=>n.__comfyAppView);
    app.canvas.selectNode(window.testHost);
    app.canvas.ds.scale=.65;app.canvas.centerOnNode(window.testHost);
  });
}
async function command(cls) {
  await page.locator(`[data-testid="selection-toolbox"] button:has(.${cls})`).click();
  await page.waitForTimeout(150);
}
async function state() {
  return page.evaluate(()=>{
    const h=window.testHost, root=h.__comfyAppView.shell.root, canvas=window.testApp.canvas;
    const nodeRight=canvas.canvas.getBoundingClientRect().x+canvas.convertOffsetToCanvas([h.pos[0]+h.size[0],h.pos[1]])[0];
    return {x:h.pos[0],width:h.size[0],height:h.size[1],layout:h.properties.app_view_layout,
      section:h.properties.app_view_section,panel:root.dataset.layout,
      rootWidth:root.clientWidth,scrollWidth:root.scrollWidth,
      overflow:Math.max(0,root.getBoundingClientRect().right-nodeRight),
      detailHidden:root.querySelector('.comfy-app-shell__detail').hidden,
      icon:document.querySelector('.comfy-app-view-layout-command')?.dataset.expanded};
  });
}
async function dragWidth(width,node2,corner='SE') {
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const before=await state();
  let start;
  if(node2) {
    const id=await page.evaluate(()=>String(window.testHost.id));
    const handle=page.locator(`.lg-node[data-node-id="${id}"] [data-corner="${corner}"]`);
    await handle.hover();
    const box=await handle.boundingBox();
    assert.ok(box,'Native resize handle must be mounted');
    start={x:box.x+box.width/2,y:box.y+box.height/2};
  } else {
    start=await page.evaluate(()=>{
      const h=window.testHost,c=window.testApp.canvas,b=c.canvas.getBoundingClientRect();
      const point=c.convertOffsetToCanvas([h.pos[0]+h.size[0]-3,h.pos[1]+h.size[1]-3]);
      return {x:b.x+point[0],y:b.y+point[1]};
    });
  }
  const scale=await page.evaluate(()=>window.testApp.canvas.ds.scale);
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  await page.mouse.move(start.x+(width-before.width)*scale*(corner.endsWith('W')?-1:1),start.y,{steps:14});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const during=await state();
  assert.ok(during.overflow<=2,`UI must stay inside the node during the drag: ${JSON.stringify(during)}`);
  await page.mouse.up();await page.waitForTimeout(250);
}
try {
  await page.goto(process.env.COMFY_URL ?? 'http://127.0.0.1:8188');await ready();
  settings=await page.evaluate(async()=>{const {app}=await import('/scripts/app.js');return {
    node2:app.ui.settings.getSettingValue('Comfy.VueNodes.Enabled'),
    toolbox:app.ui.settings.getSettingValue('Comfy.Canvas.SelectionToolbox')};});
  for(const node2 of (process.env.APP_VIEW_NODE2 ? [process.env.APP_VIEW_NODE2==='true'] : [true,false])) {
    await page.evaluate(async value=>{const {app}=await import('/scripts/app.js');
      await app.ui.settings.setSettingValueAsync('Comfy.VueNodes.Enabled',value);
      await app.ui.settings.setSettingValueAsync('Comfy.Canvas.SelectionToolbox',true);
    },node2);
    await page.reload();await ready();
    for(const [example,filename,section] of [
      ['reshoot','reshoot-app-view.json','results'],
    ]) {
      const workflow=JSON.parse(await readFile(new URL(`../examples/${example}/${filename}`,import.meta.url),'utf8'));
      await load(workflow);
      await command('comfy-app-view-mode-command');
      if((await state()).layout!=='expanded') await command('comfy-app-view-layout-command');
      await page.locator(`[data-app-section="${section}"]`).click();
      const wide=await state();assert.equal(wide.panel,'expanded');
      // Canvas zoom must not be interpreted as narrowing the node.
      await page.evaluate(()=>{window.testApp.canvas.ds.scale=.4;window.testApp.canvas.setDirty(true,true);});
      await page.waitForTimeout(100);assert.equal((await state()).layout,'expanded');
      await page.evaluate(()=>{window.testApp.canvas.ds.scale=.65;window.testApp.canvas.centerOnNode(window.testHost);});
      await dragWidth(600,node2);
      const narrow=await state();
      assert.equal(narrow.layout,'expanded',JSON.stringify(narrow));
      assert.equal(narrow.panel,'expanded');assert.equal(narrow.icon,'true');
      assert.ok(!narrow.detailHidden);assert.equal(narrow.section,section);
      assert.ok(narrow.width>600 && narrow.width<wide.width,JSON.stringify(narrow));
      assert.ok(narrow.scrollWidth<=narrow.rootWidth+1,JSON.stringify(narrow));
      if (!process.env.APP_VIEW_SKIP_SCREENSHOTS) {
        await page.screenshot({path:path.join(output,`${example}-${node2?'node2':'legacy'}.png`)});
      }
      const saved=await page.evaluate(()=>window.testApp.graph.serialize());
      await load(saved);
      assert.equal((await state()).layout,'expanded');assert.equal((await state()).section,section);
      assert.ok(Math.abs((await state()).width-narrow.width)<2);
      await dragWidth(950,node2);
      assert.equal((await state()).layout,'expanded');
      assert.ok(Math.abs((await state()).width-950)<12);
      for(const corner of node2 ? ['SW','NW','NE'] : ['SE']) {
        const before=await state();
        await dragWidth(250,node2,corner);
        const constrained=await state();
        assert.equal(constrained.layout,'expanded');assert.ok(!constrained.detailHidden);
        assert.ok(Math.abs(constrained.width-narrow.width)<2);
        if(corner.endsWith('W')) assert.ok(Math.abs(constrained.x+constrained.width-before.x-before.width)<2,'The opposite edge must stay fixed');
        else assert.ok(Math.abs(constrained.x-before.x)<2);
      }
      // Only the explicit toolbar button changes to a compact layout.
      await command('comfy-app-view-layout-command');
      await dragWidth(250,node2);
      const compact=await state();assert.equal(compact.layout,'compact');
      assert.equal(compact.icon,'false');assert.ok(compact.detailHidden);
      assert.ok(compact.width<narrow.width && compact.scrollWidth<=compact.rootWidth+1);
      await command('comfy-app-view-layout-command');
      const reopened=await state();assert.equal(reopened.layout,'expanded');
      assert.equal(reopened.section,section);assert.equal(reopened.icon,'true');
      assert.ok(!reopened.detailHidden && reopened.scrollWidth<=reopened.rootWidth+1);
      await command('comfy-app-view-mode-command');
      await command('comfy-app-view-mode-command');
      assert.equal((await state()).layout,'expanded');
      const savedHost=saved.nodes.find(n=>n.properties?.app_view_renderer);
      savedHost.size[0]=250;
      await load(saved);
      assert.equal((await state()).layout,'expanded','Loading an old narrow node must preserve its layout');
      assert.ok((await state()).width>=narrow.width-2);
      console.log(JSON.stringify({node2,example,narrow,reopened,compact,saveReload:true}));
    }
  }
  const failures=errors.filter(error=>!error.includes('getCanvas: canvas is null') && !error.includes('Failed to fetch dynamically imported'));
  assert.deepEqual(failures,[]);
  console.log(`Native pointer resize passed. Screenshots: ${output}`);
} catch(error) {
  if (!process.env.APP_VIEW_SKIP_SCREENSHOTS) {
    await page.screenshot({path:path.join(output,'failure.png')});
  }
  console.error('State at failure:',await state().catch(()=>null));
  throw error;
} finally {
  if(settings) await page.evaluate(async settings=>{const {app}=await import('/scripts/app.js');
    await app.ui.settings.setSettingValueAsync('Comfy.VueNodes.Enabled',settings.node2);
    await app.ui.settings.setSettingValueAsync('Comfy.Canvas.SelectionToolbox',settings.toolbox);
  },settings).catch(()=>{});
  await browser.close();
}
