import {safeFrameOffset} from './sprite-sheet.mjs';

export function mountCanvasAlignment({host,image,reference,onion=false,locked,isCurrent,apply,onError}){
 const size=320,pad=64,extent=size+pad*2;
 let disposed=false,ready=false,drag=null,shift={x:0,y:0},bounds=null;
 const surface=document.createElement('canvas');surface.width=surface.height=extent;surface.className='alignment-canvas';surface.tabIndex=0;surface.setAttribute('aria-label','拖动当前帧对齐；方向键移动一像素，Shift 加方向键移动八像素，Esc 取消本次移动');
 const status=document.createElement('p');status.className='alignment-hint';status.setAttribute('role','status');status.textContent='正在准备画布……';
 host.replaceChildren(surface,status);const ctx=surface.getContext('2d');
 const source=new Image(),ghost=new Image();source.src=image;ghost.src=reference;
 const work=document.createElement('canvas');work.width=work.height=extent;const wx=work.getContext('2d');
 function paint(){
  if(!ready||disposed)return;wx.clearRect(0,0,extent,extent);wx.imageSmoothingEnabled=false;wx.drawImage(source,pad+shift.x,pad+shift.y);
  ctx.clearRect(0,0,extent,extent);ctx.imageSmoothingEnabled=false;
  if(onion){ctx.save();ctx.globalAlpha=.16;ctx.drawImage(ghost,pad,pad);ctx.restore()}ctx.drawImage(work,0,0);
  ctx.strokeStyle='rgba(101,115,68,.45)';ctx.lineWidth=2;ctx.setLineDash([2,8]);ctx.strokeRect(pad-1,pad-1,size+2,size+2);ctx.setLineDash([]);
  surface.dataset.offsetX=shift.x;surface.dataset.offsetY=shift.y;
 }
 function move(x,y){shift=safeFrameOffset(bounds,x,y);paint();status.textContent=shift.limited?'已到安全边缘，完整保留耳朵、脚和配件。':'拖动对齐；方向键微调，Esc 取消本次移动。';}
 function commit(){
  if(!ready||disposed||locked||!isCurrent()||(!shift.x&&!shift.y))return;
  const out=document.createElement('canvas');out.width=out.height=size;const ox=out.getContext('2d');ox.imageSmoothingEnabled=false;ox.drawImage(work,pad,pad,size,size,0,0,size,size);
  apply(out.toDataURL('image/png'));
 }
 const cancel=()=>{surface.classList.remove('dragging');if(drag&&surface.hasPointerCapture(drag.id))surface.releasePointerCapture(drag.id);drag=null;shift={x:0,y:0};paint();status.textContent=locked?'此帧是锁定原图，请先解锁或选择其他帧。':'拖动调整位置；方向键微调，可撤销。';};
 surface.onpointerdown=e=>{if(!ready||locked||!isCurrent()||e.button!==0)return;e.preventDefault();surface.focus({preventScroll:true});const r=surface.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:{...shift},scale:extent/r.width};surface.setPointerCapture(e.pointerId);surface.classList.add('dragging')};
 surface.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;move(drag.start.x+(e.clientX-drag.x)*drag.scale,drag.start.y+(e.clientY-drag.y)*drag.scale)};
 surface.onpointerup=e=>{if(!drag||drag.id!==e.pointerId)return;surface.releasePointerCapture(e.pointerId);drag=null;surface.classList.remove('dragging');commit()};
 surface.onpointercancel=()=>{surface.classList.remove('dragging');cancel()};
 surface.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();cancel();return}const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!direction||!ready||locked||!isCurrent())return;e.preventDefault();const step=e.shiftKey?8:1;move(shift.x+direction[0]*step,shift.y+direction[1]*step)};
 surface.onkeyup=e=>{if(e.key.startsWith('Arrow')){e.preventDefault();commit()}};
 surface.onblur=()=>{if(!drag)commit()};
 Promise.all([source.decode(),ghost.decode()]).then(()=>{
  if(disposed||!isCurrent())return;if(source.naturalWidth!==size||source.naturalHeight!==size)throw new Error('此实验需要 320 × 320 的动画帧。');
  wx.drawImage(source,0,0);const data=wx.getImageData(0,0,size,size).data;let left=size,top=size,right=-1,bottom=-1;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(data[(y*size+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}
  if(right<0)throw new Error('此帧没有可移动的图像。');bounds={left,top,right,bottom};ready=true;surface.dataset.ready='true';surface.setAttribute('aria-disabled',String(locked));cancel();
 }).catch(error=>{if(!disposed){status.textContent=error.message;onError?.(error)}});
 return ()=>{disposed=true;surface.onblur=null;surface.onpointerdown=surface.onpointermove=surface.onpointerup=surface.onpointercancel=surface.onkeydown=surface.onkeyup=null};
}
