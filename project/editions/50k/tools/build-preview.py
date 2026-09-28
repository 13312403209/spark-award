from pathlib import Path
import json,re,base64,zipfile
root=Path(__file__).resolve().parents[1];dist=root/'threejs';out=root/'preview';out.mkdir(exist_ok=True)
sources={}
for file in dist.rglob('*.js'):
    if file.name=='gsap.min.js':continue
    source=file.read_text()
    def rewrite(match):
        quote,spec=match.group(1),match.group(2)
        if spec.startswith('.'):
            target=(file.parent/spec).resolve()
            assert target.is_file(),target
            spec='site:'+target.relative_to(dist).as_posix()
        return 'from '+quote+spec+quote
    source=re.sub(r'from\s+([\x22\x27])([^\x22\x27]+)\1',rewrite,source)
    if file.name=='BadgeUnlockConfig.js':
        media='data:video/mp4;base64,'+base64.b64encode((dist/'assets/intro-loop.mp4').read_bytes()).decode()
        assert "'./assets/intro-loop.mp4'" in source, "Opening video path missing"
        source=source.replace("'./assets/intro-loop.mp4'",json.dumps(media))
    sources['site:'+file.relative_to(dist).as_posix()]=source
assets={'./'+p.relative_to(dist).as_posix():p.read_text() for p in (dist/'assets').rglob('*.svg')}
binary_assets={}
for relative,mime in [('assets/Spark_Award_50K.glb','model/gltf-binary'),('assets/environment/spark-studio.hdr','image/vnd.radiance')]:
    binary_assets['./'+relative]='data:'+mime+';base64,'+base64.b64encode((dist/relative).read_bytes()).decode()
def safe_json(x):return json.dumps(x,ensure_ascii=False).replace('<','\\u003c')
bootstrap='''<script>
const moduleSources=MODULE_SOURCES;
globalThis.__badgeAssets=BADGE_ASSETS;
globalThis.__badgeBinaryAssets=BADGE_BINARY_ASSETS;
const imports={};
for(const [name,source] of Object.entries(moduleSources)) imports[name]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
imports.three=imports['site:vendor/three/three.module.js'];
for(const name of Object.keys(imports)) if(name.startsWith('site:vendor/three/addons/')) imports[name.replace('site:vendor/three/','three/')]=imports[name];
const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);
const main=document.createElement('script');main.type='module';main.textContent="import 'site:app.js'; import 'site:ui.js';";document.body.append(main);
</script>'''.replace('MODULE_SOURCES',safe_json(sources)).replace('BADGE_ASSETS',safe_json(assets)).replace('BADGE_BINARY_ASSETS',safe_json(binary_assets))
html=(dist/'index.html').read_text()
html=re.sub(r'<script type="importmap">.*?</script>','',html,flags=re.S)
html=html.replace('<link rel="stylesheet" href="./style.css">','<style>'+(dist/'style.css').read_text()+'</style>')
html=html.replace('<script type="module" src="./app.js"></script>','').replace('<script type="module" src="./ui.js"></script>','')
html=html.replace('<script src="./vendor/gsap.min.js"></script>','<script>'+(dist/'vendor/gsap.min.js').read_text().replace('</script','<\\/script')+'</script>')
for asset in (dist/'assets').rglob('*.svg'):
    data='data:image/svg+xml;base64,'+base64.b64encode(asset.read_bytes()).decode()
    html=html.replace('src="./'+asset.relative_to(dist).as_posix()+'"','src="'+data+'"')
html=html.replace('</body>',bootstrap+'\n</body>')
assert not re.search(r'(?:src|href)="\./',html.split('<script>')[0])
preview=out/'50k星火奖预览.html';preview.write_text(html)
lab=(dist/'badge-lab.html').read_text()
lab=re.sub(r'<script type="importmap">.*?</script>','',lab,flags=re.S)
lab=lab.replace('<link rel="stylesheet" href="./badge-lab.css">','<style>'+(dist/'badge-lab.css').read_text()+'</style>')
lab=lab.replace('<script type="module" src="./badge-lab.js"></script>','')
lab=lab.replace('href="./index.html"','href="./50k星火奖预览.html"')
lab=lab.replace('<a href="./badge-svg-lab.html">原 SVG 编辑器 ↗</a>','')
lab=lab.replace('替换 GLB 后可直接重载。','此离线版内嵌当前 GLB；替换文件后需重新生成预览。')
lab_bootstrap=bootstrap.replace("import 'site:app.js'; import 'site:ui.js';","import 'site:badge-lab.js';")
lab=lab.replace('</body>',lab_bootstrap+'\n</body>')
(out/'50k徽章材质调试.html').write_text(lab)
with zipfile.ZipFile(out/'50k源码.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in dist.rglob('*'):
        if p.is_file():z.write(p,p.relative_to(dist))
print(json.dumps({'preview':str(preview),'bytes':preview.stat().st_size,'embeddedModules':len(sources),'offlineGSAP':True},ensure_ascii=False))
