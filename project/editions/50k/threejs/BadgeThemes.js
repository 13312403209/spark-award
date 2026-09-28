import * as THREE from 'three';
import { BADGE_THEME_CONFIG } from './BadgeThemeConfig.js';

export const BADGE_PARTS = ['Body','Star','Text','Recess'];
export const BADGE_THEME_NAMES = ['green'];
export const BADGE_THEME_STORAGE_KEY = 'spark-award:50k:glb-themes:v1';
const copy = value => JSON.parse(JSON.stringify(value));

export function normalizeThemeSettings(input = {}) {
  const result=copy(BADGE_THEME_CONFIG);
  if(BADGE_THEME_NAMES.includes(input?.theme))result.theme=input.theme;
  for(const name of BADGE_THEME_NAMES)for(const part of BADGE_PARTS) {
    const source=input?.themes?.[name]?.[part],target=result.themes[name][part];
    if(!source)continue;
    if(typeof source.color==='string'&&/^#[\da-f]{6}$/i.test(source.color))target.color=source.color;
    for(const key of ['roughness','metalness','envMapIntensity']) {
      if(typeof source[key]==='number'&&Number.isFinite(source[key]))target[key]=THREE.MathUtils.clamp(source[key],0,key==='envMapIntensity'?4:1);
    }
  }
  return result;
}
export function readBadgeThemes(storage) {
  try { const input=JSON.parse((storage??globalThis.localStorage)?.getItem(BADGE_THEME_STORAGE_KEY)??'null');
    if(input?.version===1)return normalizeThemeSettings(input);
  } catch { /* Private browsing / invalid saved settings: retain project defaults. */ }
  return normalizeThemeSettings();
}
export function saveBadgeThemes(settings,storage=globalThis.localStorage) {
  const value=normalizeThemeSettings(settings);storage.setItem(BADGE_THEME_STORAGE_KEY,JSON.stringify(value));return value;
}
export function exportBadgeThemes(settings) {
  return '// Exported from Badge Lab. color is an sRGB multiplier of the original GLB.\nexport const BADGE_THEME_CONFIG = '+JSON.stringify(normalizeThemeSettings(settings),null,2)+';\n';
}

/** Owns only materials in the model passed here, never any effect or scene material. */
export class BadgeThemeController {
  constructor(root) {
    this.parts=Object.fromEntries(BADGE_PARTS.map(part=>[part,[]]));this.originals=new Map();
    root.traverse(object=>{
      if(!object.isMesh)return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]) {
        if(this.originals.has(material))continue;
        const part=material.userData.theme_part??material.name.split('_')[0];
        if(!BADGE_PARTS.includes(part))continue;
        this.parts[part].push(material);
        this.originals.set(material,{color:material.color.clone(),emissive:material.emissive.clone(),
          roughness:material.roughness,metalness:material.metalness});
      }
    });
    for(const part of BADGE_PARTS)if(!this.parts[part].length)throw new Error('GLB 缺少材质分组：'+part);
    this.surfaceDefaults=Object.fromEntries(BADGE_PARTS.map(part=>{
      const material=this.parts[part].find(m=>m.userData.role==='surface')??this.parts[part][0];
      return [part,this.originals.get(material)];
    }));
  }
  apply(parts) {
    for(const part of BADGE_PARTS) {
      const override=parts[part],surface=this.surfaceDefaults[part],tint=new THREE.Color(override.color);
      for(const material of this.parts[part]) {
        const original=this.originals.get(material);
        material.color.copy(original.color).multiply(tint);
        material.emissive.copy(original.emissive).multiply(tint);
        // Sidewalls and bevels reflect the studio, without an emissive halo.
        if(material.userData.role==='edge'||material.name.endsWith('_Edge'))material.emissive.setRGB(0,0,0);
        // Work from the original every time: no cumulative tint or roughness drift.
        material.roughness=THREE.MathUtils.clamp(original.roughness*override.roughness/surface.roughness,0,1);
        material.metalness=THREE.MathUtils.clamp(original.metalness*override.metalness/surface.metalness,0,1);
        material.envMapIntensity=override.envMapIntensity;
        // The exported outer sidewall is Body_Edge. Its bright HDR reflection
        // remains even with emission off; use a subdued brushed-metal finish.
        // Do not change the front/back surfaces or the star/text bevels.
        if(part==='Body'&&(material.userData.role==='edge'||material.name==='Body_Edge')) {
          material.color.multiplyScalar(.55);
          material.roughness=Math.max(.65,material.roughness);
          material.envMapIntensity=override.envMapIntensity*.12;
          material.clearcoat=0;
        }
      }
    }
  }
  setEnvironment(texture) {
    for(const material of this.originals.keys()){material.envMap=texture;material.needsUpdate=true;}
  }
}
