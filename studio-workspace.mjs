import {actionIds,actionLabel,TRIGGERS} from './core.mjs';
const $=s=>document.querySelector(s);
const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n};
const button=(text,label,fn)=>{const b=node('button','button button-outline',text);b.type='button';b.setAttribute('aria-label',label);b.onclick=fn;return b};
export function organizeStudio({page,project,action,frame,selectAction,continueToPlayground}){
 $('.studio-actions')?.remove();
 const nav=node('div','studio-actions');nav.setAttribute('aria-label','动画 · Animations');
 for(const id of actionIds(project)){
  const b=button(actionLabel(project,id),actionLabel(project,id),()=>selectAction(id));
  b.className='studio-action'+(page==='animation'&&id===action?' active':'');
  b.setAttribute('aria-current',String(page==='animation'&&id===action));
  const dot=node('span','studio-dot',project.actions[id].approved?'✓':'○');b.prepend(dot);nav.append(b);
 }
 $('[data-page="animation"]').after(nav);
 if(page!=='animation')return;
 if(!$('#animation-stage'))return;
 const inspector=$('main .inspector'),grid=inspector.parentElement;
 grid.append(inspector);
 const generate=inspector.querySelector('.context-group');if(generate)generate.classList.add('studio-generation');
 const approve=$('#approve-action');
 if(approve){const footer=node('div','studio-approval');approve.textContent=project.actions[action].approved?'进入试玩 · Playground →':'确认并继续 · Approve →';footer.append(approve,node('p','fine-print','确认后的动画可在试玩区体验，也可导出。'));inspector.append(footer);approve.addEventListener('click',continueToPlayground);}
 const timeline=$('.timeline'),stageFoot=$('.stage-foot'),scroll=$('.timeline-scroll');
 if(scroll){
  const strip=node('div','studio-frame-strip');scroll.before(strip);
  const previous=button('◀','上一帧',()=>selectFrame(frame-1)),next=button('▶','下一帧',()=>selectFrame(frame+1));
  previous.disabled=frame===0;next.disabled=!project.actions[action].frames.length||frame===project.actions[action].frames.length-1;
  strip.append(previous,scroll,next);
  function selectFrame(index){document.querySelector('[data-frame="'+index+'"]')?.click();document.querySelector('[data-frame="'+index+'"]')?.scrollIntoView({block:'nearest',inline:'nearest'});}
  stageFoot.classList.add('studio-transport');
 }
}
