// Original Petform demo art. Inspired by the whale project's pixel-grid approach;
// no whale or Pudge artwork, runtime code, or state is imported.
export const SIZE=64;
export const PALETTE={'.':null,o:'#534f3e',s:'#bea780',b:'#ead4a8',l:'#f6e5c0',h:'#fff2d8',p:'#d8878d',r:'#edb0ae',g:'#607c4c',v:'#8eae62',a:'#bed58c',e:'#373e37',c:'#aa704c',d:'#d5a76b'};
export function pixelFrame(action='idle',step=0){
 const grid=Array.from({length:SIZE},()=>Array(SIZE).fill('.'));
 const phase=(step===0||step===7)?0:step;
 const hop=action==='happy'?[0,1,3,5,5,3,1,0][step]:0;
 const breath=(action==='idle'&&[2,3,4].includes(phase))||(action==='sleeping'&&phase===4)?1:0;
 const dy=-hop-breath;
 const rect=(x,y,w,h,color)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(grid[yy]?.[xx]!==undefined)grid[yy][xx]=color};
 const draw=(x,y,w,h,color)=>rect(x,y+dy,w,h,color);
 // Hand-placed, stepped silhouette and limited palette.
 const spans=[[21,14,24],[23,12,28],[26,10,32],[30,9,34],[37,8,36],[44,9,34],[49,11,30],[52,14,24]];
 for(let i=0;i<spans.length;i++){const [y,x,w]=spans[i],end=spans[i+1]?.[0]||54;draw(x,y,w,end-y,'o');draw(x+1,y,w-2,end-y,'b')}
 draw(15,22,22,2,'l');draw(13,25,25,5,'l');draw(11,31,25,15,'l');draw(13,46,22,4,'l');draw(16,49,17,2,'l');
 draw(16,25,5,2,'h');draw(14,28,3,3,'h');
 draw(39,32,2,13,'s');draw(37,46,3,4,'s');draw(15,52,21,1,'s');
 draw(15,54,8,2,'o');draw(16,54,6,1,'s');draw(32,54,8,2,'o');draw(33,54,6,1,'s');
 // Leaves grow from a fixed crown; sway by one logical pixel.
 const sway=phase&&action==='idle'?(phase<4?-1:1):0;
 draw(26,16,2,6,'g');draw(19+sway,13,7,2,'g');draw(17+sway,10,8,3,'g');draw(17+sway,11,6,2,'v');draw(19+sway,14,6,2,'v');
 draw(28+sway,11,7,2,'g');draw(31+sway,8,9,3,'g');draw(29+sway,12,8,3,'g');draw(28+sway,15,6,2,'g');
 draw(32+sway,9,6,2,'a');draw(30+sway,12,5,2,'v');draw(29+sway,14,4,2,'v');
 // Expressions redraw actual pixels instead of deforming a still illustration.
 const closed=phase&&(action==='sleeping'||action==='idle'&&phase===4);
 const happy=phase&&action==='happy'&&phase>=2&&phase<=5;
 for(const ex of [19,33]){
  if(closed){draw(ex-1,38,4,1,'e');draw(ex,39,2,1,'e')}
  else if(happy){draw(ex,36,2,1,'e');draw(ex-1,37,1,2,'e');draw(ex+2,37,1,2,'e')}
  else{draw(ex,36,2,3,'e');draw(ex,36,1,1,'h')}
 }
 draw(14,40,5,2,'r');draw(35,40,5,2,'r');
 if(happy){draw(14,40,5,2,'p');draw(35,40,5,2,'p')}
 if(action==='eating'&&phase){draw(25,42,4,phase%2?3:1,'e');draw(26,43,2,1,'r');
  draw(39,44,7,5,'c');draw(40,43,5,7,'d');draw(41,45,1,1,'c');draw(44,47,1,1,'c');
 }else if(action==='sleeping'&&phase){draw(26,43,2,2,'e')}
 else{draw(25,42,1,1,'e');draw(26,43,2,1,'e');draw(28,42,1,1,'e')}
 if(action==='sleeping'&&phase>=3&&phase<=5){rect(44,21,5,1,'g');rect(47,22,1,1,'g');rect(46,23,1,1,'g');rect(45,24,1,1,'g');rect(44,25,5,1,'g')}
 return grid.map(r=>r.join(''));
}
export function pixelSequence(action){return Array.from({length:8},(_,i)=>pixelFrame(action,i))}
export function renderPixelPNG(rows,scale=5){
 const c=document.createElement('canvas');c.width=c.height=SIZE*scale;const x=c.getContext('2d');x.imageSmoothingEnabled=false;
 rows.forEach((row,y)=>[...row].forEach((p,xx)=>{if(PALETTE[p]){x.fillStyle=PALETTE[p];x.fillRect(xx*scale,y*scale,scale,scale)}}));
 return c.toDataURL('image/png');
}
export const demoPNG=()=>renderPixelPNG(pixelFrame());
export const demoFrames=action=>pixelSequence(action).map(r=>renderPixelPNG(r));
