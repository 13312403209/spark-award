import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Badge3D } from './Badge3D.js';
import { buildBadgeEnvironment } from './BadgeStudio.js';
import { readAppliedBadgeParameters, saveBadgeParameters, defaultBadgeParameters, exportBadgeConfiguration } from './Badge3DSettings.js';

const $=selector=>document.querySelector(selector);
const canvas=$('#lab-scene'),status=$('#lab-status'),loading=$('#loading');
const events=new AbortController(),listen=(target,type,fn)=>target.addEventListener(type,fn,{signal:events.signal});
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.01,100);
const model=new Badge3D(readAppliedBadgeParameters());scene.add(model);
let renderer,composer,controls,environment,observer,axes,box,bloom;
let applied=JSON.stringify(model.getParameters()),pendingGeometry=0,ready=false,disposed=false;
const setStatus=(message,error=false)=>{status.textContent=message;status.dataset.error=String(error);};
function updateDirty() {
  const dirty=JSON.stringify(model.getParameters())!==applied;
  $('#dirty').textContent=dirty?'未应用':'已应用';$('#dirty').dataset.dirty=String(dirty);
}
function syncControls() {
  const parameters=model.getParameters();
  for(const key of ['thickness','bevel','relief']) {$('#'+key).value=parameters[key];showValue(key);}
  const material=model.materials[$('#material-role').value];
  for(const key of ['metalness','roughness']) {$('#'+key).value=material[key];showValue(key);}
  updateDirty();
}
function showValue(key) {$('#'+key+'-value').value=Number($('#'+key).value).toFixed(key==='thickness'?3:2)+(key==='bevel'||key==='relief'?' ×':'');}
function updateBounds() {
  model.updateMatrixWorld(true);box.box.setFromObject(model);
  const size=box.box.getSize(new THREE.Vector3());
  $('#dimensions').textContent=`${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)}`;
}
function setView(view='front') {
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const distance=Math.max(size.y,size.x/Math.max(camera.aspect,.1))/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*1.35;
  const damping=controls.enableDamping;controls.enableDamping=false;controls.update();
  const direction={front:[0,0,1],side:[1,0,0],back:[0,0,-1],perspective:[.7,.3,1]}[view];
  controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance));camera.up.set(0,1,0);camera.lookAt(center);controls.update();controls.enableDamping=damping;
  for(const button of document.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed',String(button.dataset.view===view));
}
function rebuildGeometry() {
  clearTimeout(pendingGeometry);pendingGeometry=0;
  if(!ready)return false;
  try {
    model.setParameters(Object.fromEntries(['thickness','bevel','relief'].map(key=>[key,Number($('#'+key).value)])));
    updateBounds();updateDirty();setStatus('');return true;
  } catch(error) {syncControls();setStatus(error.message,true);return false;}
}
function resize() {
  const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;
  camera.aspect=width/height;camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(width,height,false);
  composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(width,height);
}
async function reload() {
  rebuildGeometry();$('#reload').disabled=true;loading.hidden=false;loading.textContent='正在重新读取 SVG…';
  try {await model.reload();if(disposed)return;ready=true;updateBounds();setView('front');setStatus('SVG 已重新加载，当前参数已保留。');loading.hidden=true;}
  catch(error) {if(disposed)return;setStatus(error.message,true);if(ready)loading.hidden=true;else loading.textContent=error.message;}
  finally {$('#reload').disabled=false;}
}
function render() {controls.update();composer.render();}
function dispose() {
  if(disposed)return;disposed=true;clearTimeout(pendingGeometry);events.abort();observer?.disconnect();
  renderer?.setAnimationLoop(null);controls?.dispose();model.dispose();
  for(const helper of [axes,box]) {helper?.geometry.dispose();helper?.material.dispose();}
  environment?.dispose();bloom?.dispose();composer?.dispose();renderer?.dispose();
}
try {
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.91;
  environment=buildBadgeEnvironment(renderer,scene);
  composer=new EffectComposer(renderer);
  const gl=renderer.getContext(),supported=gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES);
  const samples=Math.max(0,...Array.from(supported||[]).filter(value=>value<=4));composer.renderTarget1.samples=samples;composer.renderTarget2.samples=samples;
  composer.addPass(new RenderPass(scene,camera));bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.10,.25,1.3);composer.addPass(bloom);composer.addPass(new OutputPass());
  controls=new OrbitControls(camera,canvas);controls.enableDamping=!matchMedia('(prefers-reduced-motion: reduce)').matches;controls.dampingFactor=.09;controls.minDistance=.1;controls.maxDistance=60;
  controls.addEventListener('start',()=>{for(const button of document.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed','false');});
  axes=new THREE.AxesHelper(2.25);axes.visible=false;axes.material.depthTest=false;axes.renderOrder=10;scene.add(axes);
  box=new THREE.Box3Helper(new THREE.Box3(),0x8fbcdf);box.visible=false;box.material.depthTest=false;box.renderOrder=10;scene.add(box);
  resize();observer=new ResizeObserver(resize);observer.observe(canvas);renderer.setAnimationLoop(render);
  listen(document,'visibilitychange',()=>renderer.setAnimationLoop(document.hidden?null:render));
  listen(window,'pagehide',event=>{if(!event.persisted)dispose();});
  listen(canvas,'webglcontextlost',event=>{event.preventDefault();renderer.setAnimationLoop(null);setStatus('图形环境中断，请刷新页面恢复。',true);});
  for(const button of document.querySelectorAll('[data-view]'))listen(button,'click',()=>{if(ready)setView(button.dataset.view);});
  listen(canvas,'keydown',event=>{const view={1:'front',2:'side',3:'back',4:'perspective',Home:'front'}[event.key];if(view&&ready){event.preventDefault();setView(view);}});
  for(const key of ['thickness','bevel','relief']) {
    listen($('#'+key),'input',()=>{showValue(key);clearTimeout(pendingGeometry);pendingGeometry=setTimeout(rebuildGeometry,120);});
    listen($('#'+key),'change',rebuildGeometry);
  }
  listen($('#material-role'),'change',syncControls);
  for(const key of ['metalness','roughness'])listen($('#'+key),'input',()=>{
    const role=$('#material-role').value,materials=model.getParameters().materials;
    materials[role]={...materials[role],[key]:Number($('#'+key).value)};model.setParameters({materials});showValue(key);updateDirty();
  });
  listen($('#axes'),'change',()=>{axes.visible=$('#axes').checked;});listen($('#bounds'),'change',()=>{box.visible=$('#bounds').checked;});
  listen($('#reload'),'click',reload);
  listen($('#apply'),'click',()=>{
    if(!ready){setStatus('请先成功加载 SVG。',true);return;}
    if(!rebuildGeometry())return;
    try {saveBadgeParameters(model.getParameters());applied=JSON.stringify(model.getParameters());updateDirty();setStatus('已应用。已保存此 SVG 编辑器的参数。正式解锁页使用 GLB。');}
    catch {setStatus('浏览器无法保存设置。请导出配置，替换项目中的 Badge3DConfig.js。',true);}
  });
  listen($('#export'),'click',()=>{
    if(!ready||!rebuildGeometry())return;
    const url=URL.createObjectURL(new Blob([exportBadgeConfiguration(model.getParameters())],{type:'text/javascript'}));
    const link=document.createElement('a');link.href=url;link.download='Badge3DConfig.js';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('已导出共享配置。替换项目中的同名文件即可长期使用。');
  });
  listen($('#defaults'),'click',()=>{clearTimeout(pendingGeometry);pendingGeometry=0;model.setParameters(defaultBadgeParameters());syncControls();if(ready)updateBounds();setStatus('已恢复项目默认参数，点击“保存 SVG 参数”后生效。');});
  syncControls();await reload();
} catch(error) {dispose();loading.hidden=false;loading.textContent='无法启动 3D 预览：'+error.message;setStatus(error.message,true);for(const button of document.querySelectorAll('.inspector button'))button.disabled=true;}
