// A shared visual contract for imported originals and generated poses.
export const PET_SIZE=320;
export const PET_MARGIN=24;
export const PET_STYLE='One complete supplied subject silhouette (preserve cropped portraits as cropped portraits) fitting a 320 by 320 pixel-pet canvas, with at least 24 pixels of breathing room, feet or lowest point near the same baseline, a readable silhouette, a small deliberate palette, crisp hard pixel edges, and no scenery, text, cast shadow, gradients, or extra characters. Preserve the source character’s defining silhouette, face, colors, attached clothing and accessories; simplify tiny texture only when needed for readable animation.';

export function fitPetBounds(bounds,width,height,sizePercent=100){
 if(!bounds||!Number.isFinite(bounds.width)||!Number.isFinite(bounds.height)||bounds.width<=0||bounds.height<=0||width<=0||height<=0)throw new Error('Character bounds are unavailable.');
 if(!Number.isFinite(sizePercent)||sizePercent<50||sizePercent>114)throw new Error('Pet size must be between 50% and 114%.');
 const scale=Math.min((PET_SIZE-2*PET_MARGIN)/bounds.width,(PET_SIZE-2*PET_MARGIN)/bounds.height)*sizePercent/100;
 const heightOnCanvas=bounds.height*scale;
 const baseline=Math.min(PET_SIZE-4,Math.max(PET_SIZE-PET_MARGIN,Math.ceil(heightOnCanvas)+4));
 return {scale,x:Math.round((PET_SIZE-bounds.width*scale)/2-bounds.left*scale),y:Math.round(baseline-(bounds.bottom+1)*scale)};
}

export function assessPetStyle(pixels,width,height,{backgroundSeparated=false}={}){
 if(pixels.length!==width*height*4||width<1||height<1)throw new Error('Invalid character pixels.');
 let left=width,top=height,right=-1,bottom=-1,visible=0;
 const colors=new Set(),stride=Math.max(1,Math.floor(width*height/16000));
 for(let i=0;i<width*height;i++){
  const at=i*4;if(pixels[at+3]<=128)continue;
  const x=i%width,y=Math.floor(i/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);visible++;
  if(i%stride===0)colors.add((pixels[at]>>5)<<6|(pixels[at+1]>>5)<<3|(pixels[at+2]>>5));
 }
 if(!visible)return {bounds:null,issues:['No visible character remains. Adjust background removal or choose another image.'],ready:false};
 const bounds={left,top,right,bottom,width:right-left+1,height:bottom-top+1};
 const issues=[];
 if(!backgroundSeparated)issues.push('画面仍包含背景，请先去背或转为像素角色。');
 if(visible>width*height*.85)issues.push('主体几乎铺满画布，请检查是否还包含场景或纯色背景。');
 if(left===0||top===0||right===width-1||bottom===height-1)issues.push('主体接触画布边缘，请检查耳朵、脚、尾巴和配件是否被裁切。');
 if(Math.max(bounds.width/bounds.height,bounds.height/bounds.width)>2.5)issues.push('角色比例较长或较高，请检查缩小后的细节是否清晰。');
 if(colors.size>90)issues.push('画面颜色变化较多，简化为像素风后更容易保持动画一致。');
 return {bounds,issues,ready:true};
}

export function importPreviewSize(width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192||width*height>32000000)throw new Error('Choose an image under 32 megapixels and 8192 pixels per side.');
 const scale=Math.min(1,1024/Math.max(width,height));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
