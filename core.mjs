import {poseGrid} from './sprite-sheet.mjs';
import {inspectPNG,pngBytes} from './png.mjs';
export function truncateText(value,limit=40){let out='';for(const char of String(value).toWellFormed()){if(out.length+char.length>limit)break;out+=char}return out}
export const ACTIONS = ['idle','happy','eating','sleeping'];
export const LABELS = {idle:'Idle',happy:'Happy',eating:'Eating',sleeping:'Sleeping'};
export const TRIGGERS = {manual:'手动 · Manual',idle:'随机待机 · Idle',click:'点击 · Click',hold:'长按 · Hold',drag:'拖动 · Drag'};
export const defaultTrigger=id=>id==='idle'?'idle':id==='happy'?'click':'manual';
export function chooseTriggeredAction(project,trigger,previous=null,random=Math.random){
 const all=actionIds(project).filter(id=>exportableAction(project,id)&&(project.actions[id].trigger??defaultTrigger(id))===trigger);
 const choices=all.length>1?all.filter(id=>id!==previous):all;
 return choices.length?choices[Math.min(choices.length-1,Math.floor(random()*choices.length))]:null;
}
export const MAX_FRAMES=32, MAX_ACTIONS=20;
export const actionIds=project=>Object.keys(project.actions);
const UI_LABELS={idle:'待机 · Idle',happy:'开心 · Happy',eating:'进食 · Eating',sleeping:'睡眠 · Sleeping'};
export const actionLabel=(project,id)=>{const name=project.actions[id]?.name;return !name||name===LABELS[id]?UI_LABELS[id]||'动画 · Animation':name};
export function newAction(id='custom',name=LABELS[id]||'New animation'){
 return {poseCount:6,name,trigger:defaultTrigger(id),frames:[],approved:false,referenceVersion:0,source:'empty',duration:1200,direction:'',lockStart:true,lockEnd:true,playback:id==='sleeping'?'state':id==='idle'?'loop':'once',loopStart:0,loopEnd:0,holds:[]};
}
export function emptyActions(){return Object.fromEntries(ACTIONS.map(id=>[id,newAction(id)]))}
export function anchorFrames(reference,middle){if(!reference?.approved)throw new Error('Approve your original character first.');if(middle.length!==6)throw new Error('Choose exactly 6 middle frames.');return [reference.image,...middle,reference.image]}
export function framesFromPoses(reference,poses,a){
 if(!reference?.approved)throw new Error('Approve your original character first.');
 const frames=[...(a.lockStart!==false?[reference.image]:[]),...poses,...(a.lockEnd!==false?[reference.image]:[])];
 if(frames.length<2||frames.length>MAX_FRAMES)throw new Error('Use 2–32 frames including any locked originals.');
 return {...a,frames,holds:frames.map(()=>1),approved:false,referenceVersion:reference.version,loopStart:0,loopEnd:frames.length-1};
}
export function replaceReference(project,image,styleNotes=''){const history=project.history||[];if(project.reference.empty)return {...project,reference:{image,approved:false,version:1,styleNotes:styleNotes.slice(0,500)},actions:emptyActions(),history:[]};return {...project,reference:{image,approved:false,version:project.reference.version+1,styleNotes:styleNotes.slice(0,500)},actions:emptyActions(),history:[{name:project.name,reference:project.reference,actions:project.actions},...history].slice(0,3)}}
const validId=id=>/^[a-z][a-z0-9_-]{0,47}$/.test(id)&&!['__proto__','prototype','constructor'].includes(id);
export function validateProject(p){
 if(!p||p.format!=='petform-project'||![1,2].includes(p.schemaVersion))throw new Error('This is not a supported Petform project.');
 if(p.reference?.empty&&(p.reference.approved||Object.values(p.actions||{}).some(a=>a.frames?.length)))throw new Error('An empty character cannot have approved artwork or animation frames.');
 const checked=new Set();const png=x=>{if(checked.has(x))return true;try{inspectPNG(pngBytes(x));checked.add(x);return true}catch{return false}};
 if(typeof p.name!=='string'||p.name.length>40||!png(p.reference?.image)||typeof p.reference.approved!=='boolean'||!Number.isInteger(p.reference.version)||p.reference.version<1)throw new Error('The character reference is invalid.');
 if(!p.actions||typeof p.actions!=='object'||Array.isArray(p.actions)||Object.keys(p.actions).length<1||Object.keys(p.actions).length>MAX_ACTIONS)throw new Error('Project animations are missing or exceed 20 actions.');
 const actions={};
 for(const [id,a] of Object.entries(p.actions)){
  if(!validId(id)||!a||!Array.isArray(a.frames)||(a.frames.length!==0&&(a.frames.length<2||a.frames.length>MAX_FRAMES))||!a.frames.every(png)||typeof a.approved!=='boolean')throw new Error('Invalid animation: '+id);
  const trigger=a.trigger??defaultTrigger(id);if(!Object.hasOwn(TRIGGERS,trigger))throw new Error('Invalid animation trigger: '+id);
  const n=a.frames.length,lockStart=a.lockStart??true,lockEnd=a.lockEnd??true;
  if(typeof lockStart!=='boolean'||typeof lockEnd!=='boolean')throw new Error('Invalid original-frame locks.');
  if(n&&((lockStart&&a.frames[0]!==p.reference.image)||(lockEnd&&a.frames[n-1]!==p.reference.image)||a.referenceVersion!==p.reference.version||!p.reference.approved))throw new Error('Animation anchors do not match the approved reference.');
  if(a.approved&&!n)throw new Error('An empty action cannot be approved.');
  const playback=a.playback??(id==='sleeping'?'state':id==='idle'?'loop':'once'),loopStart=a.loopStart??0,loopEnd=a.loopEnd??Math.max(0,n-1);
  if(!['once','loop','state'].includes(playback)||!Number.isInteger(loopStart)||!Number.isInteger(loopEnd)||loopStart<0||loopEnd<loopStart||loopEnd>=Math.max(1,n))throw new Error('Invalid loop range: '+id);
  if(a.holds!==undefined&&!Array.isArray(a.holds))throw new Error('Invalid frame timing: '+id);
  const holds=a.holds?.length?a.holds:a.frames.map(()=>1);
  if(!Array.isArray(holds)||holds.length!==n||holds.some(v=>!Number.isFinite(v)||v<0.25||v>8))throw new Error('Invalid frame timing: '+id);
  const poseCount=a.poseCount??6;poseGrid(poseCount);
  actions[id]={poseCount,trigger,name:typeof a.name==='string'?truncateText(a.name.trim())||LABELS[id]||'Animation':LABELS[id]||'Animation',frames:a.frames,approved:a.approved,referenceVersion:a.referenceVersion,source:['motion-study','imported','ai-generated','remixed','empty'].includes(a.source)?a.source:'imported',duration:Math.max(600,Math.min(6000,Number(a.duration)||1200)),direction:typeof a.direction==='string'?a.direction.slice(0,1000):'',lockStart,lockEnd,playback,loopStart,loopEnd,holds};
 }
 return {format:'petform-project',schemaVersion:2,name:truncateText(p.name),characterPrompt:typeof p.characterPrompt==='string'?p.characterPrompt.slice(0,1000):'',reference:{image:p.reference.image,empty:p.reference.empty===true,approved:p.reference.empty===true?false:p.reference.approved,version:p.reference.version,styleNotes:typeof p.reference.styleNotes==='string'?p.reference.styleNotes.slice(0,500):''},actions,history:[],updatedAt:typeof p.updatedAt==='string'?p.updatedAt:null};
}
export function exportableAction(project,id){const a=project.actions[id],n=a?.frames?.length;return !!(project.reference.approved&&a?.approved&&n>=2&&n<=MAX_FRAMES&&a.referenceVersion===project.reference.version&&(a.lockStart===false||a.frames[0]===project.reference.image)&&(a.lockEnd===false||a.frames[n-1]===project.reference.image))}
export function lockedFrame(a,i){return (i===0&&a.lockStart!==false)||(i===a.frames.length-1&&a.lockEnd!==false)}
export function frameDuration(a,i){return a.duration/a.frames.length*(a.holds?.[i]??1)}
export function nextFrame(a,frame,releasing=false){
 const last=a.frames.length-1;
 if(a.playback!=='once'&&frame===(a.loopEnd??last)&&!releasing)return a.loopStart??0;
 return frame<last?frame+1:null;
}
export function framePhase(a,i){return a.playback==='once'?'Play':i<a.loopStart?'Enter':i>a.loopEnd?'Exit':'Loop'}
// Remapping markers with their poses preserves the intended loop after a reorder.
export function editFrames(a,operation,index,target){
 const entries=a.frames.map((image,i)=>({image,hold:a.holds?.[i]??1,old:i}));
 if(!Number.isInteger(index)||index<0||index>=entries.length||lockedFrame(a,index))throw new Error('Unlock this original frame before editing it.');
 if(operation==='move'){
  if(!Number.isInteger(target)||target<0||target>=entries.length||lockedFrame(a,target))throw new Error('Keep locked originals at the ends.');
  entries.splice(target,0,entries.splice(index,1)[0]);
 }else if(operation==='repeat'){
  if(entries.length>=MAX_FRAMES)throw new Error('An animation can have up to 32 frames.');
  entries.splice(index+1,0,{...entries[index],old:-1});
 }else if(operation==='remove'){
  if(entries.length<=2)throw new Error('Keep at least two frames.');
  entries.splice(index,1);
 }else throw new Error('Unknown frame edit.');
 const locate=old=>{const found=entries.findIndex(e=>e.old===old);return found<0?Math.min(index,entries.length-1):found};
 const start=locate(a.loopStart),end=locate(a.loopEnd);
 return {...a,frames:entries.map(e=>e.image),holds:entries.map(e=>e.hold),loopStart:Math.min(start,end),loopEnd:Math.max(start,end),approved:false,source:'remixed'};
}

// Translate known UI messages without changing validation contracts or provider diagnostics.
const UI_MESSAGES={
 "Provider disconnected. Session keys cleared; dedicated OAuth credentials remain saved locally.": "已断开图像服务并清除会话密钥；独立的 OAuth 登录凭据仍保存在本地。",
 "Image model saved. Your ChatGPT sign-in stays connected.": "图像模型已保存，ChatGPT 登录保持连接。",
 "OpenClaw lists reference-image editing for this provider. Listed models are not proof of account access; generation tests that.": "此服务支持参考图编辑。模型列表不能确认账户权限，实际生成时才会验证。",
 "OpenClaw has not enabled reference-image editing for this provider.": "此服务尚未启用参考图编辑。",
 "No verified saved sheet matches this original and animation. Older images without action records are preserved but cannot be recovered automatically.": "没有与当前原图和动画匹配的已验证图集。缺少动画记录的旧图片仍保留在本地，但不能自动恢复。",
 "Configure the dedicated image provider first.": "请先连接图像服务。",
 "Configure the dedicated provider first.": "请先连接图像服务。",
 "The image service is unavailable. Your existing work is unchanged.": "图像服务暂时不可用，现有作品未被修改。",
 "An image is already generating. Please wait.": "图像正在生成，请稍候。",
 "A generation is already running.": "已有生成任务正在进行。",
 "Wait until generation completes.": "请等待生成完成。",
 "Wait until the current operation completes.": "请等待当前操作完成。",
 "Sign in with ChatGPT before saving an image model.": "请先登录 ChatGPT，再保存图像模型。",
 "Refresh the OpenClaw model list, then choose a listed model or Automatic.": "请刷新模型列表，然后选择可用模型或自动模式。",
 "Sign in with your ChatGPT account for Petform.": "请使用 ChatGPT 账户登录 Petform。",
 "Sign-in cancelled.": "已取消登录。",
 "Checking the Petform proxy…": "正在检查网络代理……",
 "Preparing browser sign-in…": "正在准备浏览器登录……",
 "Could not prepare Petform’s OAuth profile.": "无法准备 Petform 登录配置。",
 "Could not start OpenClaw OAuth.": "无法启动账户登录。",
 "OAuth stopped before sign-in completed. Please try again.": "登录过程已中断，请重试。",
 "Sign-in expired. Please try again.": "登录已超时，请重试。",
 "Open the OpenAI sign-in page and finish in your browser.": "请打开 OpenAI 登录页面，并在浏览器中完成登录。",
 "ChatGPT connected to Petform. Image generation has not yet been tested.": "ChatGPT 已连接到 Petform，尚未验证图像生成权限。",
 "Choose a supported image provider.": "请选择支持的图像服务。",
 "Choose Seedream 4.5.": "请选择 Seedream 4.5。",
 "Enter both Liblib keys.": "请填写 Liblib 的两项密钥。",
 "Use a model ID belonging to the selected provider.": "请输入属于当前服务商的模型 ID。",
 "Enter a valid provider API key.": "请输入有效的 API 密钥。",
 "Approve your original character first.": "请先确认角色原图。",
 "Unlock this original frame before editing it.": "请先解锁原图帧，再进行编辑。",
 "Keep locked originals at the ends.": "锁定的原图须保留在首尾两端。",
 "Keep at least two frames.": "请至少保留两帧。",
 "An animation can have up to 32 frames.": "每个动画最多支持 32 帧。",
 "Use 2–32 frames including any locked originals.": "包含锁定原图在内，动画需要 2–32 帧。",
 "This is not a supported Petform project.": "此文件不是支持的 Petform 项目。",
 "The character reference is invalid.": "角色参考图无效。",
 "Project animations are missing or exceed 20 actions.": "项目缺少动画数据，或动画数量超过 20 个。",
 "Animation anchors do not match the approved reference.": "动画首尾帧与已确认原图不匹配。",
 "Invalid animation trigger: ": "动画触发方式无效：",
 "Invalid animation: ": "动画数据无效：",
 "Invalid frame timing: ": "帧时长无效：",
 "Invalid loop range: ": "循环范围无效：",
 "Invalid original-frame locks.": "原图帧锁定设置无效。",
 "An empty action cannot be approved.": "空动画不能被确认。",
 "Choose 4, 6, 8 or 12 generated poses.": "请选择生成 4、6、8 或 12 个姿势。",
 "The generated sheet has unexpected proportions. It was saved locally for inspection.": "生成图集的比例不符，已保存到本地供检查。",
 "Generated sheet is too small.": "生成图集的尺寸过小。",
 "Describe your character in 3–1000 characters.": "请用 3–1000 个字符描述角色。",
 "Describe the repair in 3–1000 characters.": "请用 3–1000 个字符描述修改要求。",
 "Provider did not return a usable image.": "图像服务未返回可用图片。",
 "Image generation failed. Existing artwork is unchanged.": "图像生成失败，已保留现有作品。",
 "OpenClaw: authentication failed because ChatGPT sign-in expired or was rejected. Reconnect in Image provider settings.": "ChatGPT 登录已失效或被拒绝，请在图像服务设置中重新连接。",
 "OpenClaw: the image provider limit was reached. Try again when your allowance resets.": "图像服务额度已用完，请在额度恢复后重试。",
 "OpenClaw timed out while generating the image. Check the saved job before retrying.": "生成图像超时，请先检查已保存任务，再决定是否重试。",
 "OpenClaw timed out while checking available image models. The image request has not started.": "检查模型超时，尚未开始生成图像。",
 "Liblib request failed or timed out. A submission may already exist; do not automatically resubmit.": "Liblib 请求失败或超时，任务可能已提交。请先检查任务，避免重复生成。",
 "Liblib did not return a task ID. Check your account before submitting again.": "Liblib 未返回任务编号，请先检查账户任务，再决定是否重新提交。",
 "Liblib image upload failed. No generation request was submitted.": "Liblib 图片上传失败，尚未提交生成任务。",
 "Liblib returned HTTP ": "Liblib 返回 HTTP 状态码 ",
 "Liblib rejected the request (code ": "Liblib 拒绝请求（错误码 ",
 "Liblib image upload failed (HTTP ": "Liblib 图片上传失败（HTTP "
};
export function uiMessage(value){const message=String(value??'');for(const [source,target] of Object.entries(UI_MESSAGES)){if(message===source||message.startsWith(source))return target+message.slice(source.length)}return message}
