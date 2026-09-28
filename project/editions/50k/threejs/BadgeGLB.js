import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BadgeThemeController, BADGE_THEME_NAMES, normalizeThemeSettings } from './BadgeThemes.js';

function disposeModel(root) {
  const geometries=new Set(),materials=new Set(),textures=new Set(),images=new Set();
  root?.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[])materials.add(material);
  });
  for(const material of materials)for(const [key,value] of Object.entries(material))if(key!=='envMap'&&value?.isTexture)textures.add(value);
  for(const texture of textures){if(texture.image)images.add(texture.image);texture.dispose();}
  for(const image of images)image.close?.();
  for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
}

/** Meter-sized source stays intact inside a normalized display group.
 * The existing unlock sequence and drag/rotation controls animate this outer group.
 */
export class BadgeGLB extends THREE.Group {
  constructor(settings) {
    super();this.name='Spark Award GLB presentation';this.settings=normalizeThemeSettings(settings);
    this.content=new THREE.Group();this.content.name='GLB display normalization';this.add(this.content);
    this.source=null;this.themeController=null;this.environment=null;this.loadGeneration=0;this.disposed=false;
  }
  async load({reload=false}={}) {
    if(this.disposed)throw new Error('模型已释放。');
    const generation=++this.loadGeneration;
    const embedded=globalThis.__badgeBinaryAssets?.[this.settings.model];
    const url=embedded??(reload?this.settings.model+'?reload='+Date.now():this.settings.model);
    const gltf=await new GLTFLoader().loadAsync(url);
    if(this.disposed||generation!==this.loadGeneration){disposeModel(gltf.scene);return this;}
    const source=gltf.scene;
    try {
      source.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(source),size=bounds.getSize(new THREE.Vector3());
      if(!Number.isFinite(size.y)||size.y<=0)throw new Error('GLB 包围盒无效。');
      const controller=new BadgeThemeController(source);
      controller.apply(this.settings.themes[this.settings.theme]);
      if(this.environment)controller.setEnvironment(this.environment);
      const previous=this.source;
      this.content.clear();this.content.position.copy(bounds.getCenter(new THREE.Vector3())).multiplyScalar(-this.settings.displayHeight/size.y);
      this.content.scale.setScalar(this.settings.displayHeight/size.y);this.content.add(source);
      this.source=source;this.themeController=controller;disposeModel(previous);
      this.userData.source=this.settings.model;this.userData.sourceSizeMeters=size.toArray();
      this.updateMatrixWorld(true);
      return this;
    } catch(error) {disposeModel(source);throw error;}
  }
  reload(){return this.load({reload:true});}
  setTheme(name) {
    name=String(name).toLowerCase();if(!BADGE_THEME_NAMES.includes(name))throw new Error('未知主题：'+name);
    this.settings.theme=name;this.themeController?.apply(this.settings.themes[name]);return name;
  }
  setSettings(settings) {
    this.settings=normalizeThemeSettings(settings);this.themeController?.apply(this.settings.themes[this.settings.theme]);
  }
  getSettings(){return normalizeThemeSettings(this.settings);}
  setEnvironment(texture) {this.environment=texture;this.themeController?.setEnvironment(texture);}
  createRevealSheen(material) {
    const root=new THREE.Group();root.name='GLB reveal sheen';
    root.position.copy(this.position);root.quaternion.copy(this.quaternion);root.scale.copy(this.scale);
    this.updateWorldMatrix(true,true);const inverse=this.matrixWorld.clone().invert();
    this.source.getObjectByName('Body')?.traverse(object=>{
      if(!object.isMesh)return;
      const mesh=new THREE.Mesh(object.geometry,material);
      mesh.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld));
      mesh.renderOrder=30;root.add(mesh);
    });
    // Geometry is shared with Body, so the animation disposes only its own material.
    return root;
  }
  dispose(){if(this.disposed)return;this.disposed=true;++this.loadGeneration;disposeModel(this.source);this.content.clear();this.source=null;this.themeController=null;}
}
