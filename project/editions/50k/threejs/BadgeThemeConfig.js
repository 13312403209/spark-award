// 50k only. White multipliers preserve the GLB lime body and colored gradients.
export const BADGE_THEME_CONFIG = {
  "version": 1,
  "model": "./assets/Spark_Award_50K.glb",
  "displayHeight": 3.4,
  "hdri": "./assets/environment/spark-studio.hdr",
  "rendering": {
    "toneMapping": "ACES",
    "exposure": 0.91
  },
  "theme": "green",
  "themes": {
    "green": {
      "Body": {
        "color": "#ffffff",
        "roughness": 0.27,
        "metalness": 1,
        "envMapIntensity": 1
      },
      "Star": {
        "color": "#ffffff",
        "roughness": 0.225,
        "metalness": 1,
        "envMapIntensity": 0.9
      },
      "Text": {
        "color": "#ffffff",
        "roughness": 0.205,
        "metalness": 1,
        "envMapIntensity": 1
      },
      "Recess": {
        "color": "#ffffff",
        "roughness": 0.43,
        "metalness": 1,
        "envMapIntensity": 0.78
      }
    }
  }
};
