import * as THREE from 'three';

// Every effect uses the same camera centre. No image sprites or external assets.
export function createUnlockEffects(scene, config) {
  const ownedGeometry = new Set(), ownedMaterial = new Set();
  const ownG = g => (ownedGeometry.add(g), g);
  const ownM = m => (ownedMaterial.add(m), m);
  const root = new THREE.Group(); root.name = 'Badge unlock effects'; scene.add(root);
  const crystal = new THREE.Group(); root.add(crystal);
  const cluster = new THREE.Group(); crystal.add(cluster); cluster.rotation.set(.51, .64, .05);
  const uniforms = { energy: { value: .15 }, opacity: { value: 1 } };
  const glass = ownM(new THREE.MeshPhysicalMaterial({
    color: '#ecf4ff', metalness: 0, roughness: .045, transmission: config.crystal.transmission,
    thickness: .72, ior: config.crystal.ior, dispersion: config.crystal.dispersion,
    iridescence: config.crystal.iridescence, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 440],
    envMapIntensity: 1.35, clearcoat: 1, clearcoatRoughness: .025, transparent: true,
  }));
  glass.onBeforeCompile = shader => {
    shader.uniforms.uUnlockEnergy = uniforms.energy;
    shader.vertexShader = 'varying vec3 vUnlockLocal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvUnlockLocal=position;');
    shader.fragmentShader = 'uniform float uUnlockEnergy; varying vec3 vUnlockLocal;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float fresnel = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
      vec3 a=abs(vUnlockLocal);
      float border=max(min(a.x,a.y),max(min(a.x,a.z),min(a.y,a.z)));
      float edge=smoothstep(.297,.330,border);
      vec3 spectrum=.58+.42*cos(vec3(0.,2.1,4.2)+dot(vUnlockLocal,vec3(13.,9.,7.)));
      float prism=pow(.5+.5*sin(dot(vUnlockLocal,vec3(14.,19.,11.))+fresnel*3.),10.);
      outgoingLight += mix(vec3(1.),spectrum,.68)*edge*(1.4+uUnlockEnergy);
      outgoingLight += mix(vec3(1.),spectrum,.58)*prism*(.45+fresnel*.7);
      outgoingLight += vec3(.75,.86,1.) * uUnlockEnergy * (.015 + fresnel * .5);
      #include <opaque_fragment>`);
  };
  glass.customProgramCacheKey = () => 'unlock-crystal-fresnel-v1';
  const box = ownG(new THREE.BoxGeometry(.66, .66, .66));
  const edges = ownG(new THREE.EdgesGeometry(box));
  const edgeMat = ownM(new THREE.LineBasicMaterial({ color: '#e4f0ff', transparent: true, opacity: .5, toneMapped: false }));
  // A compact interlocking arrangement, all pieces move coherently through one scalar.
  const coords = [[0,0,0],[-1,0,0],[1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[-1,1,0],[1,-1,0],[-1,0,1],[1,0,-1],[0,1,-1],[0,-1,1],[1,1,0],[-1,-1,0]];
  const blocks = coords.map((p, i) => {
    const part = new THREE.Group();
    const size = i === 0 ? 1.05 : .72 + (i % 4) * .065;
    part.scale.setScalar(size);
    part.add(new THREE.Mesh(box, glass), new THREE.LineSegments(edges, edgeMat));
    part.userData.home = new THREE.Vector3(p[0]*.55, p[1]*.55, p[2]*.55);
    part.position.copy(part.userData.home); cluster.add(part); return part;
  });
  const core = new THREE.PointLight('#ffffff', .4, 5, 2); crystal.add(core);

  function plane(fragmentShader, uniforms) {
    const material = ownM(new THREE.ShaderMaterial({ uniforms, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}', fragmentShader }));
    const mesh = new THREE.Mesh(ownG(new THREE.PlaneGeometry(2,2)), material);
    mesh.frustumCulled = false; mesh.renderOrder = 20; root.add(mesh); return mesh;
  }
  const resolution = { value: new THREE.Vector2(1,1) };
  const pointUniforms = { uResolution: resolution, uOpacity: { value: 0 } };
  const point = plane(`varying vec2 vUv; uniform vec2 uResolution; uniform float uOpacity;
    void main(){float r=length((vUv-.5)*uResolution);float core=1.-smoothstep(1.4,3.4,r);
    float inner=exp(-r*r/34.);float outer=exp(-r*r/190.);
    float a=core*3.4+inner*.8+outer*.15;gl_FragColor=vec4(vec3(a),uOpacity);}`, pointUniforms);
  const starUniforms = { uResolution: resolution, uOpacity: { value: 0 }, uSize: { value: 12 } };
  const star = plane(`varying vec2 vUv;uniform vec2 uResolution;uniform float uOpacity;uniform float uSize;
    void main(){vec2 p=abs((vUv-.5)*uResolution)/max(1.,uSize);
    // Concave four-point star distance: sharp vertical/horizontal spikes.
    float d=pow(pow(p.x,.48)+pow(p.y,.48),1./.48);
    float edge=1.-smoothstep(.39,.415,d);float outline=exp(-abs(d-.4)*110.);
    float halo=exp(-d*14.)*.55;float a=edge*2.3+outline*1.5+halo;
    gl_FragColor=vec4(vec3(a),uOpacity);}`, starUniforms);

  const warpUniforms = { uTime: { value: 0 }, uSpeed: { value: 0 }, uProgress: { value: 0 }, uOpacity: { value: 0 }, uResolution: resolution };
  const warpGeometry = ownG(new THREE.InstancedBufferGeometry());
  warpGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0,-1,0,1,-1,0,1,1,0,0,1,0],3));
  warpGeometry.setIndex([0,1,2,0,2,3]);
  const seeds = new Float32Array(config.particles.desktop*4);
  let seed=173; const random=()=>((seed=(seed*16807)%2147483647)-1)/2147483646;
  for(let i=0;i<config.particles.desktop;i++) seeds.set([random(),random(),random(),random()],i*4);
  warpGeometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seeds,4));
  const warpMat = ownM(new THREE.ShaderMaterial({uniforms:warpUniforms,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 aSeed;uniform vec2 uResolution;uniform float uTime;uniform float uSpeed;uniform float uProgress;varying vec2 vUv;varying float vAlpha;varying float vTint;
    void main(){float angle=aSeed.x*6.283185;vec2 dir=vec2(cos(angle),sin(angle));vec2 side=vec2(-dir.y,dir.x);
      float depth=fract(aSeed.y+uTime*(.22+aSeed.z*.24)+uSpeed*.028);
      float r=.012+pow(depth,3.)*1.1;float len=(.016+uProgress*.50)*(.35+aSeed.z)*(.2+depth);
      float width=(.45+uProgress*2.2)*(.4+aSeed.w)/uResolution.y;
      vec2 p=dir*(r+position.x*len)+side*position.y*width;
      p.x*=uResolution.y/uResolution.x;gl_Position=vec4(p*2.,0.,1.);
      vUv=position.xy;vAlpha=smoothstep(aSeed.w*.76,aSeed.w*.76+.18,uProgress)*smoothstep(0.,.1,depth);vTint=aSeed.z;}`,
    fragmentShader:`uniform float uOpacity;varying vec2 vUv;varying float vAlpha;varying float vTint;
    void main(){float edge=pow(max(0.,1.-abs(vUv.y)),.65);float tail=smoothstep(0.,.35,vUv.x)*(1.-smoothstep(.82,1.,vUv.x));
      vec3 color=mix(vec3(.25,.44,1.),vec3(.88,.96,1.),vTint)*2.2;gl_FragColor=vec4(color,edge*tail*vAlpha*uOpacity);}`
  }));
  const warp = new THREE.Mesh(warpGeometry,warpMat);warp.frustumCulled=false;warp.renderOrder=15;root.add(warp);
  root.visible = false;
  return {root, crystal, cluster, blocks, glass, edgeMat, core, uniforms, point, pointUniforms, star, starUniforms, warp, warpUniforms,
    resize(w,h,count){resolution.value.set(w,h);warpGeometry.instanceCount=count;},
    dispose(){root.removeFromParent();ownedGeometry.forEach(g=>g.dispose());ownedMaterial.forEach(m=>m.dispose());core.dispose();}
  };
}
