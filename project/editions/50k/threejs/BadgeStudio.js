import * as THREE from 'three';

export function buildBadgeEnvironment(renderer, scene) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color('#686868');
  function softbox(w, h, position, color, intensity) {
    const light = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    light.position.set(...position);
    light.lookAt(0, 0, 0);
    studio.add(light);
  }
  // Long, narrow studio panels produce real moving highlight lines on the bevels.
  softbox(0.65, 9, [-4, 2, 5], '#ffffff', 5.5);
  softbox(0.3, 8, [4.1, 0.3, 3.8], '#ffffff', 7);
  softbox(7, 0.4, [0, 5, 2.8], '#ffffff', 6);
  softbox(6, 5.5, [-0.5, 1, 6.5], '#ffffff', 1.3);
  softbox(3, 5.5, [4.8, 1, -2.5], '#ffffff', 1.4);
  softbox(1, 5, [-4, -1, -3], '#ffffff', 1.8);
  softbox(6, 1, [0, -4, 3], '#ffffff', 1.2);
  softbox(6, 5, [0, 2, -6], '#ffffff', 1.6);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(studio, 0.025, 0.1, 100);
  scene.environment = environmentTarget.texture;
  studio.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  pmrem.dispose();
  const hemisphere=new THREE.HemisphereLight('#ffffff', '#707070', 0.75);scene.add(hemisphere);
  const key = new THREE.DirectionalLight('#ffffff', 1.8);
  key.position.set(-3.5, 5, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#ffffff', 0.7);
  fill.position.set(4, 1, 2.5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#ffffff', 1.35);
  rim.position.set(1, 3, -4);
  scene.add(rim);
  return { dispose() { scene.environment=null; environmentTarget.dispose(); for(const light of [key,fill,rim,hemisphere]) {scene.remove(light);light.dispose();} } };
}

