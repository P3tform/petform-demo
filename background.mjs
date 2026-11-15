// Conservative, local edge-connected background detection. Does not infer object semantics.
export function removeBackground(data,width,height,tolerance=28){
 const pixels=new Uint8ClampedArray(data), n=width*height;
 if(data.length!==n*4||!n)throw new Error('Invalid image pixels.');
 const distance=(i,c)=>Math.max(...c.map((v,k)=>Math.abs(data[i*4+k]-v)));
 const border=[];for(let x=0;x<width;x++){border.push(x,(height-1)*width+x)}for(let y=1;y<height-1;y++){border.push(y*width,y*width+width-1)}
 const opaque=border.filter(i=>data[i*4+3]>240);
 if(opaque.length<border.length*.5)return {pixels,removed:0,confidence:false,transparent:true,reason:'检测到透明背景，已保留现有边缘。'};
 const bins=new Map();for(const i of opaque){const c=[0,1,2].map(k=>Math.round(data[i*4+k]/24)),key=c.join(',');let b=bins.get(key);if(!b){b={count:0,sum:[0,0,0]};bins.set(key,b)}b.count++;b.sum.forEach((_,k)=>b.sum[k]+=data[i*4+k])}
 const best=[...bins.values()].sort((a,b)=>b.count-a.count)[0],color=best.sum.map(x=>Math.round(x/best.count));
 const support=opaque.filter(i=>distance(i,color)<=tolerance).length/opaque.length;
 if(support<.7)return {pixels,removed:0,confidence:false,reason:'背景较复杂，自动去背需要更简单的背景。'};
 const seen=new Uint8Array(n),queue=new Int32Array(n);let head=0,tail=0;
 const add=i=>{if(!seen[i]){seen[i]=1;if(data[i*4+3]<10||distance(i,color)<=tolerance)queue[tail++]=i}};
 border.forEach(add);while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);pixels[i*4+3]=0;if(x)add(i-1);if(x<width-1)add(i+1);if(y)add(i-width);if(y<height-1)add(i+width)}
 if(tail>n*.97)return {pixels:new Uint8ClampedArray(data),removed:0,confidence:false,reason:'无法可靠分离主体，已保留原图。'};
 return {pixels,removed:tail,confidence:true,reason:'已去除简单背景，请检查浅色细节和边缘。'};
}

// Generated images may already have alpha; those need no second cutout pass.
export function prepareGeneratedPixels(data,width,height,needsLocalCutout){
 if(!needsLocalCutout)return new Uint8ClampedArray(data);
 const result=removeBackground(data,width,height,28);
 if(result.confidence||result.transparent===true)return result.pixels;
 throw new Error('无法安全去除生成图片的背景：'+result.reason);
}
