import * as THREE from 'three';
import { BADGE_UNLOCK_CONFIG, screenLayout } from './BadgeUnlockConfig.js';
import { createUnlockEffects } from './BadgeUnlockEffects.js';
import { BadgeOpeningVideo } from './BadgeOpeningVideo.js';
import { BadgeBackdropEffects } from './BadgeBackdropEffects.js';

export { BADGE_UNLOCK_CONFIG };
export const UnlockState = Object.freeze({ IDLE:'IDLE', PLAYING:'PLAYING', REVEALED:'REVEALED', CLOSED:'CLOSED' });

/** Owns transient objects only. The host owns the renderer, model and render loop. */
export class BadgeUnlockSequence {
  constructor({ scene, camera, renderer, composer, bloom, badge, atmosphere, onUnlock, onReady, onRestore, config = BADGE_UNLOCK_CONFIG }) {
    this.scene=scene;this.camera=camera;this.renderer=renderer;this.composer=composer;this.bloom=bloom;this.badge=badge;this.atmosphere=atmosphere;this.onUnlock=onUnlock;this.onReady=onReady;this.onRestore=onRestore;this.config=config;
    this.gsap=window.gsap;
    if(!this.gsap) throw new Error('Local GSAP unavailable');
    /** @type {'IDLE'|'PLAYING'|'REVEALED'|'CLOSED'} */
    this.state=UnlockState.IDLE;this.loaded=false;this.disposed=false;this.time=0;this.breathTime=0;this.ambientTime=0;this.hover=0;
    this.motion=matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced=this.motion.matches;
    this.original={ parent:badge.parent, position:badge.position.clone(), quaternion:badge.quaternion.clone(), scale:badge.scale.clone(), visible:badge.visible,
      fov:camera.fov, cameraPosition:camera.position.clone(), cameraQuaternion:camera.quaternion.clone(), exposure:renderer.toneMappingExposure,
      bloom:bloom?{strength:bloom.strength,radius:bloom.radius,threshold:bloom.threshold}:null,
      atmosphere:atmosphere.map(object=>({object,visible:object.visible})) };
    this.wrapper=new THREE.Group();this.wrapper.name='Badge unlock wrapper';scene.add(this.wrapper);
    // Recenter using another outer group, leaving the original model transform intact.
    const bounds=new THREE.Box3().setFromObject(badge);
    this.modelHeight=bounds.max.y-bounds.min.y;
    this.modelCenter=bounds.getCenter(new THREE.Vector3());
    this.pivot=new THREE.Group();this.pivot.position.copy(this.modelCenter).negate();this.wrapper.add(this.pivot);this.pivot.add(badge);
    this.sheenMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color(2,2,2),transparent:true,opacity:0,depthTest:false,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
    if(badge.createRevealSheen) this.sheen=badge.createRevealSheen(this.sheenMaterial);
    else {
      const body=badge.getObjectByName('Thin solid metal substrate');
      this.sheen=new THREE.Mesh(body.geometry,this.sheenMaterial);
      this.sheen.position.copy(body.position).multiply(badge.scale).add(badge.position);this.sheen.scale.copy(badge.scale);this.sheen.renderOrder=30;
    }
    this.pivot.add(this.sheen);
    this.wrapper.visible=false;
    this.effects=createUnlockEffects(scene,config);
    this.backdrop=new BadgeBackdropEffects(scene,{radius:bounds.getBoundingSphere(new THREE.Sphere()).radius,theme:config.theme});
    this.backdropTheme=config.theme;
    this.anchor=new THREE.Vector3();this.pixelWorld=1;
    this.ui=/** @type {HTMLElement} */ (document.querySelector('.award-screen'));
    this.copy=/** @type {HTMLElement} */ (document.querySelector('.award-copy'));this.actions=/** @type {HTMLElement} */ (document.querySelector('.award-actions'));this.controls=/** @type {HTMLElement} */ (document.querySelector('.controls'));
    this.confirm=/** @type {HTMLButtonElement} */ (document.querySelector('#confirm-award'));this.share=/** @type {HTMLButtonElement} */ (document.querySelector('#share-award'));this.status=/** @type {HTMLElement} */ (document.querySelector('#action-status'));
    this.items=[document.querySelector('#award-title'),document.querySelector('.award-message'),document.querySelector('.award-date'),this.share,this.confirm];
    this.abort=new AbortController();
    this.createDOM();this.bind();this.reset();
  }

  createDOM() {
    this.ui.classList.add('unlock-active');
    this.panel=document.createElement('div');this.panel.className='unlock-panel';this.panel.setAttribute('aria-hidden','true');this.ui.prepend(this.panel);
    this.trigger=document.createElement('button');this.trigger.type='button';this.trigger.id='unlock-crystal';this.trigger.className='unlock-trigger';
    this.trigger.setAttribute('aria-label','开启星火奖');this.trigger.setAttribute('aria-describedby','unlock-hint');this.trigger.disabled=true;
    this.trigger.innerHTML='<span class="unlock-click-icon"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 12V5.5a1.5 1.5 0 0 1 3 0V11l1-1a1.5 1.5 0 0 1 2.3.2 1.5 1.5 0 0 1 2.5 1 1.5 1.5 0 0 1 2.2 1.3V16a5 5 0 0 1-5 5h-1.7a5 5 0 0 1-3.9-1.9L5.2 14a1.5 1.5 0 0 1 2.2-2L9 13.5M5.5 5.5 4 4M9 1V.5M14.5 4 16 2.5"/></svg></span>';
    this.opening=new BadgeOpeningVideo(this.config.opening.videoSrc,this.config.opening.preloadTimeoutMs);
    this.opening.element.style.setProperty('--opening-crop-scale',String(this.config.opening.cropScale));
    this.hint=document.createElement('p');this.hint.id='unlock-hint';this.hint.className='sr-only';this.hint.setAttribute('role','status');this.hint.textContent='正在准备你的星火奖…';
    this.flash=document.createElement('div');this.flash.className='unlock-flash';this.flash.setAttribute('aria-hidden','true');this.flash.hidden=true;
    this.ui.append(this.opening.element,this.trigger,this.hint,this.flash);
  }

  bind() {
    const options={signal:this.abort.signal};
    window.addEventListener('badgethemechange',event=>this.backdrop.setTheme(event.detail?.theme??event.detail),options);
    this.trigger.addEventListener('click',()=>this.play(),options);
    // A native button supports both Enter and Space, including key repeat locking.
    this.trigger.addEventListener('pointerenter',()=>{this.hover=1;},options);
    this.trigger.addEventListener('pointerleave',()=>{this.hover=0;},options);
    this.trigger.addEventListener('focus',()=>{this.hover=1;},options);
    this.trigger.addEventListener('blur',()=>{this.hover=0;},options);
    this.motion.addEventListener('change',()=>{
      this.reduced=this.motion.matches;this.opening.sync(this.state===UnlockState.IDLE,this.reduced);
      if(this.reduced && this.state===UnlockState.PLAYING) {
        this.timeline?.kill();this.flash.hidden=true;this.effects.root.visible=false;
        this.props.badgeScale=1;this.props.lift=1;this.props.badgeOn=1;this.props.yaw=0;this.props.roll=0;this.props.sheen=0;this.props.fov=0;this.props.push=0;
        this.showUI();this.finish();
      }
    },options);
    document.addEventListener('visibilitychange',()=>{this.paused=document.hidden;this.opening.sync(this.state===UnlockState.IDLE,this.reduced);},options);
  }

  async prepare() {
    // The caller has already loaded the badge and the shared PMREM environment.
    this.effects.root.visible=true;this.wrapper.visible=true;this.backdrop.prewarm();
    this.effects.crystal.visible=true;this.effects.point.visible=true;this.effects.star.visible=true;this.effects.warp.visible=true;
    this.original.atmosphere.forEach(({object,visible})=>{object.visible=visible;});
    await Promise.all([this.renderer.compileAsync(this.scene,this.camera),this.opening.ready]);
    if(this.disposed) return false;
    // Also compile transmission and every post-processing pass before interaction.
    this.render();
    // Prewarm the final badge's zero-point-light shader variant as well.
    this.effects.crystal.visible=false;
    await this.renderer.compileAsync(this.scene,this.camera);
    if(this.disposed) return false;
    this.render();this.reset();this.loaded=true;this.trigger.disabled=false;this.trigger.inert=false;
    this.render();
    this.trigger.setAttribute('aria-busy','false');this.hint.textContent='轻触按钮，开启星火奖';
    return true;
  }

  reset() {
    if(this.disposed) return false;
    this.timeline?.kill();this.breath?.kill();
    this.restoreRendering();this.state=UnlockState.IDLE;this.ui.dataset.unlockState=this.state;this.ui.dataset.unlockReady='false';
    this.time=0;this.breathTime=0;this.ambientTime=0;this.hover=0;this.debugPaused=false;this.backdrop.reset();
    this.opening.reset(this.reduced);this.gsap.set(this.opening.surface,{autoAlpha:1,scale:1});
    this.props={clusterScale:1,spread:1,energy:.15,crystalAlpha:1,point:0,warp:0,progress:0,speed:0,star:0,starGrowth:0,bloom:this.config.bloom.idle,badgeOn:0,sheen:0,badgeScale:this.config.badge.birthScale,yaw:THREE.MathUtils.degToRad(this.config.badge.rotationY),roll:THREE.MathUtils.degToRad(this.config.badge.rotationZ),lift:0,fov:0,push:0};
    this.breathValue={value:0};
    this.breath=this.gsap.to(this.breathValue,{value:1,duration:this.config.crystal.breathPeriod/2,ease:'sine.inOut',repeat:-1,yoyo:true,paused:true});
    this.original.atmosphere.forEach(({object})=>{object.visible=false;});
    this.effects.root.visible=true;this.wrapper.visible=false;
    this.flash.hidden=true;this.flash.style.opacity='0';this.trigger.hidden=false;this.hint.hidden=false;this.trigger.disabled=!this.loaded;this.trigger.inert=false;
    this.copy.inert=true;this.actions.inert=true;this.controls.inert=true;this.share.disabled=true;this.confirm.disabled=true;
    this.confirm.classList.remove('is-confirmed');this.confirm.querySelector('span').textContent='确认';this.confirm.querySelector('svg').setAttribute('hidden','');this.confirm.removeAttribute('aria-label');
    this.status.textContent='';
    this.gsap.set([this.copy,this.actions],{autoAlpha:1});
    this.gsap.set([this.panel,this.controls,...this.items],{autoAlpha:0,y:0,scale:1});
    this.gsap.set([this.trigger,this.hint],{autoAlpha:1});
    this.resize();this.gsap.ticker.sleep();return true;
  }

  play() {
    if(!this.loaded||this.disposed||this.state!==UnlockState.IDLE) return false;
    this.state=UnlockState.PLAYING;this.ui.dataset.unlockState=this.state;this.trigger.disabled=true;this.trigger.inert=true;
    this.breath.pause();this.opening.pause();this.time=0;this.debugPaused=false;this.onUnlock?.();
    window.dispatchEvent(new CustomEvent('badgeunlockstart'));
    this.timeline=this.reduced?this.reducedTimeline():this.fullTimeline();
    this.gsap.ticker.sleep();return true;
  }

  fullTimeline() {
    const c=this.config,d=c.duration,p=this.props;
    const tl=this.gsap.timeline({paused:true,defaults:{ease:'power2.out'},onComplete:()=>this.finish()});
    Object.entries(c.labels).forEach(([name,time])=>tl.addLabel(name,time));
    tl.to([this.trigger,this.hint],{autoAlpha:0,duration:d.hideTrigger},'collapse')
      .to(p,{clusterScale:1.045,duration:d.charge,ease:'power2.out'},'collapse')
      .to(p,{clusterScale:.001,spread:0,energy:3,bloom:c.bloom.collapse,duration:d.collapse,ease:'power3.in'},`collapse+=${d.charge}`)
      .to(p,{crystalAlpha:0,duration:d.crystalFade},'point')
      .to(p,{point:1,duration:d.pointIn},'point')
      .to(p,{warp:1,duration:d.warpIn},'warp')
      .to(p,{progress:1,duration:d.warpTravel,ease:'power1.out'},'warp')
      .to(p,{speed:c.particles.speedEnd,bloom:c.bloom.warp,duration:d.warpTravel,ease:'power2.in'},'warp')
      .to(p,{fov:c.camera.fovBoost,push:c.camera.push,duration:d.warpTravel,ease:'power2.in'},'warp')
      .to(p,{star:1,duration:d.starIn},'star')
      .to(p,{starGrowth:1,bloom:c.bloom.star,duration:d.starGrow,ease:'power3.in'},'star')
      .to(p,{warp:0,point:0,duration:d.warpOut},`star+=${c.offsets.warpOutAfterStar}`)
      .set(this.flash,{display:'block',autoAlpha:0},'flash')
      .call(()=>{this.flash.hidden=false;},null,'flash')
      .to(this.flash,{autoAlpha:1,duration:d.flashIn,ease:'power2.in'},'flash')
      .to(this.flash,{autoAlpha:0,duration:d.flashOut,ease:'power2.out'},`flash+=${d.flashIn+d.flashHold}`)
      .call(()=>{this.flash.hidden=true;},null,`flash+=${d.flashIn+d.flashHold+d.flashOut}`)
      .set(p,{star:0,point:0,warp:0,badgeOn:1,sheen:1,fov:0,push:0},'reveal')
      .to(p,{sheen:0,duration:d.sheen},'reveal')
      .to(p,{badgeScale:c.badge.peakScale,yaw:0,roll:.01,bloom:c.bloom.reveal,duration:d.reveal,ease:'back.out(1.4)'},'reveal')
      .to(p,{badgeScale:1,roll:0,duration:d.settle,ease:'sine.out'},'settle')
      .to(p,{bloom:this.original.bloom?.strength??0,duration:d.restoreBloom},'settle')
      .to(p,{lift:1,duration:d.lift,ease:'power3.out'},'lift')
      .to(this.panel,{autoAlpha:1,duration:d.panel},'ui')
      .fromTo(this.items[0],{autoAlpha:0,y:20},{autoAlpha:1,y:0,duration:d.title},`ui+=${c.offsets.title}`)
      .fromTo(this.items.slice(1,3),{autoAlpha:0,y:14},{autoAlpha:1,y:0,duration:d.text,stagger:d.stagger},`ui+=${c.offsets.details}`)
      .fromTo(this.items.slice(3),{autoAlpha:0,y:10,scale:.96},{autoAlpha:1,y:0,scale:1,duration:d.buttons,stagger:d.stagger,ease:'back.out(1.3)'},`ui+=${c.offsets.buttons}`)
      .to(this.controls,{autoAlpha:1,duration:c.labels.end-c.labels.ready},'ready')
      .call(()=>this.ready(),null,'ready')
      .to({hold:0},{hold:1,duration:c.labels.end-c.labels.ready},'ready');
    tl.to(this.opening.surface,{scale:1.045,duration:d.charge,ease:'power2.out'},'collapse')
      .to(this.opening.surface,{scale:.001,duration:d.collapse,ease:'power3.in'},`collapse+=${d.charge}`)
      .to(this.opening.surface,{autoAlpha:0,duration:d.crystalFade},'point')
      .call(()=>this.opening.hide(),null,`point+=${d.crystalFade}`);
    return tl;
  }

  reducedTimeline() {
    const c=this.config.reduced,p=this.props;
    const tl=this.gsap.timeline({paused:true,defaults:{ease:'sine.out'},onComplete:()=>this.finish()});
    Object.entries(this.config.labels).forEach(([name,time])=>tl.addLabel(name,time));
    // The reduced-motion branch has the same vocabulary, with a compact endpoint.
    tl.addLabel('ready',c.ready).addLabel('end',c.end);
    tl.to([this.trigger,this.hint],{autoAlpha:0,duration:c.fade},0)
      .to(p,{crystalAlpha:0,duration:c.fade},0)
      .to(this.opening.surface,{autoAlpha:0,duration:c.fade},0)
      .call(()=>this.opening.hide(),null,c.fade)
      .set(p,{badgeOn:1,badgeScale:.9,yaw:0,roll:0},c.revealAt)
      .to(p,{badgeScale:1,lift:1,duration:c.reveal},c.revealAt)
      .to([this.panel,this.controls,...this.items],{autoAlpha:1,duration:c.uiFade},c.ui)
      .call(()=>this.ready(),null,'ready')
      .to({hold:0},{hold:1,duration:c.end-c.ready},'ready');
    return tl;
  }

  ready() {
    if(this.disposed) return;
    this.ui.dataset.unlockReady='true';this.copy.inert=false;this.actions.inert=false;this.controls.inert=false;this.share.disabled=false;this.confirm.disabled=false;
    this.opening.hide();this.trigger.hidden=true;this.hint.hidden=true;this.trigger.inert=false;
    this.confirm.focus({preventScroll:true});this.onReady?.();
  }
  showUI() {this.gsap.set([this.panel,this.controls,...this.items],{autoAlpha:1,y:0,scale:1});this.ready();this.gsap.ticker.sleep();}
  finish() {
    if(this.disposed||this.state===UnlockState.REVEALED) return;
    this.state=UnlockState.REVEALED;this.ui.dataset.unlockState=this.state;this.flash.hidden=true;
    this.effects.root.visible=false;this.restoreRendering();if(this.ui.dataset.unlockReady!=='true')this.ready();this.updatePose();
    window.dispatchEvent(new CustomEvent('badgeunlockcomplete'));
  }

  resize() {
    if(this.disposed) return;
    this.width=this.renderer.domElement.clientWidth;this.height=this.renderer.domElement.clientHeight;
    this.layout=screenLayout(this.width,this.height,this.config);
    // Host resize has positioned the camera on the unchanged original optical axis.
    this.original.cameraPosition.copy(this.camera.position);this.original.cameraQuaternion.copy(this.camera.quaternion);
    this.anchor.set(0,0,-this.camera.position.z).applyQuaternion(this.camera.quaternion).add(this.camera.position);
    this.pixelWorld=2*this.camera.position.z*Math.tan(THREE.MathUtils.degToRad(this.original.fov/2))/this.height;
    this.effects.resize(this.width,this.height,this.layout.particleCount);
    this.backdrop.resize(this.width,this.height,this.renderer.getPixelRatio(),this.layout.mobile);
    this.crystalBase=this.layout.crystalPx*this.pixelWorld/2.48;
    this.finalScale=this.layout.badgePx*this.pixelWorld/this.modelHeight;
    this.revealScale=Math.min(this.config.badge.revealPx,this.height*.32,this.width*.55)*this.pixelWorld/this.modelHeight;
    this.effects.crystal.position.copy(this.anchor);
    this.resizeBloom();this.updatePose();
  }
  resizeBloom() {
    if(!this.bloom) return;
    const resolution=this.layout.mobile?this.config.bloom.mobileResolution:this.config.bloom.desktopResolution;
    this.bloom.setSize(this.width*this.renderer.getPixelRatio()*resolution,this.height*this.renderer.getPixelRatio()*resolution);
  }

  update(dt) {
    if(this.disposed||this.paused||this.debugPaused) return;
    this.ambientTime+=dt;
    if(this.state===UnlockState.IDLE) {
      this.breathTime+=dt*(this.hover?this.config.crystal.breathPeriod/this.config.crystal.hoverPeriod:1);
      if(!this.reduced) this.breath.totalTime(this.breathTime,false);
    } else if(this.state===UnlockState.PLAYING) {
      this.time=Math.min(this.timeline.duration(),this.time+dt);this.timeline.totalTime(this.time,false);
    }
    this.updatePose();
    this.gsap.ticker.sleep();
  }

  updatePose() {
    if(!this.props||!this.layout||this.disposed) return;
    const p=this.props,e=this.effects,c=this.config;
    const idle=this.state===UnlockState.IDLE;
    const breath=idle&&!this.reduced?this.breathValue.value:0;
    const breathing=idle?c.crystal.minScale+(c.crystal.maxScale-c.crystal.minScale)*breath:1;
    e.crystal.visible=this.opening.failed&&(idle||p.crystalAlpha>.001)&&this.state!==UnlockState.REVEALED;
    e.crystal.scale.setScalar(this.crystalBase*p.clusterScale*breathing);
    e.crystal.position.copy(this.anchor);
    // The float is eased to the common centre in the initial 35ms charge.
    if(idle&&!this.reduced) e.crystal.position.y+=Math.sin(this.breathTime*Math.PI*2/c.crystal.breathPeriod)*c.crystal.floatPx*this.pixelWorld;
    e.cluster.rotation.y=.64+(this.reduced?0:this.breathTime*c.crystal.turnSpeed);
    const spread=p.spread*(idle&&this.hover?c.crystal.spreadHover:1);
    for(let i=0;i<e.blocks.length;i++) e.blocks[i].position.copy(e.blocks[i].userData.home).multiplyScalar(spread);
    e.glass.opacity=.62*p.crystalAlpha;e.edgeMat.opacity=(.52+breath*.22)*p.crystalAlpha;
    e.uniforms.energy.value=p.energy+breath*.22;e.core.intensity=(.3+breath*.3+p.energy)*p.crystalAlpha;
    e.glass.ior=c.crystal.ior+breath*.018;
    e.pointUniforms.uOpacity.value=p.point;e.point.visible=p.point>.001;
    e.starUniforms.uOpacity.value=p.star;e.starUniforms.uSize.value=THREE.MathUtils.lerp(c.star.startPx,Math.max(this.width,this.height)*c.star.endViewport,p.starGrowth);e.star.visible=p.star>.001;
    e.warpUniforms.uTime.value=Math.max(0,this.time-c.labels.warp)*(1+p.speed*.5);
    e.warpUniforms.uSpeed.value=p.speed;e.warpUniforms.uProgress.value=p.progress;e.warpUniforms.uOpacity.value=p.warp;e.warp.visible=p.warp>.001;
    this.wrapper.visible=p.badgeOn>0;
    this.sheenMaterial.opacity=p.sheen;this.sheen.visible=p.sheen>.001;
    this.wrapper.scale.setScalar(THREE.MathUtils.lerp(this.revealScale,this.finalScale,p.lift)*p.badgeScale);
    this.wrapper.position.copy(this.anchor);
    this.wrapper.position.y+=this.height*this.layout.aboveCenter*this.pixelWorld*p.lift;
    this.wrapper.position.x+=Math.sin(Math.PI*p.lift)*this.width*c.badge.arcVw*this.pixelWorld;
    this.wrapper.rotation.set(0,p.yaw,p.roll,'YXZ');
    if(this.state===UnlockState.REVEALED&&!this.reduced) {
      this.wrapper.position.y+=Math.sin(this.ambientTime*1.4)*c.badge.floatPx*this.pixelWorld;
      this.wrapper.rotation.y=Math.sin(this.ambientTime*c.badge.turnSpeed)*.055;
    }
    if(this.state!==UnlockState.REVEALED) {
      this.camera.fov=this.original.fov+p.fov;this.camera.position.z=this.original.cameraPosition.z-p.push;this.camera.updateProjectionMatrix();
      if(this.bloom) {this.bloom.strength=idle?c.bloom.idle+c.bloom.breath*breath:p.bloom;this.bloom.threshold=c.bloom.threshold;}
    }
    if(this.backdropTheme!==c.theme){this.backdrop.setTheme(c.theme);this.backdropTheme=c.theme;}
    this.backdrop.update({camera:this.camera,badgeRoot:this.wrapper,time:this.time,ambientTime:this.ambientTime,state:this.state,reduced:this.reduced,settleAt:c.labels.settle,revealAt:this.reduced?c.reduced.revealAt:c.labels.reveal});
    // Reuse original atmosphere only after the white flash, never in the tunnel.
    this.original.atmosphere.forEach(({object,visible})=>{object.visible=visible&&p.lift>0;});
  }

  render() {if(this.composer)this.composer.render();else this.renderer.render(this.scene,this.camera);}
  restoreRendering() {
    this.camera.fov=this.original.fov;this.camera.position.copy(this.original.cameraPosition);this.camera.quaternion.copy(this.original.cameraQuaternion);this.camera.updateProjectionMatrix();
    this.renderer.toneMappingExposure=this.original.exposure;
    if(this.bloom&&this.original.bloom) Object.assign(this.bloom,this.original.bloom);
  }
  seek(seconds) {
    if(this.state!==UnlockState.PLAYING||seconds<this.time) {this.reset();this.play();}
    this.debugPaused=true;this.time=Math.max(0,Math.min(seconds,this.timeline.duration()));
    this.timeline.totalTime(this.time,false);this.updatePose();this.render();
    return this.inspect();
  }
  inspect() {
    const centre=this.anchor.clone().project(this.camera);const badge=this.wrapper.position.clone().project(this.camera);
    return {state:this.state,loaded:this.loaded,time:this.time,duration:this.timeline?.duration()??0,reducedMotion:this.reduced,particles:this.layout.particleCount,
      centre:{x:(centre.x+1)*this.width/2,y:(1-centre.y)*this.height/2},badge:{x:(badge.x+1)*this.width/2,y:(1-badge.y)*this.height/2},
      openingVideo:{loaded:this.opening.loaded,failed:this.opening.failed,paused:this.opening.video.paused,time:this.opening.video.currentTime},
      fov:this.camera.fov,exposure:this.renderer.toneMappingExposure,bloom:this.bloom?.strength,flash:this.flash.hidden?0:Number(this.flash.style.opacity),ready:this.ui.dataset.unlockReady==='true'};
  }
  close() {this.dispose();}
  dispose() {
    if(this.disposed) return;
    this.timeline?.kill();this.breath?.kill();this.abort.abort();this.opening.dispose();this.restoreRendering();
    this.original.parent.add(this.badge);this.badge.position.copy(this.original.position);this.badge.quaternion.copy(this.original.quaternion);this.badge.scale.copy(this.original.scale);this.badge.visible=this.original.visible;
    this.wrapper.removeFromParent();this.effects.dispose();this.backdrop.dispose();this.sheenMaterial.dispose();
    this.original.atmosphere.forEach(({object,visible})=>{object.visible=visible;});
    this.gsap.set([this.copy,this.actions,this.controls,...this.items],{clearProps:'opacity,visibility,transform'});
    this.copy.inert=false;this.actions.inert=false;this.controls.inert=false;this.share.disabled=false;this.confirm.disabled=false;
    [this.panel,this.trigger,this.hint,this.flash].forEach(el=>el.remove());this.ui.classList.remove('unlock-active');
    this.state=UnlockState.CLOSED;this.ui.dataset.unlockState=this.state;this.disposed=true;this.loaded=false;
    this.gsap.ticker.sleep();this.onRestore?.();
  }
}
