/** A single reusable media element; the host sequence owns its animation. */
export class BadgeOpeningVideo {
  constructor(src,timeoutMs=12000) {
    this.disposed=false;this.loaded=false;this.failed=false;
    this.abort=new AbortController();
    this.element=document.createElement('div');this.element.className='unlock-opening';this.element.setAttribute('aria-hidden','true');
    this.surface=document.createElement('div');this.surface.className='unlock-opening-surface';
    this.video=document.createElement('video');
    this.video.muted=true;this.video.defaultMuted=true;this.video.loop=true;this.video.playsInline=true;this.video.preload='auto';
    this.video.disablePictureInPicture=true;this.video.tabIndex=-1;this.video.setAttribute('aria-hidden','true');
    this.surface.append(this.video);this.element.append(this.surface);
    const options={signal:this.abort.signal};
    this.ready=new Promise(resolve=>{
      let settled=false;
      const finish=(loaded)=>{if(settled)return;settled=true;clearTimeout(deadline);this.loaded=loaded;resolve(loaded);};
      const fail=()=>{this.failed=true;this.pause();this.element.hidden=true;finish(false);};
      // This deadline bounds resource loading only; animation timing stays in GSAP.
      const deadline=setTimeout(fail,timeoutMs);
      this.video.addEventListener('loadeddata',()=>finish(true),{...options,once:true});
      this.video.addEventListener('error',fail,options);
      this.abort.signal.addEventListener('abort',()=>finish(false),{once:true});
    });
    this.video.src=src;this.video.load();
  }
  sync(idle,reduced) {
    if(this.disposed)return;
    if(!idle||reduced||document.hidden||!this.loaded||this.failed) {this.video.pause();return;}
    // Autoplay rejection leaves a usable first frame and never blocks unlocking.
    this.video.play().catch(()=>{});
  }
  reset(reduced) {
    if(this.disposed)return;
    this.element.hidden=this.failed;
    if(this.loaded)this.video.currentTime=0;
    this.sync(true,reduced);
  }
  pause() {this.video.pause();}
  hide() {this.pause();this.element.hidden=true;}
  dispose() {
    if(this.disposed)return;
    this.disposed=true;this.pause();this.abort.abort();
    this.video.removeAttribute('src');this.video.load();this.element.remove();
  }
}
