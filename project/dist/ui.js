const dateElement = /** @type {HTMLTimeElement} */ (document.querySelector('#award-date'));
const shareButton = /** @type {HTMLButtonElement} */ (document.querySelector('#share-award'));
const confirmButton = /** @type {HTMLButtonElement} */ (document.querySelector('#confirm-award'));
const status = /** @type {HTMLElement} */ (document.querySelector('#action-status'));
const message = '您的模型累计被打印 100,000 次! 恭喜获得「星火奖」';
let dateTimer;
let statusTimer;
// Display the viewer's current local date, regardless of prior award visits.
function obtainedDate(){return localDate(new Date());}

export function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return { machine: `${year}-${month}-${day}`, display: `${year}.${month}.${day}` };
}

function refreshDate() {
  const now = new Date();
  const today = obtainedDate();
  dateElement.dateTime = today.machine;
  dateElement.textContent = today.display;
  clearTimeout(dateTimer);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  dateTimer = setTimeout(refreshDate, tomorrow.getTime() - now.getTime() + 100);
}

function announce(text) {
  clearTimeout(statusTimer);
  status.textContent = text;
  status.setAttribute('data-last-message',text);
  statusTimer = setTimeout(() => { status.textContent = ''; }, 5000);
}

async function awardImage() {
  const snapshot = window.badgePresentation?.snapshot();
  if (!snapshot) return null;
  const card = document.createElement('canvas');
  card.width = 1080;
  card.height = 1440;
  const ctx = card.getContext('2d');
  const glow = ctx.createRadialGradient(540, 160, 0, 540, 260, 1120);
  glow.addColorStop(0, '#242424');
  glow.addColorStop(.5, '#0c0c0c');
  glow.addColorStop(1, '#050505');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, card.width, card.height);
  const cropWidth = Math.min(snapshot.width, snapshot.height * 1.2);
  const scale = Math.min(960 / cropWidth, 800 / snapshot.height);
  const width = cropWidth * scale;
  const height = snapshot.height * scale;
  ctx.drawImage(snapshot, (snapshot.width - cropWidth) / 2, 0, cropWidth, snapshot.height, (1080 - width) / 2, 55 + (800 - height) / 2, width, height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4f4f6';
  ctx.font = '500 60px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.fillText('星火奖', 540, 940);
  ctx.fillStyle = '#b9b9bf';
  ctx.font = '400 32px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.fillText('您的模型累计被打印 100,000 次!', 540, 1022);
  ctx.fillStyle = '#d8d8de';
  ctx.fillText('恭喜获得「星火奖」', 540, 1077);
  ctx.fillStyle = '#92929c';
  ctx.font = '400 27px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.fillText(`获得日期  ${obtainedDate().display}`, 540, 1163);
  // Synchronous encoding also works in offline/in-app previews where toBlob can stall.
  const binary=atob(card.toDataURL('image/png').split(',')[1]);
  return new Blob([Uint8Array.from(binary,char=>char.charCodeAt(0))],{type:'image/png'});
}

shareButton.addEventListener('click', async () => {
  if (shareButton.disabled) return;
  shareButton.disabled = true;
  shareButton.setAttribute('aria-busy', 'true');
  try {
    const blob = await awardImage();
    if (blob) {
      const file = new File([blob], `星火奖-${obtainedDate().machine}.png`, { type: 'image/png' });
      const localPreview=['localhost','127.0.0.1',''].includes(location.hostname);
      if (!localPreview && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: '星火奖', text: message, files: [file] });
        shareButton.setAttribute('data-last-action','native-image');
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        document.body.append(link);
        link.click();
        link.remove();
        shareButton.setAttribute('data-last-action','image-download');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        announce('分享图片已保存');
      }
    } else if (navigator.share) {
      await navigator.share({ title: '星火奖', text: `${message}\n获得日期：${obtainedDate().display}` });
      shareButton.setAttribute('data-last-action','native-text');
    } else {
      const text=`${message}\n获得日期：${obtainedDate().display}`;
      if(navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);announce('分享文字已复制');
      } else {
        const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
        const link=document.createElement('a');link.href=url;link.download='星火奖.txt';document.body.append(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),60000);announce('分享文字已保存');
      }
    }
  } catch (error) {
    shareButton.setAttribute('data-last-action',error.name==='AbortError'?'cancelled':'error');
    if (error.name !== 'AbortError') announce('暂时无法分享，请稍后再试');
  } finally {
    shareButton.disabled = false;
    shareButton.removeAttribute('aria-busy');
  }
});

confirmButton.addEventListener('click', () => {
  if(confirmButton.disabled)return;
  window.badgePresentation?.reset();
  window.badgePresentation?.close?.();
  confirmButton.classList.add('is-confirmed');
  confirmButton.querySelector('span').textContent = '已确认';
  confirmButton.querySelector('svg').removeAttribute('hidden');
  confirmButton.setAttribute('aria-label', '已确认');
  announce('已确认');
});

document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDate(); });
refreshDate();

window.addEventListener('badgeawarded',refreshDate);
