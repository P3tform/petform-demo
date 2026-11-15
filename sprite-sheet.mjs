// Keep each full grid cell. Cropping square cells can clip feet or ears when
// OpenClaw returns a square sheet, even though the six poses are all present.
export const POSE_COUNTS=[4,6,8,12];
export function poseGrid(count=6){
 if(!POSE_COUNTS.includes(count))throw new Error('Choose 4, 6, 8 or 12 generated poses.');
 const columns=count===4?2:count===6?3:4;
 return {count,columns,rows:count/columns};
}
export function gridCells(width,height,count=6){
 const {columns,rows}=poseGrid(count);
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<columns*64||height<rows*64)throw new Error('Generated sheet is too small.');
 const ratio=width/height;
 if(Math.min(Math.abs(ratio-columns/rows),Math.abs(ratio-1))>.03)throw new Error('The generated sheet has unexpected proportions. It was saved locally for inspection.');
 return Array.from({length:count},(_,i)=>{const col=i%columns,row=Math.floor(i/columns),x=Math.floor(col*width/columns),y=Math.floor(row*height/rows);return {x,y,width:Math.floor((col+1)*width/columns)-x,height:Math.floor((row+1)*height/rows)-y}});
}
export function sixGridCells(width,height){return gridCells(width,height,6)}
export function opaqueBounds(data,width,height){
 if(data.length!==width*height*4)throw new Error('Invalid frame pixels.');
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>128){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}
 if(right<left)return null;
 return {left,top,right,bottom,width:right-left+1,height:bottom-top+1};
}
// One transform for the entire animation keeps intentional hops and bobs.
export function alignmentTransform(original,firstPose){
 if(!original||!firstPose||!original.width||!firstPose.width)throw new Error('Character bounds could not be measured.');
 const widthScale=original.width/firstPose.width,heightScale=original.height/firstPose.height;
 const scale=Math.min(Math.sqrt(widthScale*heightScale),Math.min(widthScale,heightScale)*1.06);
 return {scale,x:(original.left+original.right+1)/2-((firstPose.left+firstPose.right+1)/2)*scale,y:original.bottom+1-(firstPose.bottom+1)*scale};
}

// Fit the union of all poses, preserving one shared scale and translation.
export function fitAnimationTransform(original,poses,size=320,margin=8){
 if(!poses.length||poses.some(p=>!p))throw new Error('All pose bounds are required.');
 const base=alignmentTransform(original,poses[0]);
 const left=Math.min(...poses.map(p=>p.left)),top=Math.min(...poses.map(p=>p.top));
 const right=Math.max(...poses.map(p=>p.right+1)),bottom=Math.max(...poses.map(p=>p.bottom+1));
 const scale=Math.min(base.scale,(size-2*margin)/(right-left),(size-2*margin)/(bottom-top));
 // Keep the original baseline/center when possible, then shift the group into view.
 const x=(original.left+original.right+1)/2-(poses[0].left+poses[0].right+1)/2*scale;
 const y=original.bottom+1-(poses[0].bottom+1)*scale;
 return {scale,x:Math.max(margin-left*scale,Math.min(size-margin-right*scale,x)),y:Math.max(margin-top*scale,Math.min(size-margin-bottom*scale,y))};
}

// Fitting cannot recover pixels clipped by the provider's grid or remove a
// neighboring pose that spills across a cell boundary. Reject, never erase.
export function requirePoseCellMargin(bounds,width,height,index=0,edges={left:true,top:true,right:true,bottom:true}){
 if(!bounds)throw new Error('A generated pose is empty. No frames were applied.');
 if((edges.left&&bounds.left<=0)||(edges.top&&bounds.top<=0)||(edges.right&&bounds.right>=width-1)||(edges.bottom&&bounds.bottom>=height-1))
  throw new Error('Generated pose '+(index+1)+' touches a sheet-cell edge; it may be clipped or contain part of a neighboring pose. No frames were applied. The raw sheet is saved locally. Regenerate with smaller movement and more space inside each cell.');
 return bounds;
}

// The outside of a sheet can preserve a deliberate portrait crop. Only shared
// dividers are a hard separation constraint; outer-edge clipping needs review.
export function requirePoseCellSeparation(bounds,cell,sheetWidth,sheetHeight,index=0){
 return requirePoseCellMargin(bounds,cell.width,cell.height,index,{left:cell.x>0,top:cell.y>0,right:cell.x+cell.width<sheetWidth,bottom:cell.y+cell.height<sheetHeight});
}

// Later tails, limbs or stray pixels must never resize/recenter all poses.
export function stableAnimationTransform(original,poses){
 if(!poses.length||!poses[0])throw new Error('The first pose is required for alignment.');
 return alignmentTransform(original,poses[0]);
}
export function translatedBoundsFit(bounds,dx,dy,size=320){
 return !!bounds&&Number.isInteger(dx)&&Number.isInteger(dy)&&bounds.left+dx>=0&&bounds.top+dy>=0&&bounds.right+dx<size&&bounds.bottom+dy<size;
}

// Integer-only translation; never rescale or discard any visible source pixels.
export function safeFrameOffset(bounds,dx,dy,size=320){
 if(!bounds||![dx,dy,size,bounds.left,bounds.top,bounds.right,bounds.bottom].every(Number.isFinite)||size<=0||bounds.left<0||bounds.top<0||bounds.right>=size||bounds.bottom>=size||bounds.left>bounds.right||bounds.top>bounds.bottom)throw new Error('Invalid alignment bounds.');
 const x=Math.max(-bounds.left,Math.min(size-1-bounds.right,Math.round(dx))),y=Math.max(-bounds.top,Math.min(size-1-bounds.bottom,Math.round(dy)));
 return {x:x||0,y:y||0,limited:x!==Math.round(dx)||y!==Math.round(dy)};
}
