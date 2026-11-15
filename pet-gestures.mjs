// One pointer gesture produces one intent; hold/drag never also dispatch a click.
export function bindPetGestures(element,{start,finish,click,dragTarget=element,dragBounds=()=>({minX:-100,maxX:100,minY:-80,maxY:80})},clock=globalThis){
 let pointer=null,holdTimer=null,suppressClick=false,offset={x:0,y:0};
 const clamp=(x,y)=>{const b=dragBounds();return {x:Math.max(b.minX,Math.min(b.maxX,x)),y:Math.max(b.minY,Math.min(b.maxY,y))}};
 const paint=position=>{dragTarget.style.transform=`translate(${position.x}px,${position.y}px)`};
 const clear=()=>{if(holdTimer!==null)clock.clearTimeout(holdTimer);holdTimer=null};
 const down=e=>{if(e.button!==0||pointer)return;suppressClick=false;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,kind:null};element.setPointerCapture(e.pointerId);holdTimer=clock.setTimeout(()=>{if(pointer){pointer.kind='hold';suppressClick=true;start('hold')}},450)};
 const move=e=>{if(!pointer||e.pointerId!==pointer.id)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
  if(!pointer.kind&&Math.hypot(dx,dy)<6)return;
  if(pointer.kind!=='drag'&&Math.hypot(dx,dy)>=6){clear();if(pointer.kind==='hold')finish();pointer.kind='drag';suppressClick=true;start('drag')}
  if(pointer.kind==='drag')paint(clamp(offset.x+dx,offset.y+dy));
 };
 const up=e=>{if(!pointer||e.pointerId!==pointer.id)return;clear();const old=pointer;pointer=null;if(old.kind==='drag'){offset=clamp(offset.x+e.clientX-old.x,offset.y+e.clientY-old.y);paint(offset)}if(old.kind)finish();if(e.type!=='pointerup')suppressClick=true;if(element.hasPointerCapture(e.pointerId))element.releasePointerCapture(e.pointerId)};
 const clicked=e=>{if(e.detail===0||!suppressClick)click();suppressClick=false};
 const handlers={pointerdown:down,pointermove:move,pointerup:up,pointercancel:up,lostpointercapture:up,click:clicked};
 for(const [type,fn] of Object.entries(handlers))element.addEventListener(type,fn);
 const dispose=()=>{clear();pointer=null;for(const [type,fn] of Object.entries(handlers))element.removeEventListener(type,fn)};dispose.constrain=()=>{offset=clamp(offset.x,offset.y);paint(offset)};return dispose;
}
