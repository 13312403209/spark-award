// Optional local development UI. Never mounted on the published site.
export function mountUnlockDebug(api) {
  if(!['localhost','127.0.0.1',''].includes(location.hostname)||!new URLSearchParams(location.search).has('debug')) return;
  const panel=document.createElement('details');panel.className='unlock-debug';panel.open=true;
  panel.innerHTML='<summary>动画调试</summary><div class="debug-buttons"><button data-action="replay">Replay</button><button data-action="reset">重置晶体</button><button data-action="inspect">读取状态</button><button data-action="audit">检查关键帧</button><button data-action="fallback">测试静态降级</button></div><label>预览阶段 <select id="debug-stage"><option value=".20">光点 0.20s</option><option value=".60">穿梭 0.60s</option><option value=".95">星芒 0.95s</option><option value="1.13">白闪 1.13s</option><option value="1.22">显现 1.22s</option><option value="2.65">完成 2.65s</option></select></label><button data-action="seek">定位</button><label><input id="debug-reduce" type="checkbox">减少动态效果（测试）</label><pre id="debug-report" aria-live="polite">准备就绪</pre>';
  document.body.append(panel);
  const report=panel.querySelector('#debug-report');
  const reportState=()=>{report.textContent=JSON.stringify({...api.inspect(),memory:api.memory()},null,2);};
  panel.addEventListener('click',async event=>{
    const button=/** @type {HTMLElement} */(event.target).closest('button');if(!button)return;
    const action=button.dataset.action;
    if(action==='fallback'){api.fallback();report.textContent='静态降级：完整奖励 UI 已显示。刷新恢复 WebGL。';return;}
    if(action==='replay')await window.playBadgeUnlock();
    if(action==='reset')await api.reset();
    if(action==='seek')api.seek(Number(/** @type {HTMLSelectElement} */(panel.querySelector('#debug-stage')).value));
    if(action==='audit') {
      const checks=[];
      const check=(name,ok)=>{checks.push({name,passed:!!ok});if(!ok)throw new Error(name);};
      try {
        await api.reset();const seq=api.sequence;const before=api.memory();
        seq.play();check('Single-click lock',seq.play()===false);
        for(const t of [.2,.6,.95,1.13,1.22,2.08,2.48,2.65]) {
          const info=api.seek(t);
          check('Shared centre '+t,Math.abs(info.centre.x-innerWidth/2)<1&&Math.abs(info.centre.y-innerHeight/2)<1);
          if(t===1.13)check('White peak',info.flash===1);
          if(t===1.22)check('Preloaded real badge under flash',seq.wrapper.visible&&seq.badge.children.length>0);
          if(t===2.48)check('Ready focus',document.activeElement.id==='confirm-award'&&!seq.confirm.disabled);
        }
        check('Exact duration',api.inspect().duration===2.65);
        check('Rendering restored',api.inspect().fov===34&&api.inspect().exposure===.91&&api.inspect().bloom===.1);
        for(let run=0;run<5;run++){seq.reset();seq.play();api.seek(2.65);}
        check('Five replays reuse resources',before.geometries===api.memory().geometries&&before.textures===api.memory().textures);
        check('Single canvas',document.querySelectorAll('canvas').length===1);
        check('Original badge scale',seq.badge.scale.x===.5);
        seq.reset();seq.reduced=true;seq.play();api.seek(.65);
        check('Reduced motion duration and no flash',api.inspect().duration===.65&&api.inspect().flash===0&&seq.props.warp===0);
        seq.reduced=seq.motion.matches;seq.reset();
        report.textContent=JSON.stringify({passed:true,checks},null,2);
      } catch(error) {report.textContent=JSON.stringify({passed:false,error:String(error),checks},null,2);}
      return;
    }
    reportState();
  });
  panel.querySelector('#debug-reduce').addEventListener('change',async event=>{
    await api.reset();api.sequence.reduced=/** @type {HTMLInputElement} */(event.target).checked||api.sequence.motion.matches;api.sequence.opening.sync(true,api.sequence.reduced);reportState();
  });
}
