import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { BADGE_THEME_CONFIG } from './BadgeThemeConfig.js';

export function configureBadgeColorManagement(renderer) {
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=BADGE_THEME_CONFIG.rendering.toneMapping==='AgX'?THREE.AgXToneMapping:THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=BADGE_THEME_CONFIG.rendering.exposure;
}

/** A model-only HDRI. The opening glass and other effects retain their environment. */
export async function buildGLBEnvironment(renderer,url) {
  const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();
  let hdr;
  try {
    hdr=await new HDRLoader().loadAsync(globalThis.__badgeBinaryAssets?.[url]??url);
    hdr.mapping=THREE.EquirectangularReflectionMapping;
    const target=pmrem.fromEquirectangular(hdr);
    target.texture.name='Spark neutral studio HDRI / PMREM';
    return {texture:target.texture,dispose(){target.dispose();}};
  } finally {hdr?.dispose();pmrem.dispose();}
}
