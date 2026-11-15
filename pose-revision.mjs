import {openMotionDialog,closeMotionDialog} from './contextual-workspace.mjs';
import {lockedFrame} from './core.mjs';

// Binary selection: copy complete RGBA pixels only inside the marked region.
export function compositeMarked(original, candidate, mask) {
 if(original.length!==candidate.length||original.length!==mask.length||original.length%4)throw new Error('修复前后的像素尺寸必须一致。');
 const result=new Uint8ClampedArray(original);
 for(let i=0;i<result.length;i+=4)if(mask[i+3])result.set(candidate.subarray(i,i+4),i);
 return result;
}
export function replaceSelectedPose(action,index,image){
 if(!Number.isInteger(index)||index<0||index>=action.frames.length||lockedFrame(action,index))throw new Error('请选择未锁定的姿势进行修复。');
 const frames=[...action.frames];frames[index]=image;
 return {...action,frames,holds:[...action.holds],approved:false,source:'remixed'};
}

export async function openPoseRevision({image,request,isCurrent,apply}){
 const dialog=document.createElement('dialog');dialog.className='pose-revision';
 dialog.innerHTML=`<header><div><span class="eyebrow">逐帧编辑 · FRAME EDITOR</span><h2>编辑细节 · Edit details</h2></div><button id="rev-close" class="icon-button" aria-label="关闭编辑">×</button></header>
 <p>标记需要修复的区域，描述修改，并对比确认效果。</p>
 <div class="revision-controls"><div class="revision-option"><span>修改范围 · Scope</span><div class="pixel-segments" role="group" aria-label="修改范围 · Scope"><button type="button" data-rev-scope="marked" aria-pressed="true">选区</button><button type="button" data-rev-scope="frame" aria-pressed="false">整帧</button></div><select id="rev-scope" hidden aria-label="修改范围"><option value="marked">选区</option><option value="frame">整帧</option></select></div><div class="revision-option"><span>标记工具 · Tool</span><div class="pixel-segments" role="group" aria-label="标记工具 · Tool"><button type="button" data-rev-tool="brush" aria-pressed="true">画笔</button><button type="button" data-rev-tool="box" aria-pressed="false">框选</button></div><select id="rev-tool" hidden aria-label="标记工具"><option value="brush">画笔</option><option value="box">框选</option></select></div><label>笔刷大小 · Size <input id="rev-size" type="range" min="4" max="80" value="24"></label><button id="rev-undo">撤销</button><button id="rev-clear">清空</button></div>
 <div class="revision-images"><figure><figcaption>修改前 · Before</figcaption><canvas id="rev-mark" width="320" height="320" aria-label="Mark the area to revise using the mouse or touch. Choose whole selected frame to revise without drawing."></canvas></figure><figure><figcaption>预览效果 · After</figcaption><img id="rev-after" alt="Revision preview"></figure></div>
 <label class="field"><span class="field-label">需要修改什么 · What should change?</span><textarea id="rev-prompt" class="input" maxlength="1000" placeholder="例如：修复耳朵轮廓，保持表情、姿势和位置不变。"></textarea></label>
 <p id="rev-status" role="status">仅替换标记区域的像素，其他帧不变。AI 提供修复方案，Petform 保留周围像素。</p>
 <footer><button id="rev-generate" class="button button-dark" disabled title="试玩版可检查选区和画笔，AI 修复未启用">AI 修复 · 完整版</button><button id="rev-apply" class="button button-olive" disabled>应用此帧</button></footer><p class="fine-print">试玩版可以体验选区、画笔与修改描述；AI 修复未启用。关闭即可返回编辑。应用后需重新确认动作，可在当前帧工具中撤销。局部修复保持位置和比例不变；调整位置请回到画布直接拖动。</p>`;
 document.body.append(dialog);const $=s=>dialog.querySelector(s),surface=$('#rev-mark'),ctx=surface.getContext('2d'),base=document.createElement('canvas'),mask=document.createElement('canvas');
 base.width=mask.width=320;base.height=mask.height=320;const bx=base.getContext('2d'),mx=mask.getContext('2d');
 let candidate=null,pending=false,stroke=null,history=[];const original=new Image();original.src=image;try{await original.decode()}catch(e){dialog.remove();throw e}bx.drawImage(original,0,0,320,320);$('#rev-after').src=image;
 const active=()=>dialog.isConnected&&dialog.open;
 const invalidate=()=>{candidate=null;$('#rev-apply').disabled=true;$('#rev-after').src=image};
 const draw=()=>{ctx.clearRect(0,0,320,320);ctx.drawImage(base,0,0);ctx.globalAlpha=.45;ctx.drawImage(mask,0,0);ctx.globalAlpha=1};
 const point=e=>{const r=surface.getBoundingClientRect();return {x:Math.max(0,Math.min(320,(e.clientX-r.left)*320/r.width)),y:Math.max(0,Math.min(320,(e.clientY-r.top)*320/r.height))}};
 const mark=(a,b)=>{mx.strokeStyle=mx.fillStyle='#ef6fa9';mx.lineWidth=+$('#rev-size').value;mx.lineCap='round';mx.beginPath();mx.moveTo(a.x,a.y);mx.lineTo(b.x,b.y);mx.stroke();mx.beginPath();mx.arc(b.x,b.y,mx.lineWidth/2,0,Math.PI*2);mx.fill()};
 surface.onpointerdown=e=>{if(pending||$('#rev-scope').value!=='marked')return;e.preventDefault();invalidate();$('#rev-status').textContent='仅修改标记像素，周围像素和其他帧保持不变。';const pixels=mx.getImageData(0,0,320,320);history.push(pixels);if(history.length>20)history.shift();stroke={start:point(e),last:point(e),pixels};surface.setPointerCapture(e.pointerId);if($('#rev-tool').value==='brush')mark(stroke.start,stroke.start);draw()};
 surface.onpointermove=e=>{if(!stroke)return;const p=point(e);if($('#rev-tool').value==='box'){mx.putImageData(stroke.pixels,0,0);mx.fillStyle='#ef6fa9';mx.fillRect(Math.min(p.x,stroke.start.x),Math.min(p.y,stroke.start.y),Math.abs(p.x-stroke.start.x),Math.abs(p.y-stroke.start.y))}else mark(stroke.last,p);stroke.last=p;draw()};
 surface.onpointerup=surface.onpointercancel=()=>{stroke=null};
 $('#rev-undo').onclick=()=>{if(pending)return;const p=history.pop();if(p){mx.putImageData(p,0,0);invalidate();draw()}};
 $('#rev-clear').onclick=()=>{if(pending)return;history.push(mx.getImageData(0,0,320,320));mx.clearRect(0,0,320,320);invalidate();draw()};
 $('#rev-prompt').oninput=invalidate;
 $('#rev-scope').onchange=()=>{invalidate();$('#rev-status').textContent=$('#rev-scope').value==='marked'?'仅替换标记区域的像素，其他帧保持不变。':'所选帧的整体图像可能改变，其他帧保持不变。';surface.style.cursor=$('#rev-scope').value==='marked'?'crosshair':'default'};
 for(const kind of ['scope','tool'])for(const button of dialog.querySelectorAll('[data-rev-'+kind+']'))button.onclick=()=>{
  if(pending)return;const select=$('#rev-'+kind);select.value=button.dataset[kind==='scope'?'revScope':'revTool'];
  dialog.querySelectorAll('[data-rev-'+kind+']').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));select.dispatchEvent(new Event('change'));
 };
 $('#rev-close').onclick=()=>closeMotionDialog(dialog);dialog.onclose=()=>dialog.remove();
 $('#rev-generate').onclick=async()=>{
  if(pending)return;const direction=$('#rev-prompt').value.trim(),scope=$('#rev-scope').value,selection=mx.getImageData(0,0,320,320);
  if(direction.length<3){$('#rev-status').textContent='请用至少 3 个字描述修复需求。';return}
  if(scope==='marked'&&!selection.data.some((v,i)=>i%4===3&&v)){ $('#rev-status').textContent='请先标记区域，或选择整帧修复。';return }
  if(!isCurrent()){$('#rev-status').textContent='此帧已更改，请关闭并重新打开修复。';return}
  invalidate();pending=true;dialog.querySelectorAll('input,select,textarea,footer button,.revision-controls button').forEach(el=>el.disabled=true);$('#rev-status').textContent='正在生成修复预览……可能需要 3 分钟。';
  try{
   const maskCanvas=document.createElement('canvas');maskCanvas.width=maskCanvas.height=320;const mm=maskCanvas.getContext('2d');mm.fillStyle='black';mm.fillRect(0,0,320,320);const pixels=mm.getImageData(0,0,320,320);for(let i=0;i<pixels.data.length;i+=4)if(selection.data[i+3])pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;mm.putImageData(pixels,0,0);
   const result=await request({pose:image,direction,scope,...(scope==='marked'?{mask:maskCanvas.toDataURL()}: {})});
   if(!active())return;if(!isCurrent())throw new Error('此帧已更改，修复未应用。');
   const c=document.createElement('canvas');c.width=c.height=320;const cx=c.getContext('2d');cx.imageSmoothingEnabled=false;cx.drawImage(result,0,0,320,320);
   if(scope==='marked')cx.putImageData(new ImageData(compositeMarked(bx.getImageData(0,0,320,320).data,cx.getImageData(0,0,320,320).data,selection.data),320,320),0,0);
   candidate=c.toDataURL();$('#rev-after').src=candidate;$('#rev-status').textContent='请对比结果，应用前不会改变原图。'+(scope==='marked'?'标记外的像素保持不变。':'仅替换当前帧。');
  }catch(e){if(active())$('#rev-status').textContent=e.message}
  finally{pending=false;if(active()){dialog.querySelectorAll('input,select,textarea,footer button,.revision-controls button').forEach(el=>el.disabled=false);$('#rev-apply').disabled=!candidate}}
 };
 $('#rev-apply').onclick=()=>{if(!candidate||pending)return;if(!isCurrent()){$('#rev-status').textContent='此帧已更改，请关闭并重新打开修复。';return}apply(candidate);closeMotionDialog(dialog)};
 draw();openMotionDialog(dialog);$('#rev-close').focus({preventScroll:true});
}
