import {organizeStudio} from './studio-workspace.mjs';
import {organizeContextualWorkspace,createAnimationTabTransition,animateUI,openMotionDialog,closeMotionDialog,animateTabSelection,compactActionLabel,createFrameWheelHandler} from './contextual-workspace.mjs';
import {mountCanvasAlignment} from './animation-review.mjs';
import {bindPetGestures} from './pet-gestures.mjs';
import {POSE_COUNTS,poseGrid,gridCells,opaqueBounds,stableAnimationTransform,requirePoseCellSeparation} from './sprite-sheet.mjs';
import {openPoseRevision,replaceSelectedPose} from './pose-revision.mjs';
import {openProviderSettings} from './provider-ui.mjs';
import {removeBackground,prepareGeneratedPixels} from './background.mjs';
import {demoPNG,demoFrames} from './pixel-art.mjs';
import {uiMessage,TRIGGERS,defaultTrigger,chooseTriggeredAction,ACTIONS,LABELS,emptyActions,replaceReference,validateProject,exportableAction,actionIds,actionLabel,newAction,framesFromPoses,lockedFrame,editFrames,nextFrame,frameDuration,framePhase,MAX_FRAMES,MAX_ACTIONS,truncateText} from './core.mjs';
import {PET_SIZE,fitPetBounds,assessPetStyle,importPreviewSize} from './style-baseline.mjs';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const KEY='petform.public-mochi-demo.v1';
let page='character', action='idle', frame=0, playing=false, compare=false, raf=0, lastTick=0, speed=1, dirty=false, toastTimer, taskBusy=false;
let previewRelease=false,playbackSession=null;
let onionVisible=false,alignmentCleanup=null,tabTransition=null;
const generationWarnings=new WeakMap();
const actionUndo=new Map();
const deletedActions=[];
let gestureCleanup=null,idleRotationTimer=0,lastIdleAction='idle';
let playState='idle', quiet=false, crumbs=false, focusUntil=0, playgroundTimer=0;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canvas=(w=320,h=320)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
function demo(){return demoPNG()}

let project={format:'petform-project',schemaVersion:2,name:'Mochi',characterPrompt:'',reference:{image:demo(),approved:true,version:1,styleNotes:''},actions:Object.fromEntries(ACTIONS.map(id=>[id,{...newAction(id),frames:[demo(),...demoFrames(id).slice(1,7),demo()],approved:true,referenceVersion:1,source:"motion-study",loopEnd:7,holds:Array(8).fill(1)}])),history:[],updatedAt:null};
let loadError='';
try{const saved=localStorage.getItem(KEY);if(saved){const raw=JSON.parse(saved);const restored=validateProject(raw);await decodeProjectImages(restored);project=restored;project.history=(Array.isArray(raw.history)?raw.history:[]).slice(0,3).filter(h=>{try{validateProject({...raw,...h,history:[]});return true}catch{return false}})}}catch{loadError='无法读取已保存的项目，浏览器中的原有数据未被覆盖。'}
const phaseLabel=(a,i)=>({Play:'播放 · Play',Enter:'进入 · Enter',Exit:'退出 · Exit',Loop:'循环 · Loop'}[framePhase(a,i)]);
function toast(message){$('#toast').textContent=uiMessage(message);$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4200)}
function markDirty(){dirty=true;$('#save-status').textContent='有未保存的修改'}
function names(){ $('#side-name').textContent=project.name;$('.project-avatar').textContent=project.name.slice(0,1).toLowerCase()||'m'}
function save(){try{project.updatedAt=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(project));dirty=false;$('#save-status').textContent='已保存在此浏览器';toast('项目已保存在本地。')}catch{toast('浏览器存储已满或不可用，请导出 JSON 备份项目。');$('#save-status').textContent='保存失败，请导出 JSON'}}
function stop(){tabTransition?.cancel();document.body?.removeAttribute('data-playing');gestureCleanup?.();gestureCleanup=null;clearInterval(idleRotationTimer);playing=false;playbackSession=null;cancelAnimationFrame(raf);clearTimeout(playgroundTimer)}
function go(next){if(project.reference.empty&&next!=='character'){toast('请先上传或生成角色。');return}stop();page=next;frame=0;compare=false;playState='idle';crumbs=false;focusUntil=0;render();$('#main').focus({preventScroll:true});void animateUI($('#main'),[{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],250)}
function intro(n,title,sub){return '<section class="intro"><div><span class="eyebrow">创作空间 · WORKSPACE / '+String(n).padStart(2,'0')+'</span><h1>'+title+'</h1><p>'+sub+'</p></div><div class="step-indicator">'+[1,2,3].map(i=>'<span class="'+(n===i?'current':'')+'"></span>').join('')+'<small>步骤 '+n+' / 3</small></div></section>'}
function referenceMini(){return '<div class="ref-mini"><img src="'+project.reference.image+'" alt="已确认原图 · Original"><div><b>'+esc(project.name)+' · Original</b><small>版本 '+project.reference.version+' · '+(project.reference.approved?'原图已确认':'等待确认')+'</small>'+(project.reference.styleNotes?'<small>保留特征：'+esc(project.reference.styleNotes)+'</small>':'')+'</div></div>'}
function cards(){return '<div class="bottom-cards"><div class="mini-card"><span class="mini-icon">◈</span><div><b>从第一帧开始 · Yours from the first frame</b><p>每个新动作都以确认过的原图为参考。</p></div></div><div class="mini-card"><span class="mini-icon">↺</span><div><b>熟悉的归途 · A familiar way back</b><p>设置动作如何开始、循环和结束。</p></div></div><div class="mini-card"><span class="mini-icon">✳</span><div><b>留一点小个性 · Room for little quirks</b><p>微调细节，留下喜欢的瞬间。</p></div></div></div>'}
function characterPage(){
const r=project.reference;
return intro(1,'创建角色 · Create your character','上传图片，或描述一个新角色。确认形象后，再制作动画。')+
'<div class="work-grid"><section class="panel"><div class="panel-head"><h2>角色原图 · Your original character</h2><span class="pill '+(r.approved?'locked':'pink')+'">'+(r.empty?'○ 尚无角色':r.approved?'✓ 原图已确认':'◌ 等待你确认')+'</span></div><div class="stage" id="drop-zone"><span class="stage-label">原图 · ORIGINAL / V'+String(r.version).padStart(2,'0')+'</span><span class="stage-corner">像素预览 · 320 × 320 PNG</span><div class="stage-inner">'+(r.empty?'<p class="empty-character">从这里创建你的新宠物。<br>上传图片，或描述角色 →</p>':'<img class="pet-image" src="'+r.image+'" alt="'+esc(project.name)+' original character">')+'</div><span class="stage-caption">小生命，从这里开始</span></div><div class="stage-foot"><p><span class="small-circle">✳</span><strong>'+esc(project.name)+'</strong> &nbsp;·&nbsp; '+(r.empty?'添加第一个角色':r.approved?'已确认的原图':'原图等待确认')+'</p><button class="text-button" id="replace-image">'+(r.empty?'上传图片 · Upload':'替换图片 · Replace')+'</button></div></section>'+
'<aside class="panel inspector"><h2>认识你的小伙伴 · Meet your little one.</h2><p class="muted">为它起个名字，确认这就是你想要的模样。</p><label class="field"><span class="field-label">角色名称 · Character name</span><input id="pet-name" class="input" maxlength="40" value="'+esc(project.name)+'" placeholder="给你的小伙伴起个名字"></label><button class="upload-area" id="upload-image"><div class="upload-icon">↥</div><strong>上传角色 · Upload</strong><span>按 Ctrl+V 粘贴 · 支持 PNG、JPEG、WebP · 最大 8 MB</span></button><div class="rule"></div><label class="field"><span class="field-label">角色描述 · Description</span><textarea id="character-prompt" class="input prompt-input" maxlength="1000" placeholder="一只圆圆的小兔子，粉色耳朵，带着好奇的微笑……">'+esc(project.characterPrompt||'')+'</textarea></label><button class="button button-dark full" id="generate-character">生成角色 · Generate</button><p id="character-ai-status" class="fine-print" role="status">检查生成图片和去背效果后，再设为原图。生成会消耗图像服务额度。</p><div class="rule"></div><div class="check-item"><span class="check-icon">↳</span><span>可将原图设为首帧或尾帧，角色参考图会始终保留。</span></div><div class="check-item"><span class="check-icon">◇</span><span>修改会创建新版本，之前的作品保留在版本历史中。</span></div><button class="button button-olive full" id="approve-reference">'+(r.approved?'制作动画 · Animate →':'确认原图 · Approve →')+'</button><p class="fine-print">导入和基础去背在浏览器内完成；AI 生成会将描述发送给已连接的图像服务。</p>'+
(project.history.length?'<div class="rule"></div><span class="field-label">历史版本 · Earlier versions</span>'+project.history.map((h,i)=>'<div class="version-row"><span>原图 v'+h.reference.version+' · '+esc(h.name)+'</span><button data-restore="'+i+'">恢复 · Restore</button></div>').join(''):'')+'</aside></div>'+cards();
}
function animationPage(){
 const a=project.actions[action],has=a.frames.length>0,n=a.frames.length,last=n-1,locked=has&&lockedFrame(a,frame);
 frame=Math.min(frame,Math.max(0,last));
 const modes=[['once','播放一次 · Once'],['loop','持续循环 · Loop'],['state','进入 → 循环 → 退出']];
 const options=Array.from({length:n},(_,i)=>'<option value="'+i+'">'+(i+1)+'</option>').join('');
 const sourceOptions=actionIds(project).flatMap(id=>project.actions[id].frames.map((_,i)=>'<option value="'+id+':'+i+'">'+esc(actionLabel(project,id))+' · '+(i+1)+'</option>')).join('');
 return intro(2,'制作动画 · Make it move','描述动作并生成草稿，播放检查后再调整细节。')+
 '<div class="action-tabs" role="group" aria-label="Animation actions">'+actionIds(project).map(id=>'<button class="action-tab '+(id===action?'active ':'')+(project.actions[id].approved?'reviewed':'')+'" data-action="'+id+'"><span class="action-dot"></span>'+esc(actionLabel(project,id))+'</button>').join('')+'<button class="action-tab" id="new-action">＋ 新动画 · New</button></div>'+
 '<div class="work-grid"><section class="panel"><div class="panel-head"><h2>'+esc(actionLabel(project,action))+' · 动画预览</h2><span class="pill '+(a.approved?'locked':'pink')+'">'+(a.approved?'✓ 已确认':has?'◌ 等待检查':'○ 尚无姿势')+'</span></div>'+
 '<div class="stage" id="animation-stage"><span class="stage-label">'+(has?'动画预览 · ANIMATION':'以原图开始创作')+'</span><span class="stage-corner" id="frame-counter">'+(has?'帧 '+(frame+1)+' / '+n:'参考图 V'+project.reference.version)+'</span><div class="stage-inner" id="animation-pet"><img id="anim-image" class="pet-image" src="'+(has?a.frames[frame]:project.reference.image)+'" alt="Animation preview"></div><span class="stage-caption" id="phase-label">'+(has?phaseLabel(a,frame)+' · '+(a.playback==='state'?'进入一次，循环至松开，再退出':'预览 · Preview'):'同一个角色，更多新动作。')+'</span></div>'+
 '<div class="stage-foot"><div class="playbar"><button class="button button-outline" id="play-animation" data-playback="play" aria-label="播放动画 · Play" '+(!has?'disabled':'')+'>播放 · Play</button><select class="speed" id="speed" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option></select><button class="button button-outline" id="preview-exit" '+(!has||a.playback==='once'?'disabled':'')+'>退出动作 · Exit</button></div><button class="text-button" id="compare" '+(!has?'disabled':'')+'>对比原图 · Compare</button></div>'+
 '<div class="timeline"><div class="timeline-header"><b>逐帧动作 · Timeline</b><span>'+n+' 帧 · '+Number(a.lockStart+ a.lockEnd)+' 帧锁定原图</span></div><div class="frames editable-frames">'+a.frames.map((src,i)=>'<button class="frame '+(lockedFrame(a,i)?'anchor ':'')+(i===frame?'active':'')+'" data-frame="'+i+'" draggable="'+!lockedFrame(a,i)+'" aria-label="帧 '+(i+1)+', '+phaseLabel(a,i)+(lockedFrame(a,i)?', 已锁定原图':'')+'"><img src="'+src+'" alt=""><small>'+(lockedFrame(a,i)?'◆ ':'')+(i+1)+' · '+phaseLabel(a,i)+'</small></button>').join('')+'</div>'+
 (has?'<p class="fine-print">拖动姿势排序，或选中帧后使用箭头。绿色帧已锁定为原图。</p><div class="frame-tools"><button id="frame-left" '+(locked||frame===0?'disabled':'')+' aria-label="Move frame left">←</button><button id="frame-right" '+(locked||frame===last?'disabled':'')+' aria-label="Move frame right">→</button><button id="frame-repeat" '+(locked||n>=MAX_FRAMES?'disabled':'')+'>复制 · Duplicate</button><button id="frame-remove" '+(locked||n<=2?'disabled':'')+'>删除 · Delete</button><button id="frame-repair" '+(locked?'disabled':'')+'>修复 · Repair</button><button id="frame-original" '+(locked?'disabled':'')+'>使用原图 · Original</button><label>停留 · Hold <select id="frame-hold" aria-label="Selected frame hold">'+[0.5,1,2,3,4,8].map(v=>'<option value="'+v+'">'+v+'×</option>').join('')+'</select></label></div><div class="frame-tools"><select id="frame-source" aria-label="Pose to reuse">'+sourceOptions+'</select><button id="frame-reuse" '+(locked?'disabled':'')+'>使用姿势 · Use pose</button></div>':'<p class="muted">生成或导入姿势，开始编辑时间轴。</p>')+
 '<button class="text-button" id="undo-animation" '+(!actionUndo.get(action)?.length?'disabled':'')+'>撤销修改 · Undo</button></div></section>'+
 '<aside class="panel inspector"><h2>你的动画 · Animation</h2>'+referenceMini()+'<label class="field"><span class="field-label">动画名称 · Animation name</span><input id="action-name" class="input" maxlength="40" value="'+esc(actionLabel(project,action))+'"></label><button class="text-button" id="duplicate-action">复制动画 · Duplicate</button>'+
 (!project.reference.approved?'<div class="callout">制作动画前，请先确认角色原图。</div><button class="button button-olive full" id="back-character">确认原图 · Approve →</button>':
 '<div class="review-list"><label><input type="checkbox" id="lock-start" '+(a.lockStart?'checked':'')+'> 首帧锁定为原图</label><label><input type="checkbox" id="lock-end" '+(a.lockEnd?'checked':'')+'> 尾帧锁定为原图</label></div><label class="field"><span class="field-label">播放方式 · Playback</span><select id="playback-mode" class="input">'+modes.map(([value,label])=>'<option value="'+value+'" '+(value===a.playback?'selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
 (a.playback!=='once'&&has?'<div class="loop-controls"><label>循环起点 <select id="loop-start" aria-label="Loop first frame">'+options+'</select></label><label>终点 <select id="loop-end" aria-label="Loop last frame">'+options+'</select></label></div><p class="fine-print">循环前的帧在进入时播放一次；循环后的帧在唤醒或停止时播放一次。单帧循环会保持该姿势。</p>':'')+
 (action==='sleeping'&&has?'<button class="button button-outline full" id="sleep-preset">将中间姿势设为呼吸循环</button>':'')+
 '<label class="field"><span class="field-label">基础时长 · Duration · <span id="duration-label">'+(a.duration/1000).toFixed(1)+'s</span> / 整段动作</span><input type="range" id="duration" min="600" max="6000" step="100" value="'+a.duration+'"><span class="field-hint">可单独延长每个姿势的停留时间。</span></label>'+
 '<label class="field"><span class="field-label">动作描述 · '+esc(actionLabel(project,action))+'</span><textarea id="animation-direction" class="input prompt-input" maxlength="1000" placeholder="闭上眼睛，慢慢安静下来，然后在睡梦中轻轻呼吸……">'+esc(a.direction||'')+'</textarea><span class="field-hint">描述动作及需要保留的身体特征；生成时生效，不改变现有帧。局部修改请使用标记修复。</span></label>'+
 '<label class="field"><span class="field-label">触发方式 · When to play</span><select id="animation-trigger" class="input">'+Object.entries(TRIGGERS).map(([id,label])=>'<option value="'+id+'" '+((a.trigger??defaultTrigger(action))===id?'selected':'')+'>'+label+'</option>').join('')+'</select><span class="field-hint">待机会每 8 秒随机选择已确认的动画。点击播放一次；长按 0.45 秒或拖动时循环，松开后播放结束动作。多个匹配动作随机选择，仍可手动触发。试玩和新导出的 Windows 应用均支持。</span></label>'+
 '<label class="field"><span class="field-label">AI 生成姿势 · AI-generated poses</span><select id="pose-count" class="input">'+POSE_COUNTS.map(n=>'<option value="'+n+'" '+((a.poseCount??6)===n?'selected':'')+'>'+n+' 个姿势 · '+(n+Number(a.lockStart)+Number(a.lockEnd))+' 帧总计</option>').join('')+'</select><span class="field-hint">用于下一次生成。每个锁定原图增加一帧；同一图集中姿势越多，细节可能越少。</span></label><button class="button button-olive full" id="build-motion">本地动作 · Local motion</button><button class="button button-dark full" id="generate-ai">'+((has?'重新生成':'生成')+(a.poseCount??6)+' 个姿势 · Generate')+'</button><button class="button button-outline full" id="recover-ai">恢复图集 · Recover</button><button class="text-button" id="check-ai">图像服务 · Provider</button><p id="ai-status" class="fine-print" role="status"></p><button class="button button-outline full" id="import-frames">导入姿势 · Import</button><p class="fine-print">选中未锁定帧可标记并修复细节。恢复已保存图集会在本地修正构图，无需再次生成。重新生成会替换时间轴，可撤销；导入后可重新排序，锁定原图保留在两端。</p><p class="action-source">AI 会将原图和当前姿势发送给图像服务，并消耗账户额度。</p>'+
 '<div class="rule"></div><span class="field-label">一致性检查 · Your consistency check</span><div class="review-list"><label><input type="checkbox" id="check-identity" '+(a.approved?'checked':'')+' '+(!has?'disabled':'')+'> 各帧中的角色保持一致</label><label><input type="checkbox" id="check-loop" '+(a.approved?'checked':'')+' '+(!has?'disabled':'')+'> 进入、循环和结束衔接自然</label></div><button class="button button-dark full" id="approve-action" '+(!has||!a.approved?'disabled':'')+'>'+(a.approved?'✓ 已确认 · try it →':'确认动画 · Approve')+'</button>')+'</aside></div>';
}
function playgroundPage(){
return intro(3,'试玩宠物 · Try your pet','通过点击、长按和拖动，试玩已确认的动画。')+
'<div class="work-grid"><section class="panel"><div class="panel-head"><h2>桌面试玩 · Desktop preview</h2><span class="pill">互动试玩 · SANDBOX</span></div><div class="stage playground-stage"><span class="stage-label">你好，'+esc(project.name.toUpperCase())+'</span><span class="stage-corner">本地预览</span><div class="stage-inner"><div class="speech" id="speech">你好呀。</div><button id="pet-touch" class="pet-touch" aria-label="Pet your character"><img id="play-pet" class="pet-image" src="'+project.reference.image+'" alt="'+esc(project.name)+' in the playground"><span id="crumb" class="crumb hidden">•</span></button><span id="little-food" class="little-food hidden">🍪</span><button id="napkin" class="napkin hidden" aria-label="Drag napkin onto character to wipe, or press Enter">▱</button></div><span class="stage-caption">试试你设置的点击、长按和拖动手势</span></div><div class="stage-foot"><p id="activity-status"><span class="small-circle">♡</span>悠闲地发一会儿呆。</p><span class="pill" id="focus-clock">慢慢来</span></div></section>'+
'<aside class="panel inspector"><h2>一起做点小事 · Little things, together.</h2><p class="muted">用几个小互动，感受角色的个性。</p>'+referenceMini()+'<div class="activity-buttons"><button id="pet-action">抚摸 · Pet</button><button id="feed-action">喂食 · Feed</button></div><div class="activity-buttons"><button id="sleep-action">睡眠 · Sleep</button><button id="focus-action">专注 · Focus</button></div><div class="activity-buttons">'+actionIds(project).filter(id=>exportableAction(project,id)).map(id=>'<button data-play-custom="'+id+'">'+esc(actionLabel(project,id))+'</button>').join('')+'</div><button class="text-button" id="release-custom">结束动作 · Finish</button><div class="callout"><b>吃点零食，再擦擦嘴。</b>喂食后，把纸巾拖到角色身上擦掉碎屑。也可用键盘选中纸巾并按回车。</div><div class="rule"></div><div class="routine"><span>安静陪伴 · Quiet company</span><button id="quiet-toggle" role="switch" aria-checked="'+quiet+'" class="toggle '+(quiet?'on':'')+'" aria-label="安静陪伴 · Quiet company"></button></div><p class="fine-print">专注演示持续 30 秒，不监控窗口、不发送通知，也不修改系统。</p><button id="to-animations" class="button button-outline full">← 调整动画 · Refine</button><p class="fine-print">'+actionIds(project).filter(id=>project.actions[id].approved).length+' / '+actionIds(project).length+' 个动画已确认。 示例还包含预设动作；导出仅包含已确认的动画。</p></aside></div>'+cards();
}
function render(){tabTransition?.cancel();alignmentCleanup?.();alignmentCleanup=null;compare=false;if(!project.actions[action])action=actionIds(project)[0];
 names();$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('#main').innerHTML=page==='character'?characterPage():page==='animation'?animationPage():playgroundPage();
 organizeWorkspace();if(page==='character')bindCharacter();if(page==='animation')bindAnimation();if(page==='playground')bindPlayground();
 enhanceDemo();if(document.body?.dataset.interface==='studio')organizeStudio({page,project,action,frame,selectAction:selectAnimationTab,continueToPlayground:()=>{if(!taskBusy&&project.actions[action].approved)go('playground')}});
}
// Compose task groups before binding the existing controls; no project data changes.
const disclosureState=new Map();
function organizeWorkspace(){
 if(!$('main .inspector'))return;
 organizeContextualWorkspace({page,project,action,frame,disclosureState});
}
function bindCharacter(){
 $('#pet-name').addEventListener('input',e=>{project.name=truncateText(e.target.value.trim())||'Untitled';names();markDirty()});
 $('#character-prompt').addEventListener('input',e=>{project.characterPrompt=e.target.value;markDirty()});
 $('#generate-character').onclick=generateStartingCharacter;
 $('#replace-image').onclick=$('#upload-image').onclick=()=>$('#character-file').click();
 $('#approve-reference').disabled=!!project.reference.empty;
 $('#approve-reference').onclick=()=>{if(project.reference.empty)return;if(!project.reference.approved){project.reference.approved=true;markDirty();toast('原图已确认，开始制作第一个动作吧。')}go('animation')};
 $('#drop-zone').ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='copy'};
 $('#drop-zone').ondrop=e=>{e.preventDefault();if(e.dataTransfer.files.length)loadCharacter(e.dataTransfer.files[0])};
 $$('[data-restore]').forEach(b=>b.onclick=async()=>{const owner=project;const h=project.history[Number(b.dataset.restore)];if(!h)return;let restored;try{restored=validateProject({...project,...h});await decodeProjectImages(restored)}catch(e){toast('无法恢复版本：'+uiMessage(e.message));return}if(owner!==project)return;const current={name:project.name,reference:project.reference,actions:project.actions};actionUndo.clear();deletedActions.length=0;action='idle';project={...restored,history:[current,...project.history.filter(x=>x!==h)].slice(0,3)};markDirty();render();toast('已恢复历史原图和对应动画。')});
}
function loadImage(src){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('无法解码此 PNG 图片。'));i.src=src})}
async function decodeProjectImages(value){
 for(const src of new Set([value.reference.image,...Object.values(value.actions).flatMap(a=>a.frames)]))await loadImage(src);
}
async function readPNG(file){
 if(!file||file.size>4*1024*1024||!(/\.png$/i.test(file.name)))throw new Error('请选择小于 4 MB 的 PNG 图片。');
 const sig=new Uint8Array(await file.slice(0,8).arrayBuffer());if(sig.join(',')!=='137,80,78,71,13,10,26,10')throw new Error('此文件不是有效的 PNG 图片。');
 const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('无法读取文件。'));r.readAsDataURL(file)});
 const im=await loadImage(src);if(im.width>8192||im.height>8192)throw new Error('图片单边不能超过 8192 像素。');
 const c=canvas(),x=c.getContext('2d'),s=Math.min(320/im.width,320/im.height);x.imageSmoothingEnabled=false;x.drawImage(im,(320-im.width*s)/2,(320-im.height*s)/2,im.width*s,im.height*s);return c.toDataURL('image/png');
}
async function loadCharacter(file){return prepareCharacter(file)}
function editAction(change){
 if(taskBusy){toast('请等待当前操作完成。');return}
 const previous=project.actions[action],draft={...previous,frames:[...previous.frames],holds:[...(previous.holds||previous.frames.map(()=>1))]};
 try{const next=change(draft)||draft;rememberAction(action,previous);project.actions[action]={...next,approved:false};if(generationWarnings.has(previous))generationWarnings.set(project.actions[action],generationWarnings.get(previous));stop();frame=Math.min(frame,Math.max(0,next.frames.length-1));markDirty();render()}catch(e){render();toast(e.message)}
}
function rememberAction(id,a){const list=actionUndo.get(id)||[];list.push(a);actionUndo.set(id,list.slice(-20))}
function addAnimation(duplicate=false){
 if(taskBusy)return;if(actionIds(project).length>=MAX_ACTIONS){toast('每个项目最多支持 20 个动画。');return}
 const id='custom_'+crypto.randomUUID().replaceAll('-','').slice(0,16),source=project.actions[action];
 project.actions[id]=duplicate?{...source,name:truncateText(actionLabel(project,action)+' 副本'),frames:[...source.frames],holds:[...source.holds],approved:false}:newAction(id,'新动画 · New');
 stop();action=id;frame=0;markDirty();render();document.querySelector('[data-action="'+id+'"]')?.ondblclick?.();
}
function removeAnimation(id){
 if(taskBusy)return;const ids=actionIds(project);if(ids.length<=1){toast('请至少保留一个动画。');return}if(!project.actions[id])return;
 deletedActions.push({id,value:project.actions[id],index:ids.indexOf(id),undo:actionUndo.get(id)});if(deletedActions.length>20)deletedActions.shift();
 project.actions=Object.fromEntries(Object.entries(project.actions).filter(([key])=>key!==id));actionUndo.delete(id);stop();
 if(action===id){action=actionIds(project)[Math.min(ids.indexOf(id),ids.length-2)];frame=0}
 markDirty();render();toast('动画已删除，可在标签栏撤销。');
}
function restoreAnimation(){
 if(taskBusy||!deletedActions.length)return;if(actionIds(project).length>=MAX_ACTIONS){toast('动画数量已满，请先删除一个动画再恢复。');return}
 const item=deletedActions.pop(),entries=Object.entries(project.actions);entries.splice(Math.min(item.index,entries.length),0,[item.id,item.value]);project.actions=Object.fromEntries(entries);if(item.undo)actionUndo.set(item.id,item.undo);stop();action=item.id;frame=0;markDirty();render();toast('已恢复删除的动画。');
}
function installPoses(id,reference,poses,source){
 const old=project.actions[id],next=framesFromPoses(reference,poses,old);
 next.source=source;
 if(next.playback==='state'){next.loopStart=Math.floor((poses.length-1)/2)+Number(next.lockStart);next.loopEnd=Math.ceil((poses.length-1)/2)+Number(next.lockStart)}
 rememberAction(id,old);project.actions[id]=next;
}
function setPlaybackControl(){const b=$('#play-animation');if(!b)return;const changed=b.dataset.playback!==(playing?'pause':'play');b.dataset.playback=playing?'pause':'play';b.textContent=playing?'暂停 · Pause':'播放 · Play';b.setAttribute('aria-label',playing?'暂停动画 · Pause':'播放动画 · Play');if(changed)void animateUI(b,[{opacity:.6,transform:'scale(.9)'},{opacity:1,transform:'scale(1)'}],250)}
function selectAnimationTab(id){
 if(!project.actions[id])return;
 if(page!=='animation'){stop();action=id;go('animation');return}
 if(action===id){tabTransition?.cancel();return}
 const previousTab=document.querySelector('.animation-browser-tab.active')?.getBoundingClientRect();
 const ids=actionIds(project),direction=ids.indexOf(id)>ids.indexOf(action)?1:-1;
 stop();
 tabTransition??=createAnimationTabTransition({getPreview:()=>$('#animation-pet')});
 tabTransition.switchTo(()=>{action=id;frame=0;render();queueMicrotask(()=>animateTabSelection(previousTab));document.querySelector('[data-action="'+id+'"]')?.focus({preventScroll:true})},direction);
}
function bindAnimation(){
 $$('[data-action]').forEach(b=>b.onclick=()=>selectAnimationTab(b.dataset.action));
 $('#new-action').onclick=()=>addAnimation();$('#duplicate-action').onclick=()=>addAnimation(true);
 $$('[data-delete-action]').forEach(b=>b.onclick=()=>removeAnimation(b.dataset.deleteAction));
 const restore=$('#restore-action');if(restore){restore.hidden=!deletedActions.length;restore.onclick=restoreAnimation;restore.disabled=taskBusy||actionIds(project).length>=MAX_ACTIONS}
 $('#new-action').disabled=$('#duplicate-action').disabled=taskBusy||actionIds(project).length>=MAX_ACTIONS;
 $('#action-name').oninput=e=>{if(taskBusy)return;project.actions[action].name=truncateText(e.target.value.trim())||'动画 · Animation';markDirty()};
 $('#action-name').onchange=()=>{};
 $('#action-name').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.target.blur();render()}if(e.key==='Escape'){e.preventDefault();project.actions[action].name=e.target.dataset.originalName||project.actions[action].name;render()}};
 $('#action-name').onblur=e=>{const field=e.target.closest('label'),tab=field?.closest('.animation-browser-tab'),b=tab?.querySelector('[data-action]');if(!b)return;field.hidden=true;b.hidden=false;b.querySelector('.tab-name').textContent=compactActionLabel(project,action);b.title=actionLabel(project,action)+' · 双击或按 F2 重命名'};
 $('#undo-animation').onclick=()=>{if(taskBusy)return;const previous=actionUndo.get(action)?.pop();if(!previous)return;project.actions[action]=previous;stop();frame=0;markDirty();render()};
 $('#back-character')?.addEventListener('click',()=>go('character'));
 $('#build-motion')?.addEventListener('click',buildMotion);
 $('#generate-ai')?.addEventListener('click',()=>generateAIFrames(false));$('#recover-ai')?.addEventListener('click',()=>generateAIFrames(true));
 $('#pose-count')?.addEventListener('change',e=>{if(taskBusy){e.target.value=project.actions[action].poseCount??6;return}project.actions[action].poseCount=+e.target.value;markDirty();render()});
 $('#animation-trigger')?.addEventListener('change',e=>{if(!taskBusy){project.actions[action].trigger=e.target.value;markDirty()}});
 $('#animation-direction')?.addEventListener('input',e=>{if(!taskBusy){project.actions[action].direction=e.target.value;markDirty()}});
 $('#check-ai')?.addEventListener('click',openProviderSettings);
 $('#import-frames')?.addEventListener('click',()=>$('#frames-file').click());
 for(const [selector,key,index] of [['#lock-start','lockStart',0],['#lock-end','lockEnd',-1]]){
  $(selector)?.addEventListener('change',e=>editAction(a=>{a[key]=e.target.checked;if(a[key]&&a.frames.length)a.frames[index===0?0:a.frames.length-1]=project.reference.image}));
 }
 $('#playback-mode')?.addEventListener('change',e=>editAction(a=>{a.playback=e.target.value}));
 for(const [selector,key] of [['#loop-start','loopStart'],['#loop-end','loopEnd']]){
  const el=$(selector);if(el){el.value=project.actions[action][key];el.onchange=e=>editAction(a=>{a[key]=+e.target.value;if(a.loopStart>a.loopEnd)throw new Error('循环终点不能早于起点。')})}
 }
 $('#sleep-preset')?.addEventListener('click',()=>editAction(a=>{a.playback='state';a.loopStart=Math.max(0,Math.floor(a.frames.length/2)-1);a.loopEnd=Math.min(a.frames.length-1,a.loopStart+1)}));
 $('#duration')?.addEventListener('input',e=>{$('#duration-label').textContent=(e.target.value/1000).toFixed(1)+'s'});
 $('#duration')?.addEventListener('change',e=>editAction(a=>{a.duration=+e.target.value}));
 $('#play-animation').onclick=()=>{if(playing){stop();refreshAnimationPreview()}else{const a=project.actions[action];playing=true;previewRelease=false;if(a.playback==='once'&&frame===a.frames.length-1)frame=0;lastTick=0;refreshAnimationPreview();raf=requestAnimationFrame(tick)}};
 $('#preview-exit').onclick=()=>{previewRelease=true;if(!playing){playing=true;lastTick=0;refreshAnimationPreview();raf=requestAnimationFrame(tick)}};
 $('#speed').value=speed;$('#speed').onchange=e=>speed=+e.target.value;

 function selectFrame(next,focus=false){
  const b=document.querySelector('[data-frame="'+next+'"]');
  if(!b||next<0||next>=project.actions[action].frames.length)return;
  if(next===frame&&!playing){if(focus)b.focus({preventScroll:true});return}
  stop();frame=next;refreshAnimationPreview();if(focus)b.focus({preventScroll:true});
  void animateUI(b,[{transform:'translateY(-2px) scale(.97)'},{transform:'translateY(-6px) scale(1)'}],180);
  void animateUI($('#animation-pet'),[{opacity:.5},{opacity:1}],180);
  const scroll=$('.timeline-scroll');
  if(scroll){const r=b.getBoundingClientRect(),s=scroll.getBoundingClientRect();if(r.left<s.left)scroll.scrollLeft-=s.left-r.left+8;else if(r.right>s.right)scroll.scrollLeft+=r.right-s.right+8}
 }
 $('.timeline-scroll')?.addEventListener('wheel',createFrameWheelHandler({getIndex:()=>frame,getCount:()=>project.actions[action].frames.length,select:index=>selectFrame(index)}),{passive:false});

 $$('[data-frame]').forEach(b=>{
  b.onclick=()=>selectFrame(+b.dataset.frame,true);
  b.ondragstart=e=>{if(taskBusy||lockedFrame(project.actions[action],+b.dataset.frame)){e.preventDefault();return}e.dataTransfer.setData('text/plain',b.dataset.frame)};
  b.ondragover=e=>e.preventDefault();
  b.ondrop=e=>{e.preventDefault();const from=Number(e.dataTransfer.getData('text/plain')),to=+b.dataset.frame;editAction(a=>editFrames(a,'move',from,to));frame=to;render()};
 });
 const transform=(op,target)=>editAction(a=>editFrames(a,op,frame,target));
 $('#frame-left')?.addEventListener('click',()=>{const target=frame-1;transform('move',target);frame=Math.max(0,target);render()});
 $('#frame-right')?.addEventListener('click',()=>{const target=frame+1;transform('move',target);frame=Math.min(project.actions[action].frames.length-1,target);render()});
 $('#frame-repeat')?.addEventListener('click',()=>transform('repeat'));
 $('#frame-remove')?.addEventListener('click',()=>transform('remove'));
 $('#frame-repair')?.addEventListener('click',reviseSelectedPose);
 $('#frame-original')?.addEventListener('click',()=>editAction(a=>{if(lockedFrame(a,frame))return;a.frames[frame]=project.reference.image;a.source='remixed'}));
 $('#frame-reuse')?.addEventListener('click',()=>{const [id,i]=$('#frame-source').value.split(':');editAction(a=>{if(lockedFrame(a,frame))return;a.frames[frame]=project.actions[id].frames[+i];a.source='remixed'})});
 const hold=$('#frame-hold');if(hold){hold.value=project.actions[action].holds[frame];hold.onchange=e=>editAction(a=>{a.holds[frame]=+e.target.value})}
 const alignButton=$('#compare');alignButton.textContent='叠影';alignButton.setAttribute('aria-label','叠影');alignButton.setAttribute('aria-pressed',String(onionVisible));alignButton.title='显示或隐藏原图叠影；关闭后仍可拖动当前帧';
 const alignAction=project.actions[action];alignButton.disabled=playing||!alignAction.frames.length;
 alignButton.onclick=()=>{onionVisible=!onionVisible;render();$('#compare').focus({preventScroll:true})};
 refreshAnimationPreview();
 const notices=generationWarnings.get(alignAction)||[];
 const affected=alignAction.frames.flatMap((image,index)=>notices.some(n=>n.image===image)?[index+1]:[]);
 if(affected.length&&$('#ai-status'))$('#ai-status').textContent='请检查第 '+affected.join('、')+' 帧的边缘和裁切。位置可直接拖动调整；缺失或多余细节请用「修复」。可撤销本次生成。';
 for(const index of affected){const tile=document.querySelector('[data-frame="'+(index-1)+'"]');if(tile){tile.classList.add('frame-needs-check');tile.title='请检查此帧的边缘和裁切'}}

 $('#approve-action')?.addEventListener('click',()=>{if(taskBusy)return;const a=project.actions[action];if(a.approved){go('playground');return}a.approved=true;markDirty();render();toast(actionLabel(project,action)+' 已确认。')});
}

function refreshAnimationPreview(){
 alignmentCleanup?.();alignmentCleanup=null;
 const a=project.actions[action],host=$('#animation-pet'),stage=$('#animation-stage');
 if(!host||!a.frames.length)return;
 const locked=lockedFrame(a,frame),disabled=playing||locked;
 $('#compare').disabled=playing;stage.classList.toggle('canvas-align-active',!playing);
 if(playing){
  const image=document.createElement('img');image.id='anim-image';image.className='pet-image';image.alt='Animation preview';image.src=a.frames[frame];host.replaceChildren(image);
 }else{
  const selected=frame,chosenAction=action;
  alignmentCleanup=mountCanvasAlignment({host,image:a.frames[selected],reference:project.reference.image,onion:onionVisible,locked,isCurrent:()=>!taskBusy&&!playing&&page==='animation'&&action===chosenAction&&frame===selected&&project.actions[action]===a,apply:replacement=>{editAction(draft=>{draft.frames[selected]=replacement;draft.source='remixed'});$('.alignment-canvas')?.focus({preventScroll:true})}});
 }
 const states={'frame-left':disabled||frame===0||lockedFrame(a,frame-1),'frame-right':disabled||frame===a.frames.length-1||lockedFrame(a,frame+1),'frame-repeat':disabled||a.frames.length>=MAX_FRAMES,'frame-remove':disabled||a.frames.length<=2,'frame-repair':disabled,'frame-original':disabled,'frame-reuse':disabled,'frame-hold':playing};
 for(const [id,value] of Object.entries(states)){const control=$('#'+id);if(control)control.disabled=value}
 const hold=$('#frame-hold');if(hold)hold.value=a.holds[frame];
 const title=$('.selected-frame-tools h3');if(title)title.textContent='当前帧 · '+(frame+1)+(locked?' · 锁定原图':'');
 const hint=$('.selected-frame-tools > p.fine-print');if(hint)hint.hidden=!locked;
 showFrame();setPlaybackControl();
}

function showFrame(){if(document.body)document.body.dataset.playing=String(playing);const a=project.actions[action];if($('#anim-image'))$('#anim-image').src=a.frames[frame];if($('#frame-counter'))$('#frame-counter').textContent='帧 '+(frame+1)+' / '+a.frames.length;if($('#phase-label'))$('#phase-label').textContent=phaseLabel(a,frame)+(previewRelease?' · 正在结束':'');$$('[data-frame]').forEach(b=>(b.classList.toggle('active',+b.dataset.frame===frame),b.setAttribute('aria-pressed',String(+b.dataset.frame===frame))))}
function tick(t){
 if(!playing||page!=='animation')return;const a=project.actions[action],step=frameDuration(a,frame)/speed;
 if(!lastTick)lastTick=t;
 if(t-lastTick>=step){const next=nextFrame(a,frame,previewRelease);if(next===null){stop();refreshAnimationPreview();return}frame=next;showFrame();lastTick=t}
 raf=requestAnimationFrame(tick);
}
async function buildMotion(){
 if(taskBusy)return;const reference=project.reference,id=action;if(!reference.approved){toast('请先确认角色原图。');return}
 if(project.actions[id].approved&&!confirm('重新制作已确认的动画？若要保留当前版本，请先下载项目备份。'))return;
 taskBusy=true;const button=$('#build-motion');button.disabled=true;button.textContent='正在制作本地动作……';
 try{let middle;
 if(reference.image===demoPNG()){
  middle=demoFrames(id).slice(1,7);
 }else{
  const im=await loadImage(reference.image),base=canvas(64,64),bx=base.getContext('2d');
  bx.imageSmoothingEnabled=false;bx.drawImage(im,0,0,64,64);middle=[];
  for(let i=1;i<=6;i++){
   const c=canvas(),x=c.getContext('2d');x.imageSmoothingEnabled=false;
   const dy=id==='happy'?[0,-1,-3,-5,-5,-3,-1,0][i]:id==='idle'?(i>=2&&i<=4?-1:0):id==='sleeping'&&i===4?-1:0;
   const dx=id==='eating'?(i%2?1:0):0;
   x.drawImage(base,dx*5,dy*5,320,320);middle.push(c.toDataURL('image/png'));
  }
 }
 if(project.reference!==reference)throw new Error('原图已更改，请重新制作动画。');
 installPoses(id,reference,middle,'motion-study');stop();frame=0;markDirty();render();toast('本地动作已就绪，请播放检查后确认或继续编辑。');
 }catch(e){toast(e.message)}finally{taskBusy=false;if(button.isConnected){button.disabled=false;button.textContent='本地动作 · Local motion'}}
}
async function importFrames(files){
 if(taskBusy)return;const list=[...files].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));const locks=Number(project.actions[action].lockStart)+Number(project.actions[action].lockEnd);if(list.length<1||list.length+locks<2||list.length+locks>MAX_FRAMES){toast('包含锁定原图在内，动画需为 2–32 帧，请选择合适数量的姿势。');return}
 if(!project.reference.approved){toast('请先确认角色原图。');return}
 if(project.actions[action].approved&&!confirm('用导入姿势替换已确认的动画？如需保留当前版本，请先下载项目备份。'))return;
 taskBusy=true;const reference=project.reference,id=action;try{const middle=await Promise.all(list.map(readPNG));if(reference!==project.reference)throw new Error('原图已更改，请重新导入。');installPoses(id,reference,middle,'imported');stop();frame=0;markDirty();render();toast('姿势已导入，请调整循环范围并预览后确认。')}catch(e){toast(e.message)}finally{taskBusy=false}
}
function say(s){if($('#speech')){$('#speech').textContent=s;$('#speech').classList.toggle('hidden',quiet)}}
function playApproved(id,loop=false,onDone=null){
 cancelAnimationFrame(raf);playbackSession=null;
 let a=project.actions[id];const el=$('#play-pet');if(!el)return;
 if(!exportableAction(project,id)){
  if(project.actions[id]&&project.reference.image===demoPNG()&&ACTIONS.includes(id)){a={...newAction(id),frames:demoFrames(id),duration:id==='sleeping'?2200:1400,loopStart:id==='sleeping'?3:0,loopEnd:id==='sleeping'?4:7}}
  else{el.src=project.reference.image;onDone?.();return}
 }
 // Approved playback settings take precedence over the playground's fallback hints.
 const session={action:a,frame:0,releasing:false,onDone};playbackSession=session;el.src=a.frames[0];let last=0;
 function next(t){
  if(page!=='playground'||playbackSession!==session)return;
  if(!last)last=t;
  if(t-last>=frameDuration(a,session.frame)){
   const f=nextFrame(session.action,session.frame,session.releasing);
   if(f===null){playbackSession=null;if(session.onDone)session.onDone();else if(id!=='idle')playApproved('idle',true);return}
   session.frame=f;el.src=a.frames[f];last=t;
  }
  raf=requestAnimationFrame(next);
 }
 raf=requestAnimationFrame(next);
}
function setPlayButtonLabel(selector,label){const button=$(selector),text=button.querySelector('.play-action-label');if(text)text.textContent=label;else button.textContent=label}
function resetPlay(){playbackSession=null;cancelAnimationFrame(raf);clearTimeout(playgroundTimer);playState='idle';focusUntil=0;crumbs=false;$('#play-pet').className='pet-image';$('#play-pet').src=project.reference.image;$('#napkin').classList.add('hidden');$('#crumb').classList.add('hidden');$('#little-food').classList.add('hidden');setPlayButtonLabel('#sleep-action','睡眠 · Sleep');$('#sleep-action').disabled=false;$('#focus-clock').textContent='慢慢来'}
function pet(){if(playState==='sleep'||playState==='waking'){say('再睡五分钟……');return}if(playState==='feeding')return;$('#play-pet').classList.remove('loved');void $('#play-pet').offsetWidth;$('#play-pet').classList.add('loved');say(['你好，我最喜欢的人。','真是美好的一刻。','收到摸摸啦。'][Math.floor(Math.random()*3)]);playApproved('happy');$('#activity-status').textContent='♡ 小小的关心，长长的陪伴。'}
function feed(){resetPlay();playState='feeding';say('给我的小点心？');$('#play-pet').classList.add('eating');$('#little-food').classList.remove('hidden');playApproved('eating',true);$('#activity-status').textContent='休息一下，吃点东西。';playgroundTimer=setTimeout(()=>{if(page!=='playground')return;cancelAnimationFrame(raf);playState='idle';$('#play-pet').classList.remove('eating');$('#play-pet').src=project.reference.image;$('#little-food').classList.add('hidden');crumbs=true;$('#crumb').classList.remove('hidden');$('#napkin').classList.remove('hidden');say('脸上是不是沾了点碎屑？');$('#activity-status').textContent='用纸巾擦掉碎屑：拖动纸巾，或选中后按 Enter。'},1800)}
function wipe(){if(!crumbs)return;crumbs=false;$('#crumb').classList.add('hidden');$('#napkin').classList.add('hidden');$('#napkin').style.transform='';say('干净啦，谢谢你 ♡');$('#activity-status').textContent='✳ 属于我们的小小片刻。';$('#play-pet').classList.add('loved');playApproved('happy')}
function triggerMotion(trigger){
 if(!['idle','custom','gesture'].includes(playState))return;
 const id=chooseTriggeredAction(project,trigger);if(!id){if(trigger==='click')say('请将已确认的动画设为点击触发。');return}
 resetPlay();playState='gesture';say(actionLabel(project,id));$('#activity-status').textContent=TRIGGERS[trigger]+' · '+actionLabel(project,id);
 playApproved(id,false,()=>{playState='idle';playApproved('idle',true)});
 if(playbackSession){playbackSession.action={...playbackSession.action,playback:trigger==='click'?'once':'state'};playbackSession.releasing=trigger==='click'}
}
function finishGesture(){if(playState==='gesture'&&playbackSession)playbackSession.releasing=true}
function bindPlayground(){playApproved('idle',true);
 const companion=$('.desktop-companion'),desktop=$('.desktop-preview');
 const gestures=bindPetGestures($('#pet-touch'),{start:triggerMotion,finish:finishGesture,click:()=>triggerMotion('click'),dragTarget:companion||$('#pet-touch'),...(companion?{dragBounds:()=>({minX:12-companion.offsetLeft,maxX:desktop.clientWidth-companion.offsetLeft-companion.offsetWidth-12,minY:42-companion.offsetTop,maxY:desktop.clientHeight-52-companion.offsetTop-companion.offsetHeight})}:{})});
 const resize=companion?new ResizeObserver(()=>gestures.constrain()):null;if(resize)resize.observe(desktop);
 gestureCleanup=()=>{resize?.disconnect();gestures()};
 idleRotationTimer=setInterval(()=>{
  if(page!=='playground'||playState!=='idle'||crumbs)return;
  const id=chooseTriggeredAction(project,'idle',lastIdleAction);if(!id)return;
  const begin=()=>{lastIdleAction=id;playApproved(id,true,()=>playApproved('idle',true));$('#activity-status').textContent='随机待机 · '+actionLabel(project,id)};
  if(playbackSession){playbackSession.releasing=true;playbackSession.onDone=begin}else begin();
 },8000);
 say('你好呀。');$('#pet-action').onclick=pet;$('#feed-action').onclick=feed;
 $('#sleep-action').onclick=()=>{
  if(playState==='waking')return;
  if(playState==='sleep'){
   playState='waking';setPlayButtonLabel('#sleep-action','正在醒来……');$('#sleep-action').disabled=true;say('伸个懒腰，醒来啦……');
   const done=()=>{resetPlay();say('新的一刻，精神满满。');$('#activity-status').textContent='醒来啦，很高兴见到你。';playApproved('idle',true)};
   if(playbackSession){playbackSession.releasing=true;playbackSession.onDone=done}else done();
  }else{
   resetPlay();playState='sleep';setPlayButtonLabel('#sleep-action','唤醒 · Wake');say('小睡一下，呼呼……');$('#activity-status').textContent='慢慢睡去，轻轻呼吸。';
   playApproved('sleeping',true,()=>{resetPlay();playApproved('idle',true)});
  }
 };
 $$('[data-play-custom]').forEach(b=>b.onclick=()=>{resetPlay();playState='custom';say(actionLabel(project,b.dataset.playCustom));playApproved(b.dataset.playCustom,false,()=>{playState='idle';playApproved('idle',true)})});
 $('#release-custom')?.addEventListener('click',()=>{if(playbackSession){playbackSession.releasing=true;playbackSession.onDone=()=>{resetPlay();playApproved('idle',true)}}});
 $('#focus-action').onclick=()=>{resetPlay();playState='focus';focusUntil=Date.now()+30000;$('#play-pet').classList.add('focus-pet');say('你忙你的，我在这里陪你。');function update(){if(page!=='playground'||playState!=='focus')return;const s=Math.max(0,Math.ceil((focusUntil-Date.now())/1000));$('#focus-clock').textContent='00:'+String(s).padStart(2,'0');$('#activity-status').textContent='安静陪伴你专注 30 秒。';if(s){playgroundTimer=setTimeout(update,250)}else{playState='idle';say('歇一会儿吧，辛苦啦。');$('#activity-status').textContent='专注时间结束，放松呼吸。';$('#play-pet').classList.remove('focus-pet')}}update()};
 $('#quiet-toggle').onclick=e=>{quiet=!quiet;e.currentTarget.classList.toggle('on',quiet);e.currentTarget.setAttribute('aria-checked',quiet);$('#speech').classList.toggle('hidden',quiet)};
 $('#to-animations').onclick=()=>go('animation');
 const n=$('#napkin');let drag=null;
 n.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY};n.setPointerCapture(e.pointerId)};
 n.onpointermove=e=>{if(!drag)return;n.style.transform='translate('+(e.clientX-drag.x)+'px,'+(e.clientY-drag.y)+'px)';const r=$('#pet-touch').getBoundingClientRect();if(e.clientX>r.left&&e.clientX<r.right&&e.clientY>r.top&&e.clientY<r.bottom){wipe();drag=null}};
 n.onpointerup=n.onpointercancel=()=>{drag=null;n.style.transform=''};
 n.onclick=e=>{if(e.detail===0)wipe()};
}
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
const filename=()=>project.name.replace(/[^a-z0-9\u4e00-\u9fff_-]+/gi,'-').slice(0,40)||'petform';
function openExport(){const count=actionIds(project).filter(id=>exportableAction(project,id)).length;$('#export-icon').src=project.reference.image;$('#export-summary-text').textContent=project.name+' · 原图 v'+project.reference.version+' · '+count+'/'+actionIds(project).length+' 个动画已确认。';$('#download-desktop').disabled=!project.reference.approved;$('#desktop-export-status').textContent=!project.reference.approved?'导出桌面宠物前，请先确认角色原图。':count?'确认的原图将用作应用和托盘图标，仅包含已确认的动画。':'原图将用作图标；如需桌面宠物播放动作，请先确认动画。';$('#download-sheet').disabled=!exportableAction(project,action);openMotionDialog($('#export-dialog'))}
$('#new-pet').onclick=()=>{if(taskBusy){toast('请等待当前操作完成。');return}$('#new-pet-name').value='';openMotionDialog($('#new-pet-dialog'));$('#new-pet-name').focus()};
$('#cancel-new-pet').onclick=()=>closeMotionDialog($('#new-pet-dialog'));
$('#new-pet-form').onsubmit=async e=>{
 e.preventDefault();if(taskBusy){toast('请等待当前操作完成。');return}
 const name=truncateText($('#new-pet-name').value.trim());if(!name){$('#new-pet-name').focus();return}
 const next={format:'petform-project',schemaVersion:2,name,characterPrompt:'',reference:{image:canvas().toDataURL('image/png'),empty:true,approved:false,version:1,styleNotes:''},actions:emptyActions(),history:[],updatedAt:null};
 const backup=e.submitter?.id!=='create-without-backup';
 if(backup){try{download(new Blob([JSON.stringify({...project,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),filename()+'.petform.json')}catch{toast('备份下载失败，当前宠物未更改。');return}}
 stop();actionUndo.clear();deletedActions.length=0;disclosureState.clear();pendingImport=null;project=next;action='idle';frame=0;speed=1;quiet=false;page='character';
 await closeMotionDialog($('#new-pet-dialog'));markDirty();go('character');$('#pet-name').focus();toast(backup?'新宠物已创建，上一只宠物的备份已下载。':'新宠物已创建，未下载备份。');
};
$('#save-project').onclick=save;
$('#export-project').onclick=openExport;
$('#close-export').onclick=()=>closeMotionDialog($('#export-dialog'));
$('#download-desktop').onclick=()=>toast('试玩版提供 JSON 与精灵图下载。Windows 应用打包需要完整版。');
$('#download-json').onclick=()=>{download(new Blob([JSON.stringify({...project,history:[],exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),filename()+'.petform.json');toast('项目已下载，请保留为可编辑备份。')};
$('#download-sheet').onclick=async()=>{if(!exportableAction(project,action))return;try{const frames=project.actions[action].frames,c=canvas(frames.length*320,320),x=c.getContext('2d');x.imageSmoothingEnabled=false;const images=await Promise.all(frames.map(loadImage));images.forEach((im,i)=>x.drawImage(im,i*320,0,320,320));c.toBlob(b=>{if(b)download(b,filename()+'-'+action+'-'+frames.length+'x1.png')},'image/png')}catch(e){toast(e.message)}};
$('#character-file').onchange=e=>{if(e.target.files[0])loadCharacter(e.target.files[0]);e.target.value=''};
$('#frames-file').onchange=e=>{if(e.target.files.length)importFrames(e.target.files);e.target.value=''};
$('#import-project').onclick=()=>$('#project-file').click();
$('#project-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>28*1024*1024){toast('项目文件需小于 28 MB。');return}try{const next=validateProject(JSON.parse(await file.text()));await decodeProjectImages(next);if(dirty&&!confirm('打开此项目将替换未保存的修改，如需保留，请先导出备份。'))return;stop();actionUndo.clear();deletedActions.length=0;project=next;page='character';action='idle';markDirty();render();toast('项目已打开，保存后可在此浏览器继续使用。')}catch(err){toast('无法打开项目：'+err.message)}};
$$('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));
$('.brand').onclick=e=>{e.preventDefault();go('character')};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
render();if(loadError)toast(loadError);else if(project.updatedAt)$('#save-status').textContent='已从此浏览器恢复';


let pendingImport=null;
async function prepareCharacter(file){
 if(taskBusy)return;taskBusy=true;
 try{
  if(!file||file.size>8*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请选择不超过 8 MB 的 PNG、JPEG 或 WebP 图片。');
  const url=URL.createObjectURL(file);let im;try{im=await loadImage(url)}finally{URL.revokeObjectURL(url)}
  if(im.width>8192||im.height>8192||im.width*im.height>32000000)throw new Error('图片总像素不能超过 3200 万，单边不能超过 8192 像素。');
  stageCharacterImage(im);
 }catch(e){toast(e.message)}finally{taskBusy=false}
}
function stageCharacterImage(im,styleNotes=''){
 if(im.width>8192||im.height>8192||im.width*im.height>32000000)throw new Error('图片总像素不能超过 3200 万，单边不能超过 8192 像素。');
 const size=importPreviewSize(im.width,im.height),c=canvas(size.width,size.height),x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(im,0,0,c.width,c.height);
 pendingImport={canvas:c,data:x.getImageData(0,0,c.width,c.height),result:null};
 $('#import-source').src=c.toDataURL('image/png');$('#style-note').value=styleNotes;$('#import-style-choice').checked=false;$('#style-choice-wrap').hidden=true;
 $('#import-remove').checked=true;$('#import-tolerance').value=28;$('#import-size').value=100;updateImportPreview();openMotionDialog($('#image-import-dialog'));
}
function updateImportPreview(){
 if(!pendingImport)return;
 const styled=pendingImport.style&&$('#import-style-choice').checked;
 const {canvas:c,data}=styled?pendingImport.style:pendingImport.ai&&$('#import-remove').checked?pendingImport.ai:pendingImport;
 const result=$('#import-remove').checked?removeBackground(data.data,c.width,c.height,+$('#import-tolerance').value):{pixels:new Uint8ClampedArray(data.data),confidence:false,reason:'已保留原始背景。'};pendingImport.result=result;
 const cutout=canvas(c.width,c.height),cx=cutout.getContext('2d');cx.putImageData(new ImageData(result.pixels,c.width,c.height),0,0);
 const hasAlpha=someTransparent(result.pixels),assessment=assessPetStyle(result.pixels,c.width,c.height,{backgroundSeparated:hasAlpha||result.confidence});
 const p=canvas(PET_SIZE,PET_SIZE),x=p.getContext('2d');x.imageSmoothingEnabled=false;
 const size=Number($('#import-size').value);
 if(assessment.bounds){const fit=fitPetBounds(assessment.bounds,c.width,c.height,size);x.drawImage(cutout,fit.x,fit.y,c.width*fit.scale,c.height*fit.scale)}
 pendingImport.preview=p;$('#import-preview').src=p.toDataURL('image/png');$('#import-detection').textContent=result.reason;
 $('#import-baseline').textContent=assessment.issues.length?'请检查画面：'+assessment.issues.join(' '):'画布已调整，请确认主体清晰，且为单个像素角色。';
 if(size>100)$('#import-baseline').textContent+=' 放大后会缩小默认 24 像素边距，请检查四周边缘。';
 $('#apply-image-import').disabled=!assessment.ready;
 $('#import-tolerance-label').textContent=$('#import-tolerance').value;
 $('#import-size-label').textContent=size+'%';
}
function someTransparent(pixels){for(let i=3;i<pixels.length;i+=4)if(pixels[i]<128)return true;return false}
function applyCharacterImport(){
 if(!pendingImport)return;const image=pendingImport.preview.toDataURL('image/png'),notes=$('#style-note').value.trim();
 stop();actionUndo.clear();deletedActions.length=0;action='idle';project=replaceReference(project,image,notes);pendingImport=null;closeMotionDialog($('#image-import-dialog'));page='character';markDirty();render();toast('角色已导入，请检查并确认新的原图。');
}
document.addEventListener('paste',e=>{
 if(page!=='character'||$('#image-import-dialog').open||$('#export-dialog').open)return;
 const item=[...(e.clipboardData?.items||[])].find(i=>i.kind==='file'&&/^image\//.test(i.type));
 if(item){e.preventDefault();prepareCharacter(item.getAsFile())}
});
$('#import-remove').onchange=updateImportPreview;
$('#import-tolerance').oninput=updateImportPreview;
$('#import-size').oninput=updateImportPreview;
$('#import-style-choice').onchange=updateImportPreview;
$('#apply-image-import').onclick=applyCharacterImport;
$('#cancel-image-import').onclick=()=>closeMotionDialog($('#image-import-dialog'));
$('#image-import-dialog').addEventListener('close',()=>pendingImport=null);

function showGenerationWait(kind,recover){
 const dialog=$('#generation-wait'),status=$('#generation-status'),started=Date.now();
 const titles={character:'召唤角色 · Summoning your character',frames:'赋予生命 · Bringing your pet to life',cutout:'清除背景 · Clearing the enchanted mist',style:'绘制像素伙伴 · Crafting your pixel companion',pose:'打磨细节 · Refining a little detail'};
 $('#generation-title').textContent=recover?'恢复作品 · Recovering your saved artwork':titles[kind]||'创作中 · Creating your artwork';
 $('#generation-detail').textContent=recover?'正在载入已保存的图像，不会发起新的生成请求。':'图像服务正在绘制，可能需要几分钟。';
 const tick=()=>{const seconds=Math.floor((Date.now()-started)/1000),elapsed=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');$('#generation-elapsed').textContent=elapsed+' 已用时';status.textContent='✦ '+(recover?'正在恢复':'正在生成')+' · '+elapsed;if(seconds>=180&&!recover)$('#generation-detail').textContent='仍在等待图像服务返回结果，请勿重复生成。'};
 tick();status.hidden=false;status.setAttribute('aria-label','查看生成进度');openMotionDialog(dialog);const timer=setInterval(tick,1000);
 status.onclick=()=>{if(!dialog.open)openMotionDialog(dialog)};$('#hide-generation').onclick=()=>closeMotionDialog(dialog);
 return ()=>{clearInterval(timer);closeMotionDialog(dialog);status.hidden=true;status.onclick=null};
}
async function requestAI(){throw new Error('试玩版不连接 AI。你可以检查编辑界面；生成与修复需要完整版本。')}
async function generateStartingCharacter(){
 if(taskBusy)return;taskBusy=true;const owner=project;const finish=showGenerationWait('character',false);
 $('#generation-detail').textContent='流程模拟：正在准备内置 Mochi 样例，不会调用 AI，也不会根据描述生成新图片。';
 try{await new Promise(r=>setTimeout(r,2200));if(owner!==project)return;stageCharacterImage(await loadImage(demo()),'内置 Mochi 演示样例');$('#import-detection').textContent='演示样例已准备好。检查画布后选择「使用此角色」。这不是 AI 生成结果。'}finally{finish();taskBusy=false}
}
async function currentMiddleSheet(frames,count=6){
 const {columns,rows}=poseGrid(count);
 const sheet=canvas(columns*320,rows*320),x=sheet.getContext('2d');x.imageSmoothingEnabled=false;
 for(let i=0;i<count;i++){const im=await loadImage(frames[Math.round(i*(frames.length-1)/(count-1))]);x.drawImage(im,(i%columns)*320,Math.floor(i/columns)*320,320,320)}
 return sheet.toDataURL('image/png');
}
async function generateAIFrames(){
 if(taskBusy)return;const reference=project.reference,id=action,owner=project;
 if(!reference.approved){toast('请先确认原图。');return}
 if(reference.image!==demo()){toast('Mochi 样例只适用于默认角色。上传的角色请使用「本地动作」，或重置为 Mochi。');return}
 if(project.actions[id].frames.length&&!await confirmDemo('用内置 Mochi 样例替换当前动作？这只是流程模拟，修改可撤销。'))return;
 taskBusy=true;const finish=showGenerationWait('frames',false);
 $('#generation-detail').textContent='流程模拟：准备内置动作 → 检查草稿 → 确认动画。不会调用 AI。';
 try{await new Promise(r=>setTimeout(r,2200));if(owner!==project||reference!==project.reference)return;installPoses(id,reference,demoFrames(ACTIONS.includes(id)?id:'idle').slice(1,7),'motion-study');stop();frame=0;markDirty();render();toast('Mochi 样例草稿已就绪。播放、逐帧检查，再确认动画。')}finally{finish();taskBusy=false;render()}
}
async function aiCutout(){
 if(taskBusy||!pendingImport)return;taskBusy=true;const current=pendingImport,b=$('#ai-cutout');b.disabled=true;$('#apply-image-import').disabled=true;b.textContent='正在去除背景……';
 try{
  const {image:im}=await requestAI('cutout',current.canvas.toDataURL('image/png'));
  if(current!==pendingImport)return;
  const c=canvas(im.width,im.height),x=c.getContext('2d');x.drawImage(im,0,0);current.ai={canvas:c,data:x.getImageData(0,0,c.width,c.height)};
  $('#import-style-choice').checked=false;$('#import-remove').checked=true;updateImportPreview();$('#import-detection').textContent='AI 去背已完成，请检查细节；取消去背可对比原图。';
 }catch(e){toast(e.message);if(current===pendingImport)$('#import-detection').textContent=uiMessage(e.message)}finally{taskBusy=false;b.disabled=false;if(current===pendingImport)updateImportPreview();b.textContent='AI 去背景 · Remove background'}
}
$('#ai-cutout').onclick=aiCutout;
async function aiAdaptStyle(){
 if(taskBusy||!pendingImport)return;taskBusy=true;const current=pendingImport,b=$('#ai-adapt-style');b.disabled=true;$('#apply-image-import').disabled=true;b.textContent='正在转换像素风……';
 try{
  const {image:im}=await requestAI('style',current.canvas.toDataURL('image/png'),undefined,false,{styleNotes:$('#style-note').value.trim()});
  if(current!==pendingImport)return;
  const c=canvas(im.width,im.height),x=c.getContext('2d');x.drawImage(im,0,0);current.style={canvas:c,data:x.getImageData(0,0,c.width,c.height)};
  $('#style-choice-wrap').hidden=false;$('#import-style-choice').checked=true;$('#import-remove').checked=true;updateImportPreview();
  $('#import-detection').textContent='像素角色已生成，请对比上传原图，检查标志性细节是否保留。';
 }catch(e){toast(e.message);if(current===pendingImport){updateImportPreview();$('#import-detection').textContent=uiMessage(e.message)}}
 finally{taskBusy=false;b.disabled=false;if(current===pendingImport)b.textContent='转为像素风 · Pixel style ✳'}
}
$('#ai-adapt-style').onclick=aiAdaptStyle;

async function reviseSelectedPose(){
 if(taskBusy)return;const owner=project,id=action,index=frame,previous=project.actions[id],reference=project.reference;
 if(!reference.approved||lockedFrame(previous,index)||!previous.frames[index])return;
 stop();const isCurrent=()=>owner===project&&reference===project.reference&&project.actions[id]===previous&&previous.frames[index]===image;
 const image=previous.frames[index];
 try{await openPoseRevision({image,isCurrent,request:async extra=>{
  if(taskBusy)throw new Error('请等待当前操作完成。');taskBusy=true;
  try{const generated=await requestAI('pose',reference.image,id,false,{...extra,styleNotes:reference.styleNotes||''});
   const c=canvas(),x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(generated.image,0,0,320,320);
   if(generated.localCutout){const p=x.getImageData(0,0,320,320);x.putImageData(new ImageData(prepareGeneratedPixels(p.data,320,320,true),320,320),0,0)}
   return c;
  }finally{taskBusy=false}
 },apply:replacement=>{if(!isCurrent())return;const next=replaceSelectedPose(previous,index,replacement);rememberAction(id,previous);project.actions[id]=next;if(generationWarnings.has(previous))generationWarnings.set(next,generationWarnings.get(previous));frame=index;markDirty();render();toast('已修复一帧，请检查动作后确认；可在当前帧工具中撤销。')}})}catch(e){toast(e.message)}
}

function enhanceDemo(){
 const label=(id,text)=>{const node=document.getElementById(id);if(node)node.textContent=text};
 label('generate-character','体验生成流程 · Demo');label('generate-ai','体验生成流程 · Demo');
 label('character-ai-status','使用内置 Mochi 演示等待、检查与确认流程，不调用 AI。');
 label('ai-status','内置样例演示。修改描述不会改变 Mochi；本地编辑与试玩可正常使用。');
 for(const id of ['check-ai','recover-ai']){const n=document.getElementById(id);if(n)n.hidden=true}
 const count=$('#pose-count');if(count){count.disabled=true;count.title='演示使用 6 个内置姿势'}
 document.querySelectorAll('.action-source').forEach(n=>n.textContent='演示使用内置 Mochi 动作，不连接图像服务。');
 document.querySelectorAll('[data-demo-page]').forEach(b=>b.setAttribute('aria-current',b.dataset.demoPage===page?'step':'false'));
 const messages={character:'01 · 看看 Mochi，或体验样例生成流程，然后进入动画。',animation:'02 · 切换动作、滚轮选帧、调整速度，修改后确认动画。',playground:'03 · 点击、长按或拖动 Mochi，也可以切换动作试玩。'};
 const guide=$('#demo-step');if(guide)guide.textContent=messages[page];
}
async function resetMochi(){
 if(taskBusy){toast('请等待当前演示完成。');return}
 if(!await confirmDemo('重置此标签页为默认 Mochi？当前编辑会被替换；已保存的浏览器备份不变。'))return;
 stop();actionUndo.clear();deletedActions.length=0;
 project={format:'petform-project',schemaVersion:2,name:'Mochi',characterPrompt:'',reference:{image:demo(),approved:true,version:1,styleNotes:''},actions:Object.fromEntries(ACTIONS.map(id=>[id,{...newAction(id),frames:[demo(),...demoFrames(id).slice(1,7),demo()],approved:true,referenceVersion:1,source:'motion-study',loopEnd:7,holds:Array(8).fill(1)}])),history:[],updatedAt:null};
 action='idle';frame=0;speed=1;quiet=false;markDirty();go('character');toast('Mochi 已重置。点击保存可覆盖此浏览器的试玩备份。');
}
$('#demo-reset').onclick=resetMochi;
$('#demo-help').onclick=()=>openMotionDialog($('#demo-guide'));
$('#demo-guide-close').onclick=()=>closeMotionDialog($('#demo-guide'));
$$('[data-demo-page]').forEach(b=>b.onclick=()=>go(b.dataset.demoPage));
const originalExport=$('#export-project').onclick;
$('#export-project').onclick=()=>{originalExport();$('#download-desktop').disabled=true;$('#download-desktop').textContent='Windows 应用 · 完整版功能';$('#desktop-export-status').textContent='试玩版支持下方的 JSON 备份与精灵图下载。Windows 打包不在此演示中运行。'};
enhanceDemo();

function confirmDemo(message){return new Promise(resolve=>{const d=document.createElement("dialog");d.className="demo-guide";const title=document.createElement("h2");title.textContent="确认演示操作";const p=document.createElement("p");p.textContent=message;const yes=document.createElement("button"),no=document.createElement("button");yes.className="button button-dark";no.className="button button-outline";yes.textContent="继续";no.textContent="取消";const finish=async value=>{await closeMotionDialog(d);d.remove();resolve(value)};yes.onclick=()=>finish(true);no.onclick=()=>finish(false);d.addEventListener("cancel",e=>{e.preventDefault();void finish(false)});d.append(title,p,yes,no);document.body.append(d);void openMotionDialog(d)})}
