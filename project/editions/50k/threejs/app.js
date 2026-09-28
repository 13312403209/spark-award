import * as THREE from 'three';
import { BadgeUnlockSequence, UnlockState, BADGE_UNLOCK_CONFIG } from './BadgeUnlockSequence.js';
import { mountUnlockDebug } from './BadgeUnlockDebug.js';
import { BadgeGLB } from './BadgeGLB.js';
import { readBadgeThemes, BADGE_THEME_NAMES } from './BadgeThemes.js';
import { buildGLBEnvironment, configureBadgeColorManagement } from './BadgeGLBEnvironment.js';
import { buildBadgeEnvironment } from './BadgeStudio.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector('#scene'));
const rotateButton = /** @type {HTMLButtonElement} */ (document.querySelector('#rotate'));
const resetButton = /** @type {HTMLButtonElement} */ (document.querySelector('#reset'));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { dragging: false, auto: false, yaw: -0.16, pitch: 0.055, targetYaw: -0.16, targetPitch: 0.055, lastX: 0, lastY: 0, velocity: 0, pointer: null };
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
const badge = new BadgeGLB(readBadgeThemes());
BADGE_UNLOCK_CONFIG.theme=badge.settings.theme;
badge.scale.setScalar(0.5);
scene.add(badge);
let renderer, composer, bloom, background, environmentTarget, modelEnvironment, unlockSequence;
const atmosphere = [];
const lifecycle = new AbortController();
let resizeObserver;
const interactionAllowed = () => !unlockSequence || unlockSequence.disposed || unlockSequence.ui.dataset.unlockReady === 'true';

function buildAtmosphere() {
  background = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uAspect: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.9999,1.0);}`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform float uAspect;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
      float beam(vec2 uv,float origin,float angle,float width){float dy=1.18-uv.y;float x=(uv.x-origin)*uAspect-angle*dy;return exp(-pow(x/(width+dy*0.095),2.0))*exp(-dy*2.7);}
      void main(){
        vec2 uv=vUv; float t=uTime;
        vec2 p=(uv-vec2(.5,.8))*vec2(uAspect,1.0);
        vec3 col=vec3(.0006);
        col+=vec3(.007)*exp(-dot(p,p)*2.7);
        float mist=noise(uv*vec2(5.,7.)+vec2(t*.015,-t*.012));
        float rays=beam(uv,.20,.22,.035)*.63+beam(uv,.47,-.14,.045)*.72+beam(uv,.83,-.33,.03)*.65;
        col+=vec3(.040)*rays*(.76+.24*mist);
        vec2 halo=(uv-vec2(.5,.50))*vec2(uAspect,1.0);
        col+=vec3(.004)*exp(-dot(halo,halo)*13.0);
        float vignette=smoothstep(.88,.15,length((uv-.5)*vec2(.92,.74)));
        col*=.55+.45*vignette;
        col=max(vec3(0.),col+(hash(gl_FragCoord.xy)-.5)*.0006);
        gl_FragColor=vec4(col,1.0);
      }`
  });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), background);
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -100;
  scene.add(backdrop);atmosphere.push(backdrop);
  // Fine neutral specks give the white shafts depth.
  const positions = [], phases = [], sizes = [];
  let seed = 29;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i=0;i<78;i++) {
    positions.push((random()-.5)*11,(random()-.5)*8,-2-random()*6);
    phases.push(random()*6.28); sizes.push(1.0+random()*1.8);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('phase',new THREE.Float32BufferAttribute(phases,1));
  geometry.setAttribute('size',new THREE.Float32BufferAttribute(sizes,1));
  const dust = new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uTime:background.uniforms.uTime},
    vertexShader:`attribute float phase;attribute float size;uniform float uTime;varying float vAlpha;void main(){vec3 p=position;p.x+=sin(uTime*.13+phase)*.09;p.y+=sin(uTime*.08+phase*2.)*.13;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=size*14./-mv.z;vAlpha=.15+.22*(.5+.5*sin(phase+uTime*.4));}`,
    fragmentShader:`varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);float a=exp(-d*d*22.)*vAlpha;gl_FragColor=vec4(.75,.75,.75,a);}`
  });
  const specks=new THREE.Points(geometry,dust);scene.add(specks);atmosphere.push(specks);
}

function setAuto(value) {
  state.auto=value; rotateButton.setAttribute('aria-pressed',String(value));
  rotateButton.setAttribute('aria-label',value?'暂停自动旋转':'开始自动旋转');
}
function reset() { setAuto(false);state.yaw=Math.atan2(Math.sin(state.yaw),Math.cos(state.yaw));state.targetYaw=0;state.targetPitch=0;state.velocity=0; }
rotateButton.addEventListener('click',()=>{if(interactionAllowed())setAuto(!state.auto);});
resetButton.addEventListener('click',reset);
canvas.addEventListener('pointerdown',event=>{
  if(!interactionAllowed()||state.pointer!==null||event.button!==0) return;
  state.pointer=event.pointerId;state.dragging=true;state.lastX=event.clientX;state.lastY=event.clientY;state.velocity=0;
  setAuto(false);canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});
});
canvas.addEventListener('pointermove',event=>{
  if(!state.dragging||event.pointerId!==state.pointer) return;
  const dx=event.clientX-state.lastX,dy=event.clientY-state.lastY;
  state.targetYaw+=dx*.009;state.targetPitch=THREE.MathUtils.clamp(state.targetPitch+dy*.007,-1.4,1.4);
  state.velocity=THREE.MathUtils.clamp(dx*.004,-.055,.055);state.lastX=event.clientX;state.lastY=event.clientY;
});
function release(event){if(event.pointerId!==state.pointer)return;state.dragging=false;state.pointer=null;}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
canvas.addEventListener('keydown',event=>{
  if(!interactionAllowed()) return;
  const moves={ArrowLeft:[-.15,0],ArrowRight:[.15,0],ArrowUp:[0,-.12],ArrowDown:[0,.12]};
  if(moves[event.key]) {event.preventDefault();setAuto(false);state.velocity=0;state.targetYaw+=moves[event.key][0];state.targetPitch=THREE.MathUtils.clamp(state.targetPitch+moves[event.key][1],-1.4,1.4);}
  if(event.key==='Home'||event.key==='Escape'){event.preventDefault();reset();}
});

function resize() {
  if(!renderer) return;
  const width=canvas.clientWidth,height=canvas.clientHeight;
  if(!width||!height) return;
  camera.aspect=width/height;
  // Keep the original 34 degree lens; the sequence computes its own screen anchor.
  camera.fov=34;
  const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  camera.position.set(0,.06,Math.max(3.4/(2*tangent*.68),3.04/(2*tangent*camera.aspect*.84)));
  camera.lookAt(0,.06,0);camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio,Math.min(width,height)<BADGE_UNLOCK_CONFIG.particles.mobileBreakpoint?BADGE_UNLOCK_CONFIG.performance.mobileDpr:BADGE_UNLOCK_CONFIG.performance.desktopDpr));
  renderer.setSize(width,height,false);composer?.setPixelRatio(renderer.getPixelRatio());composer?.setSize(width,height);
  if(background)background.uniforms.uAspect.value=camera.aspect;
  if(unlockSequence&&!unlockSequence.disposed)unlockSequence.resize();
}

let previous=0,elapsed=0,lastRender=0;
function renderScene(){if(composer)composer.render();else renderer.render(scene,camera);}
function animate(now) {
  if(document.hidden||canvas.hidden) return;
  const realDt=previous?Math.max(0,(now-previous)/1000):0;previous=now;
  const dt=Math.min(realDt,.05);elapsed+=dt;
  unlockSequence?.update(realDt);
  if(interactionAllowed()) {
    if(state.auto) state.targetYaw+=dt*.34;
    else if(!state.dragging) {state.targetYaw+=state.velocity*dt*60;state.velocity*=Math.exp(-dt*7.5);}
    const damping=reducedMotion?1:1-Math.exp(-dt*15);
    state.yaw=THREE.MathUtils.lerp(state.yaw,state.targetYaw,damping);
    state.pitch=THREE.MathUtils.lerp(state.pitch,state.targetPitch,damping);
    badge.rotation.set(state.pitch,state.yaw,0,'YXZ');
  }
  background.uniforms.uTime.value=reducedMotion?0:elapsed;
  const playing=unlockSequence?.state===UnlockState.PLAYING;
  const fps=unlockSequence?.state===UnlockState.IDLE?BADGE_UNLOCK_CONFIG.performance.idleFps:BADGE_UNLOCK_CONFIG.performance.revealedFps;
  if(playing||state.dragging||state.auto||now-lastRender>=1000/fps) {renderScene();lastRender=now;}
}

async function createSequence(play=false) {
  unlockSequence?.dispose();
  canvas.style.visibility='hidden';
  /** @type {HTMLElement} */ (document.querySelector('.award-screen')).classList.add('unlock-active');
  resize();
  unlockSequence=new BadgeUnlockSequence({scene,camera,renderer,composer,bloom,badge,atmosphere,
    onUnlock(){setAuto(false);state.dragging=false;state.pointer=null;state.yaw=0;state.pitch=0;state.targetYaw=0;state.targetPitch=0;state.velocity=0;badge.rotation.set(0,0,0);window.dispatchEvent(new CustomEvent('badgeawarded'));},
    onReady(){canvas.tabIndex=0;setAuto(!unlockSequence.reduced);}, onRestore:resize});
  canvas.tabIndex=-1;
  document.querySelector('#preload-hint')?.remove();
  const prepared=await unlockSequence.prepare();
  canvas.style.visibility='';
  if(prepared&&play)unlockSequence.play();
  return prepared;
}

function showFallback(error) {
  if(error)console.error('Badge renderer could not start',error);
  unlockSequence?.dispose();
  renderer?.setAnimationLoop(null);
  document.querySelector('#preload-hint')?.remove();
  /** @type {HTMLElement} */ (document.querySelector('.award-screen')).classList.remove('unlock-active');
  /** @type {HTMLElement} */ (document.querySelector('.award-screen')).dataset.unlockState='REVEALED';
  /** @type {HTMLElement} */ (document.querySelector('#fallback')).hidden=false;
  /** @type {HTMLElement} */ (document.querySelector('.controls')).hidden=true;
  /** @type {HTMLElement} */ (document.querySelector('.award-copy')).inert=false;
  /** @type {HTMLElement} */ (document.querySelector('.award-actions')).inert=false;
  /** @type {HTMLButtonElement} */ (document.querySelector('#share-award')).disabled=false;
  /** @type {HTMLButtonElement} */ (document.querySelector('#confirm-award')).disabled=false;
  canvas.hidden=true;
  window.badgePresentation={reset,snapshot:()=>null};
}

try {
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  configureBadgeColorManagement(renderer);
  environmentTarget=buildBadgeEnvironment(renderer,scene);buildAtmosphere();
  composer=new EffectComposer(renderer);
  const gl=renderer.getContext();
  const supportedSamples=gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES);
  const samples=Math.max(0,...Array.from(supportedSamples||[]).filter(value=>value<=4));
  composer.renderTarget1.samples=samples;composer.renderTarget2.samples=samples;
  composer.addPass(new RenderPass(scene,camera));
  bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.10,.25,1.3);composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const [,hdri]=await Promise.all([badge.load(),buildGLBEnvironment(renderer,badge.settings.hdri)]);
  modelEnvironment=hdri;badge.setEnvironment(hdri.texture);resize();
  await createSequence();
  renderer.setAnimationLoop(animate);
  window.badgePresentation = {
    reset,
    setTheme(theme) {
      const name=badge.setTheme(theme);BADGE_UNLOCK_CONFIG.theme=name;
      window.dispatchEvent(new CustomEvent('badgethemechange',{detail:{theme:name}}));
      return name;
    },
    getTheme(){return badge.settings.theme;},
    close(){unlockSequence?.close();},
    snapshot() {
      renderScene();
      const copy=document.createElement('canvas');
      // Full viewport during unlock; sharing retains the original badge-stage crop.
      copy.width=canvas.width;copy.height=Math.round(canvas.height*(unlockSequence&&!unlockSequence.disposed? .52:1));
      copy.getContext('2d').drawImage(canvas,0,0,canvas.width,copy.height,0,0,copy.width,copy.height);
      return copy;
    }
  };
  window.playBadgeUnlock=async()=>{
    if(unlockSequence?.state===UnlockState.PLAYING&&!unlockSequence.debugPaused)return false;
    if(unlockSequence?.disposed)return createSequence(true);
    unlockSequence.reset();return unlockSequence.play();
  };
  window.badgeUnlockDebug={
    get sequence(){return unlockSequence;},config:BADGE_UNLOCK_CONFIG,
    inspect:()=>unlockSequence.inspect(),
    seek:seconds=>unlockSequence.seek(seconds),
    reset:()=>unlockSequence.disposed?createSequence():unlockSequence.reset(),
    close:()=>unlockSequence.close(),
    memory:()=>({...renderer.info.memory}),
    fallback:()=>showFallback(),
  };
  mountUnlockDebug(window.badgeUnlockDebug);
  window.addEventListener('badgethemechange',event=>{
    const theme=event.detail?.theme??event.detail;
    const name=typeof theme==='string'?theme:theme?.name;
    if(typeof name==='string'&&BADGE_THEME_NAMES.includes(name.toLowerCase())) {
      badge.setTheme(name);BADGE_UNLOCK_CONFIG.theme=badge.settings.theme;
    }
  },{signal:lifecycle.signal});
  window.addEventListener('resize',resize,{signal:lifecycle.signal});
  resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);
  document.addEventListener('visibilitychange',()=>{
    previous=0;renderer.setAnimationLoop(document.hidden||canvas.hidden?null:animate);
  },{signal:lifecycle.signal});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();showFallback();},{signal:lifecycle.signal});
  canvas.addEventListener('webglcontextrestored',()=>location.reload(),{signal:lifecycle.signal});
  window.addEventListener('pagehide',event=>{if(!event.persisted){unlockSequence?.dispose();resizeObserver.disconnect();lifecycle.abort();renderer.setAnimationLoop(null);badge.dispose();modelEnvironment?.dispose();environmentTarget?.dispose();}},{signal:lifecycle.signal});
} catch(error) {showFallback(error);}
