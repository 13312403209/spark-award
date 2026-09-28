import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { normalizeBadgeParameters, defaultBadgeParameters } from './Badge3DSettings.js';

export const BADGE_SVG_URL = './assets/badge.svg';
const BACK_SVG_URL = './assets/badge-back.svg';
const BODY_SVG_URL = './assets/badge-body.svg';

function physical(options, scatter = 0) {
  const material = new THREE.MeshPhysicalMaterial(options);
  // Neutral, thickness-inspired diffusion underneath polished silver.
  // The specular BRDF and bevel reflections remain physically based.
  if (scatter) {
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        float facing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        float wrap = pow(1.0 - facing, 2.0);
        vec3 diffusion = vec3(0.17) * (${scatter.toFixed(3)}) * (0.16 + wrap * 0.65);
        outgoingLight += diffusion;
        #include <opaque_fragment>
      `);
    };
    material.customProgramCacheKey = () => `badge-diffusion-${scatter}`;
  }
  return material;
}

export function createBadgeMaterials() {
return {
  body: physical({ color: '#c4c4c4', metalness: 0.95, roughness: 0.26, envMapIntensity: 0.85, clearcoat: 0.45, clearcoatRoughness: 0.1 }),
  edge: physical({ color: '#f2f2f2', metalness: 0.68, roughness: 0.27, envMapIntensity: 1.05, emissive: '#d8d8d8', emissiveIntensity: 0.055, clearcoat: 0.8, clearcoatRoughness: 0.075 }),
  star: physical({ color: '#ffffff', metalness: 0.58, roughness: 0.29, envMapIntensity: 0.95, emissive: '#ffffff', emissiveIntensity: 0.16, clearcoat: 0.8, clearcoatRoughness: 0.085 }, 0.3),
  starEdge: physical({ color: '#ffffff', metalness: 0.6, roughness: 0.085, envMapIntensity: 1.25, emissive: '#ffffff', emissiveIntensity: 0.6, clearcoat: 1, clearcoatRoughness: 0.035 }),
  starHighlight: physical({ color: '#ffffff', metalness: 0.45, roughness: 0.07, envMapIntensity: 1.1, emissive: '#ffffff', emissiveIntensity: 1.15, clearcoat: 1, clearcoatRoughness: 0.025 }),
  inset: physical({ color: '#767676', metalness: 0.68, roughness: 0.43, envMapIntensity: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.2 }),
  rim: physical({ color: '#cacaca', metalness: 0.8, roughness: 0.24, envMapIntensity: 0.92, clearcoat: 0.7, clearcoatRoughness: 0.09 }),
  letters: physical({ color: '#ffffff', metalness: 0.5, roughness: 0.26, envMapIntensity: 0.8, emissive: '#ffffff', emissiveIntensity: 0.14, clearcoat: 0.45, clearcoatRoughness: 0.1 }),
  reverse: physical({ color: '#d8d8d8', metalness: 0.66, roughness: 0.43, envMapIntensity: 0.7, clearcoat: 0.25, clearcoatRoughness: 0.24 }),
  reverseLetters: physical({ color: '#606060', metalness: 0.18, roughness: 0.78, envMapIntensity: 0.16, clearcoat: 0 }),
};
}

function createArtwork(data, backData, parameters, materials, bodyData = null) {
const badge=new THREE.Group();
try {
// Source coordinates are kept intact. Only an affine centre/scale is applied
// per face; every SVG path, stroke, hole and nested group is retained.
const SCALE = 3.4 / 262.90991;
const FRONT = { x:777.316635, y:549.400815 };
const BACK = { x:1142.710445, y:551.272355 };
const HALF_THICKNESS = parameters.thickness / 2;

function toFaceGeometry(geometry, center, scale = SCALE) {
  geometry.translate(-center.x,-center.y,0);
  geometry.scale(scale,-scale,1);
  // Mirroring the SVG y axis changes triangle winding, but not the outward normal.
  const count=geometry.getAttribute('position').count;
  if (geometry.index) {
    const a=geometry.index.array;
    for(let i=0;i<a.length;i+=3) [a[i+1],a[i+2]]=[a[i+2],a[i+1]];
  } else {
    const indices=[];
    for(let i=0;i<count;i+=3) indices.push(i,i+2,i+1);
    geometry.setIndex(indices);
  }
  return geometry;
}

function extrude(shapes, center, depth, bevel, scale = SCALE, smooth = false) {
  bevel *= parameters.bevel;
  const geometry=toFaceGeometry(new THREE.ExtrudeGeometry(shapes, {
    depth, steps:1, curveSegments:smooth?64:32, bevelEnabled:bevel>0,
    bevelThickness:bevel*scale, bevelSize:bevel, bevelSegments:smooth?8:4,
  }),center,scale);
  if(!smooth) return geometry;
  const result=geometry.toNonIndexed();
  geometry.dispose();
  const positions=result.getAttribute('position').clone();
  const originalNormals=result.getAttribute('normal');
  // Use a 0.00001-world-unit weld tolerance; the helper's default tolerance
  // is too coarse for shallow relief and could merge neighboring bevel rows.
  result.scale(1000,1000,1000);
  toCreasedNormals(result,0.5);
  result.setAttribute('position',positions);
  const normals=result.getAttribute('normal');
  // Retain flat silver faces and crisp artwork; smooth only the curved edges.
  for(const group of result.groups) if(group.materialIndex===0) {
    normals.array.set(originalNormals.array.subarray(group.start*3,(group.start+group.count)*3),group.start*3);
  }
  result.boundingBox=null; result.boundingSphere=null;
  return result;
}

function addStarHighlight(path, center, parent, height, scale = SCALE) {
  // Trace the supplied star contour exactly at the crest of its shallow bevel.
  // This narrow white reflection stays crisp even when a mirror bevel faces
  // the dark stage, rather than turning the star outline into a black seam.
  for(const sub of path.subPaths) {
    const points=sub.getPoints(64);
    if(points.length<3) continue;
    if(points[0].distanceToSquared(points.at(-1))>1e-10) points.push(points[0].clone());
    const curve=new THREE.CurvePath();
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i];
      if(a.distanceToSquared(b)<1e-12) continue;
      curve.add(new THREE.LineCurve3(
        new THREE.Vector3((a.x-center.x)*scale,(center.y-a.y)*scale,0),
        new THREE.Vector3((b.x-center.x)*scale,(center.y-b.y)*scale,0)
      ));
    }
    const geometry=new THREE.TubeGeometry(curve,Math.max(768,points.length),.22*scale,8,true);
    geometry.scale(1,1,.34);
    const line=new THREE.Mesh(geometry,materials.starHighlight);
    line.position.z=height+.0007;
    line.name='White highlight on original star contour';
    parent.add(line);
  }
}


function buildGeneric(data) {
  const paths=data.paths.filter(p=>p.userData.style.fill!=='none' || (p.userData.style.stroke&&p.userData.style.stroke!=='none'));
  const points=paths.flatMap(p=>p.subPaths.flatMap(s=>s.getPoints(64)));
  if(!points.length)throw new Error('SVG 没有有效轮廓。');
  const bounds=new THREE.Box2().setFromPoints(points),size=bounds.getSize(new THREE.Vector2()),center=bounds.getCenter(new THREE.Vector2());
  if(!Number.isFinite(size.y)||size.y<=0)throw new Error('SVG 高度无效。');
  const scale=3.4/size.y;
  const filled=paths.filter(p=>p.userData.style.fill!=='none'&&p.userData.style.fillOpacity!==0);
  // A data-badge-role="body" path is the explicit substrate; otherwise use the largest filled outline.
  const area=p=>SVGLoader.createShapes(p).reduce((sum,s)=>sum+Math.abs(THREE.ShapeUtils.area(s.getPoints(32))),0);
  const plate=filled.find(p=>p.userData.node.getAttribute('data-badge-role')==='body')||[...filled].sort((a,b)=>area(b)-area(a))[0];
  if(!plate)throw new Error('SVG 需要至少一个填充轮廓作为徽章基底。');
  const body=new THREE.Mesh(extrude(SVGLoader.createShapes(plate),center,HALF_THICKNESS*2-.008,.66,scale,true),[materials.body,materials.edge]);
  body.name='Thin solid metal substrate';body.position.z=-HALF_THICKNESS+.004;badge.add(body);
  const front=new THREE.Group();front.name='SVG front';badge.add(front);
  const groups=new WeakMap();
  function parent(node) {
    if(!node||node===data.xml)return front;
    if(groups.has(node))return groups.get(node);
    const group=new THREE.Group();group.name=node.id||node.getAttribute('id')||node.tagName;parent(node.parentNode).add(group);groups.set(node,group);return group;
  }
  let count=0,strokes=0;
  for(const path of paths) {
    const style=path.userData.style,node=path.userData.node;
    const role=node.getAttribute('data-badge-role');
    const material=materials[role]|| (path===plate?materials.inset:materials.star);
    if(style.fill!=='none'&&style.fillOpacity!==0) {
      const shapes=SVGLoader.createShapes(path);
      if(shapes.length) {
        const depth=(path===plate?.006:.012)*parameters.relief;
        const geometry=extrude(shapes,center,depth,path===plate?.16:.08,scale,true);
        const mesh=new THREE.Mesh(geometry,[material,materials.edge]);
        mesh.position.z=HALF_THICKNESS+(path===plate?-.001:.008)*parameters.relief;
        mesh.name=`SVG ${node.tagName} ${count++}`;parent(node.parentNode).add(mesh);
      }
    }
    if(style.stroke&&style.stroke!=='none'&&style.strokeOpacity!==0)for(const sub of path.subPaths) {
      const geometry=SVGLoader.pointsToStroke(sub.getPoints(64),style);
      if(!geometry)continue;
      const mesh=new THREE.Mesh(toFaceGeometry(geometry,center,scale),materials.letters);
      mesh.position.z=HALF_THICKNESS+.024*parameters.relief;mesh.name=`SVG stroke ${strokes++}`;parent(node.parentNode).add(mesh);
    }
  }
  badge.userData={sourcePaths:count+strokes,filledPaths:count,strokes,thickness:parameters.thickness,layout:'single-face'};
  return badge;
}

  if(!backData) return buildGeneric(data);
  const root = data.xml;
  const children=Array.from(root.children);
  const standalone = root.getAttribute('data-badge-layout') === 'spark-front';
  const frontBounds = standalone ? new THREE.Box2().setFromPoints(data.paths.flatMap(path=>path.subPaths.flatMap(sub=>sub.getPoints(64)))) : null;
  const frontCenter = standalone ? frontBounds.getCenter(new THREE.Vector2()) : FRONT;
  const frontScale = standalone ? 3.4/frontBounds.getSize(new THREE.Vector2()).y : SCALE;
  if (!Number.isFinite(frontScale) || frontScale <= 0) throw new Error('正面 SVG 尺寸无效。');
  const faceFront=new THREE.Group(); faceFront.name='SVG front';
  const faceBack=new THREE.Group(); faceBack.name='SVG back'; faceBack.rotation.y=Math.PI;
  badge.add(faceFront,faceBack);
  // A replacement front keeps the exact approved substrate, independently of its artwork.
  const bodyPath=standalone ? bodyData?.paths[0] : data.paths.find(p=>p.userData.node===children[9]);
  if (!bodyPath) throw new Error('缺少徽章主体轮廓。');
  const silhouette=SVGLoader.createShapes(bodyPath);
  const body=new THREE.Mesh(extrude(silhouette,BACK,HALF_THICKNESS*2-0.008,0.66,SCALE,true),[materials.body,materials.edge]);
  body.position.z=-HALF_THICKNESS+0.004;
  body.name='Thin solid metal substrate'; badge.add(body);
  const groups=new WeakMap();
  function parentGroup(node,face,sourceRoot=root) {
    if(node===sourceRoot || !node || node.parentNode===sourceRoot) return face;
    if(groups.has(node)) return groups.get(node);
    const group=new THREE.Group(); group.name=node.id || node.tagName;
    parentGroup(node.parentNode,face,sourceRoot).add(group); groups.set(node,group); return group;
  }
  let paths=0, strokes=0;
  for(const path of data.paths) {
    const node=path.userData.node;
    let top=node; while(top.parentNode!==root) top=top.parentNode;
    const role=node.getAttribute('data-badge-role');
    const index=standalone ? ({star:1,inset:2,rim:3,accent:4,letters:7}[role] ?? 7) : children.indexOf(top);
    const back=!standalone && index>=9;
    if(back) continue;
    const face=faceFront, center=frontCenter, scale=frontScale;
    const parent=parentGroup(node.parentNode,face);
    const style=path.userData.style;
    let material=materials.letters, depth=.006, bevel=.07, z=HALF_THICKNESS+.014;
    if(index===1) {material=materials.star;depth=.018;bevel=.47;z=HALF_THICKNESS-.002;}
    if(index===2||index===6) {material=materials.inset;depth=.006;bevel=.23;z=HALF_THICKNESS-.003;}
    if(index===3) {material=materials.rim;depth=.010;bevel=.48;z=HALF_THICKNESS;}
    if(index===4||index===5) {depth=.005;bevel=.065;z=HALF_THICKNESS+.014;}
    if(index===7||index===8) {z=HALF_THICKNESS+.005;depth=.005;bevel=.06;}
    depth *= parameters.relief; z = HALF_THICKNESS + (z-HALF_THICKNESS)*parameters.relief;
    if(style.fill!=='none'&&style.fillOpacity!==0) {
      const shapes=SVGLoader.createShapes(path);
      if(shapes.length) {
        const edgeMaterial=index===1?materials.starEdge:materials.edge;
        const mesh=new THREE.Mesh(extrude(shapes,center,depth,bevel,scale,index<=6),[material,edgeMaterial]);
        mesh.position.z=z; mesh.name=`SVG ${node.tagName} ${paths++}`; parent.add(mesh);
        if(index===1) addStarHighlight(path,center,parent,z+depth+bevel*parameters.bevel*scale,scale);
      }
    }
    if(style.stroke&&style.stroke!=='none'&&style.strokeOpacity!==0) {
      for(const sub of path.subPaths) {
        // Flattened round metal wires preserve the SVG's exact stroke centreline
        // and width, with a shallow rounded highlight instead of a flat decal.
        const points=sub.getPoints(80);
        const curve=new THREE.CurvePath();
        for(let i=1;i<points.length;i++) {
          const a=points[i-1],b=points[i]; if(a.distanceToSquared(b)<1e-12) continue;
          curve.add(new THREE.LineCurve3(new THREE.Vector3((a.x-center.x)*scale,(center.y-a.y)*scale,0),new THREE.Vector3((b.x-center.x)*scale,(center.y-b.y)*scale,0)));
        }
        if(!curve.curves.length) continue;
        const geo=new THREE.TubeGeometry(curve,Math.max(96,points.length),Number(style.strokeWidth)*scale/2,8,false);
        geo.scale(1,1,.21);
        const mesh=new THREE.Mesh(geo,materials.letters); mesh.position.z=z+.003;
        mesh.name=`SVG stroke ${strokes++}`; parent.add(mesh);
      }
    }
  }
  // The supplied standalone reverse is the sole source of its artwork.
  // Align its own outline to the unchanged metal body; do not retype glyphs.
  const backRoot=backData.xml;
  const backPlate=backData.paths[0]; // The supplied SVG nests its plate and lettering inside a group.
  const backBounds=new THREE.Box2().setFromPoints(backPlate.subPaths.flatMap(path=>path.getPoints(32)));
  const backCenter=backBounds.getCenter(new THREE.Vector2());
  const backScale=3.4/backBounds.getSize(new THREE.Vector2()).y;
  for(const path of backData.paths) {
    if(path.userData.style.fill==='none'||path.userData.style.fillOpacity===0) continue;
    const plate=path===backPlate;
    const shapes=SVGLoader.createShapes(path);
    if(!shapes.length) continue;
    const material=plate?materials.reverse:materials.reverseLetters;
    const mesh=new THREE.Mesh(
      extrude(shapes,backCenter,(plate ? .004 : .002)*parameters.relief,plate ? .16 : .02,backScale,plate),
      [material,plate?materials.edge:materials.reverseLetters]
    );
    mesh.position.z=HALF_THICKNESS+(plate?-.001:.006)*parameters.relief;
    mesh.name=`Reverse SVG ${path.userData.node.tagName} ${paths++}`;
    parentGroup(path.userData.node.parentNode,faceBack,backRoot).add(mesh);
  }
  badge.userData={sourcePaths:paths+strokes,filledPaths:paths,strokes,backSource:'./assets/badge-back.svg',backSourcePaths:backData.paths.length,thickness:HALF_THICKNESS*2};
  return badge;
} catch(error) { disposeGeometry(badge); throw error; }
}

function parseSVG(source) {
  const data=new SVGLoader().parse(source);
  if(data.xml.getElementsByTagName('parsererror').length)throw new Error('SVG 格式无效，请检查文件。');
  if(data.xml.getElementsByTagName('text').length)throw new Error('SVG 包含未转曲文字，请将文字转换为路径后重新加载。');
  if(!data.paths.length)throw new Error('SVG 中没有可生成徽章的矢量路径。');
  return data;
}
function isOriginalLayout(data) {
  const children=Array.from(data.xml.children);
  const plate=data.paths.find(path=>path.userData.node===children[9]);
  if(!plate || children[9]?.tagName!=='polygon' || children[1]?.tagName!=='path')return false;
  const bounds=new THREE.Box2().setFromPoints(plate.subPaths.flatMap(p=>p.getPoints(8)));
  return Math.abs(bounds.getCenter(new THREE.Vector2()).x-1142.710445)<1 && Math.abs(bounds.getSize(new THREE.Vector2()).y-262.90991)<1;
}
async function loadSVG(url, signal) {
  // The offline preview injects the same source. HTTP pages always fetch fresh files.
  if(globalThis.__badgeAssets && url in globalThis.__badgeAssets)return globalThis.__badgeAssets[url];
  const response=await fetch(url,{cache:'no-store',signal});
  if(!response.ok)throw new Error(`无法加载 ${url}（${response.status}）`);
  return response.text();
}
function disposeGeometry(root) {
  const geometries=new Set();root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);});
  for(const geometry of geometries)geometry.dispose();
  root.clear();
}

/** Renderer-independent SVG model; the host owns camera, lighting and interaction. */
export class Badge3D extends THREE.Group {
  constructor(parameters=defaultBadgeParameters()) {
    super();
    this.name='Badge3D';this.parameters=normalizeBadgeParameters(parameters);
    this.materials=createBadgeMaterials();
    this.materialDefaults=Object.fromEntries(Object.entries(this.materials).map(([key,value])=>[key,{metalness:value.metalness,roughness:value.roughness}]));
    this._source=null;this._reverse=null;this._body=null;this._request=0;this._controller=null;this.disposed=false;
    this._applyMaterials();
  }
  _applyMaterials() {
    for(const [role,material] of Object.entries(this.materials))Object.assign(material,this.materialDefaults[role],this.parameters.materials[role]);
  }
  async load() {
    if(this.disposed)throw new Error('Badge3D has been disposed');
    this._controller?.abort();const controller=this._controller=new AbortController();
    const request=++this._request;
    const source=parseSVG(await loadSVG(BADGE_SVG_URL,controller.signal));
    // Only the explicitly mapped Spark front inherits the approved back and substrate.
    // Unrelated SVGs in the lab retain their generic single-face behavior.
    const standalone=source.xml.getAttribute('data-badge-layout')==='spark-front';
    const reverse=(isOriginalLayout(source)||standalone)?parseSVG(await loadSVG(BACK_SVG_URL,controller.signal)):null;
    const body=standalone?parseSVG(await loadSVG(BODY_SVG_URL,controller.signal)):null;
    if(this.disposed||request!==this._request)return false;
    this._replace(source,reverse,this.parameters,body);
    this._source=source;this._reverse=reverse;this._body=body;
    return this;
  }
  reload() {return this.load();}
  _replace(source,reverse,parameters,body=null) {
    // Keep the current model visible until the replacement is completely built.
    const next=createArtwork(source,reverse,parameters,this.materials,body);
    disposeGeometry(this);
    this.add(...[...next.children]);this.userData={...next.userData,source:BADGE_SVG_URL};
  }
  setParameters(patch={}) {
    if(this.disposed)throw new Error('Badge3D has been disposed');
    const parameters=normalizeBadgeParameters({...this.parameters,...patch,materials:patch.materials??this.parameters.materials});
    const rebuild=['thickness','bevel','relief'].some(key=>parameters[key]!==this.parameters[key]);
    if(rebuild&&this._source)this._replace(this._source,this._reverse,parameters,this._body);
    this.parameters=parameters;this._applyMaterials();return this;
  }
  getParameters() {return structuredClone(this.parameters);}
  dispose() {
    if(this.disposed)return;
    this.disposed=true;this._request++;this._controller?.abort();disposeGeometry(this);
    for(const material of Object.values(this.materials))material.dispose();
  }
}

