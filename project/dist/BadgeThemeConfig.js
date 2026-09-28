// One GLB, one animation, four independently tunable PBR regions.
// color is an sRGB tint multiplied by the original GLB base color/gradient.
// roughness / metalness are surface values; edge and reverse differences survive.
export const BADGE_THEME_CONFIG = {
  version: 1,
  model: './assets/Spark_Award.glb',
  displayHeight: 3.4,
  hdri: './assets/environment/spark-studio.hdr',
  // ACES preserves the existing opening's grading. AgX is also supported.
  rendering: {toneMapping:'ACES',exposure:.91},
  theme: 'silver',
  themes: {
    silver: {
      Body:   {color:'#ffffff',roughness:.270,metalness:1,envMapIntensity:1.00},
      Star:   {color:'#ffffff',roughness:.225,metalness:1,envMapIntensity:.90},
      Text:   {color:'#ffffff',roughness:.205,metalness:1,envMapIntensity:1.00},
      Recess: {color:'#eeeeee',roughness:.430,metalness:1,envMapIntensity:.78},
    },
    gold: {
      Body:   {color:'#e8c98b',roughness:.270,metalness:1,envMapIntensity:1.00},
      Star:   {color:'#ffe3a9',roughness:.225,metalness:1,envMapIntensity:.95},
      Text:   {color:'#ffe9bd',roughness:.205,metalness:1,envMapIntensity:1.00},
      Recess: {color:'#b99a60',roughness:.450,metalness:1,envMapIntensity:.78},
    },
    blue: {
      Body:   {color:'#7faedc',roughness:.290,metalness:.95,envMapIntensity:1.00},
      Star:   {color:'#c4e6ff',roughness:.240,metalness:1,envMapIntensity:.95},
      Text:   {color:'#e0f0ff',roughness:.220,metalness:1,envMapIntensity:1.00},
      Recess: {color:'#476f9c',roughness:.460,metalness:.92,envMapIntensity:.78},
    },
    black: {
      Body:   {color:'#535963',roughness:.310,metalness:.95,envMapIntensity:1.10},
      Star:   {color:'#a3adb9',roughness:.250,metalness:1,envMapIntensity:1.00},
      Text:   {color:'#c7cfd8',roughness:.240,metalness:1,envMapIntensity:1.00},
      Recess: {color:'#303640',roughness:.490,metalness:.90,envMapIntensity:.78},
    },
  },
};
