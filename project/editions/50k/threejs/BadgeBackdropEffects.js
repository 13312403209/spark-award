import * as THREE from 'three';

// Intentionally near-white: theme changes tint the accent, never recolor the badge.
export const BADGE_EFFECT_THEMES = Object.freeze({
  green: '#e7f1dc',
});
export const BADGE_BACKDROP_DEFAULTS = Object.freeze({
  meteorDelay: .10, meteorDuration: .48, meteorInterval: 3, meteorOpacity: .24,
  tailLength: .95, halfWidth: .012, dustDesktop: 14, dustMobile: 9, dustOpacity: .19, glowOpacity: .048,
});

// Three distinct overhead starting points, visited in order. One mesh is reused.
export const BADGE_METEOR_ROUTES = Object.freeze([
  {start:[1.00,2.10],end:[-.80,1.45]},
  {start:[-.10,2.05],end:[-1.80,1.42]},
  {start:[1.95,1.95],end:[.15,1.40]},
]);

/** Smooth envelope for one pass. */
export function meteorSample(time, start, duration) {
  const progress=(time-start)/duration;
  if(progress<=0||progress>=1)return {progress:THREE.MathUtils.clamp(progress,0,1),opacity:0};
  return {progress,opacity:THREE.MathUtils.smoothstep(progress,0,.12)*(1-THREE.MathUtils.smoothstep(progress,.78,1))};
}

export function meteorLoopSample(time,start,duration,interval=3) {
  if(time<start)return {progress:0,opacity:0,routeIndex:0};
  const cycle=Math.floor((time-start)/interval);
  return {...meteorSample(time,start+cycle*interval,duration),routeIndex:cycle%BADGE_METEOR_ROUTES.length};
}

const shield = `
  uniform vec4 uShield;
  uniform vec2 uResolution;
  float outsideBadge() {
    vec2 ndc=gl_FragCoord.xy/uResolution*2.0-1.0;
    vec2 p=(ndc-uShield.xy)/max(uShield.zw,vec2(.0001));
    // Keep a margin beyond the entire rotating badge, including the bloom fringe.
    return smoothstep(1.04,1.18,length(p));
  }
  float aboveBadge() {
    float y=(gl_FragCoord.y/uResolution.y*2.0-1.0-uShield.y)/max(uShield.w,.0001);
    return outsideBadge()*smoothstep(1.12,1.30,y);
  }
`;

/** Uses the host's render loop. No timers, timelines, lights or screen overlays. */
export class BadgeBackdropEffects {
  constructor(scene, {radius, theme='green', config={}}) {
    this.config={...BADGE_BACKDROP_DEFAULTS,...config};this.baseRadius=radius;
    this.root=new THREE.Group();this.root.name='Above badge accents and soft back glow';scene.add(this.root);
    this.color={value:new THREE.Color()};this.shield={value:new THREE.Vector4()};this.resolution={value:new THREE.Vector2(1,1)};
    this.center=new THREE.Vector3();this.cameraCenter=new THREE.Vector3();this.projected=new THREE.Vector3();this.scale=new THREE.Vector3();
    this._cameraPosition=new THREE.Vector3();this._cameraQuaternion=new THREE.Quaternion();
    this._viewInverse=new THREE.Matrix4();this.disposed=false;
    this.setTheme(theme);
    const shared={uColor:this.color,uShield:this.shield,uResolution:this.resolution};
    this.meteorUniforms={...shared,uHead:{value:new THREE.Vector2()},uDirection:{value:new THREE.Vector2(-1,0)},uOpacity:{value:0},uTail:{value:this.config.tailLength},uWidth:{value:this.config.halfWidth}};
    const meteorGeometry=new THREE.BufferGeometry();
    meteorGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,-1,0,1,-1,0,1,1,0,0,1,0],3));meteorGeometry.setIndex([0,1,2,0,2,3]);
    const meteorMaterial=new THREE.ShaderMaterial({
      uniforms:this.meteorUniforms,transparent:true,depthTest:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,
      vertexShader:`uniform vec2 uHead;uniform vec2 uDirection;uniform float uTail;uniform float uWidth;varying vec2 vStreak;
        void main(){vec2 direction=uDirection;vec2 side=vec2(-direction.y,direction.x);
          // Include space ahead of the head and around the core for a rounded cap and soft halo.
          vStreak=vec2(mix(-uTail,uWidth*4.,position.x),position.y*uWidth*5.);
          vec2 p=uHead+direction*vStreak.x+side*vStreak.y;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,0.,1.);}`,
      fragmentShader:`uniform vec3 uColor;uniform float uOpacity;uniform float uTail;uniform float uWidth;varying vec2 vStreak;${shield}
        void main(){float x=vStreak.x,y=vStreak.y;
          float age=clamp(-x/uTail,0.,1.);float fade=pow(1.-age,1.65);
          float taper=uWidth*(.10+.60*pow(1.-age,1.8));
          float behind=1.-smoothstep(-uWidth*.3,uWidth*.7,x);
          float core=exp(-2.*pow(y/taper,2.))*fade*behind;
          vec2 cap=vec2(x/(uWidth*1.1),y/(uWidth*.95));
          float head=exp(-dot(cap,cap)*1.8);
          float tailHalo=exp(-pow(y/(uWidth*2.6),2.))*fade*behind;
          float headHalo=exp(-dot(vStreak,vStreak)/(uWidth*uWidth*6.));
          // A narrow luminous core, softly rounded head and tapering cold-white trail.
          // Existing bloom catches the head only; the scene's bloom settings stay unchanged.
          float light=core*2.6+head*4.8+tailHalo*.18+headHalo*.30;
          float alpha=uOpacity*aboveBadge();if(light*alpha<.001)discard;
          gl_FragColor=vec4(uColor*light,alpha);}`,

    });
    this.meteor=new THREE.Mesh(meteorGeometry,meteorMaterial);this.meteor.frustumCulled=false;this.meteor.name='Single tapered meteor';this.root.add(this.meteor);
    const count=this.config.dustDesktop,positions=[],seeds=[];
    let seed=47;const random=()=>((seed=seed*16807%2147483647)-1)/2147483646;
    for(let i=0;i<count;i++) {
      // Keep a close, sparse cloud around the upper half of the badge.
      // Interleave regions so the smaller mobile draw range includes all three.
      const region=i%3;
      const x=region===0?(random()-.5)*2.0:(region===1?-1:1)*(1.28+random()*.25);
      const y=region===0?1.28+random()*.30:.10+random()*.95;
      positions.push(x,y,-.05-random()*.30);
      seeds.push(random()*6.283,random());
    }
    const dustGeometry=new THREE.BufferGeometry();dustGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));dustGeometry.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,2));
    this.dustUniforms={...shared,uTime:{value:0},uOpacity:{value:0},uDpr:{value:1}};
    const dustMaterial=new THREE.ShaderMaterial({uniforms:this.dustUniforms,transparent:true,depthTest:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,
      vertexShader:`attribute vec2 aSeed;uniform float uTime;uniform float uDpr;varying float vAlpha;
        void main(){vec3 p=position;p.xy+=vec2(sin(uTime*.28+aSeed.x),cos(uTime*.22+aSeed.x))*.095;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=(6.40+aSeed.y*3.20)*uDpr;
          vAlpha=.60+aSeed.y*.40;}`,
      fragmentShader:`uniform vec3 uColor;uniform float uOpacity;varying float vAlpha;${shield}
        void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
          float core=exp(-r*r*16.);float halo=exp(-r*r*3.);
          float alpha=(core*.75+halo*.30)*(1.-smoothstep(.7,1.,r))*uOpacity*vAlpha*outsideBadge();
          gl_FragColor=vec4(uColor,alpha);}`,
    });
    this.dust=new THREE.Points(dustGeometry,dustMaterial);this.dust.frustumCulled=false;this.dust.name='Gently glowing dust around badge';this.root.add(this.dust);
    this.glowUniforms={uColor:this.color,uOpacity:{value:0}};
    const glowMaterial=new THREE.ShaderMaterial({uniforms:this.glowUniforms,transparent:true,depthTest:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform vec3 uColor;uniform float uOpacity;varying vec2 vUv;
        void main(){float r=length((vUv-.5)*2.);float soft=exp(-r*r*6.)*(1.-smoothstep(.70,1.,r));
          gl_FragColor=vec4(uColor*.65,soft*uOpacity);}`,
    });
    // A dim physical plane behind the solid badge, not a light shining on its face.
    this.glow=new THREE.Mesh(new THREE.PlaneGeometry(4.8,4.8),glowMaterial);
    this.glow.position.z=-.08;this.glow.name='Subtle glow behind badge';this.glow.frustumCulled=false;this.root.add(this.glow);
    this.reset();
  }
  setTheme(theme='green') {
    const name=typeof theme==='string'?theme:theme?.name;
    const custom=theme?.effects?.color;
    const color=typeof custom==='string'&&/^#[\da-f]{6}$/i.test(custom)?custom:(BADGE_EFFECT_THEMES[name]??BADGE_EFFECT_THEMES.green);
    this.color.value.set(color);this.theme=name??'green';
  }
  resize(width,height,dpr,mobile) {
    this.resolution.value.set(Math.max(1,width*dpr),Math.max(1,height*dpr));this.dustUniforms.uDpr.value=dpr;
    this.dust.geometry.setDrawRange(0,mobile?this.config.dustMobile:this.config.dustDesktop);
  }
  prewarm() {this.root.visible=true;this.meteor.visible=true;this.dust.visible=true;}
  reset() {this.meteorClockOrigin=null;this.root.visible=false;this.meteor.visible=false;this.meteorUniforms.uOpacity.value=0;this.dustUniforms.uOpacity.value=0;this.glowUniforms.uOpacity.value=0;}
  update({camera,badgeRoot,time,ambientTime,state,reduced,settleAt,revealAt}) {
    if(this.disposed)return;
    const active=(state==='PLAYING'||state==='REVEALED')&&badgeRoot.visible;
    this.root.visible=active;if(!active)return;
    // A rotation-invariant sphere includes the whole badge at every viewing angle.
    // Place the effect plane farther from the camera than the farthest sphere point.
    badgeRoot.updateWorldMatrix(true,false);camera.updateWorldMatrix(true,false);
    badgeRoot.getWorldPosition(this.center);badgeRoot.getWorldScale(this.scale);
    const radius=this.baseRadius*Math.max(this.scale.x,this.scale.y,this.scale.z);
    this._viewInverse.copy(camera.matrixWorld).invert();this.cameraCenter.copy(this.center).applyMatrix4(this._viewInverse);
    const distance=-this.cameraCenter.z;
    if(distance<=radius+.01){this.root.visible=false;return;}
    const gap=Math.max(.15,radius*.35),planeDistance=distance+radius+gap;
    this.projected.copy(this.center).project(camera);
    const px=camera.projectionMatrix.elements[0],py=camera.projectionMatrix.elements[5];
    this.shield.value.set(this.projected.x,this.projected.y,px*radius/(distance-radius)*(1+Math.abs(this.cameraCenter.x)/distance),py*radius/(distance-radius)*(1+Math.abs(this.cameraCenter.y)/distance));
    camera.getWorldPosition(this._cameraPosition);camera.getWorldQuaternion(this._cameraQuaternion);
    this.root.position.set(this.cameraCenter.x*planeDistance/distance,this.cameraCenter.y*planeDistance/distance,-planeDistance).applyQuaternion(this._cameraQuaternion).add(this._cameraPosition);
    this.root.quaternion.copy(this._cameraQuaternion);this.root.scale.setScalar(radius*planeDistance/(distance-radius));
    // The opening clock seeds a continuous clock that keeps running after the
    // unlock timeline ends. No rotation events or extra timers can duplicate it.
    if(this.meteorClockOrigin===null||state==='PLAYING')this.meteorClockOrigin=ambientTime-time;
    const elapsed=state==='PLAYING'?time:ambientTime-this.meteorClockOrigin;
    const sample=meteorLoopSample(elapsed,settleAt+this.config.meteorDelay,this.config.meteorDuration,this.config.meteorInterval);
    const route=BADGE_METEOR_ROUTES[sample.routeIndex];
    this.meteor.visible=!reduced&&sample.opacity>0;
    this.meteorUniforms.uHead.value.set(THREE.MathUtils.lerp(route.start[0],route.end[0],sample.progress),THREE.MathUtils.lerp(route.start[1],route.end[1],sample.progress));
    this.meteorUniforms.uDirection.value.set(route.end[0]-route.start[0],route.end[1]-route.start[1]).normalize();
    this.meteorUniforms.uOpacity.value=this.meteor.visible?this.config.meteorOpacity*sample.opacity:0;
    const dustFade=state==='REVEALED'?1:THREE.MathUtils.smoothstep(time,revealAt,revealAt+.4);
    this.glowUniforms.uOpacity.value=this.config.glowOpacity*dustFade;
    this.dustUniforms.uOpacity.value=this.config.dustOpacity*dustFade;this.dustUniforms.uTime.value=reduced?0:ambientTime;
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;this.root.removeFromParent();
    for(const object of [this.meteor,this.dust,this.glow]){object.geometry.dispose();object.material.dispose();}
  }
}
