// Browser-safe PNG structure checks. Pixel decoding is performed at each boundary.
export function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
export function pngBytes(uri){
 if(typeof uri!=='string'||uri.length>=7000000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(uri))throw new Error('Invalid PNG data.');
 try{return Uint8Array.from(atob(uri.slice(22)),c=>c.charCodeAt(0))}catch{throw new Error('Invalid PNG encoding.')}
}
export function inspectPNG(bytes,maxSide=2048){
 const fail=()=>{throw new Error('Invalid or corrupt PNG.')};
 if(bytes.length<57||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))fail();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),idat=[];
 let width,height,depth,color,interlace,palette=0,seenData=false,dataEnded=false,ended=false;
 for(let at=8;at<bytes.length;){
  if(at+12>bytes.length)fail();const n=view.getUint32(at),end=at+12+n;if(end>bytes.length)fail();
  const type=String.fromCharCode(...bytes.subarray(at+4,at+8)),data=bytes.subarray(at+8,at+8+n);
  if(!/^[A-Za-z]{4}$/.test(type)||crc32(bytes.subarray(at+4,at+8+n))!==view.getUint32(at+8+n))fail();
  if(at===8&&type!=='IHDR')fail();
  if(type==='IHDR'){
   if(at!==8||n!==13)fail();width=view.getUint32(at+8);height=view.getUint32(at+12);depth=data[8];color=data[9];interlace=data[12];
   const depths={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
   if(!width||!height||width>maxSide||height>maxSide||!depths[color]?.includes(depth)||data[10]!==0||data[11]!==0||interlace>1)fail();
  }else if(type==='PLTE'){
   if(seenData||palette||!n||n%3||n>768||color===0||color===4)fail();palette=n/3;if(color===3&&palette>2**depth)fail();
  }else if(type==='IDAT'){
   if(dataEnded||(color===3&&!palette))fail();seenData=true;idat.push(data);
  }else if(type==='IEND'){
   if(n||!seenData||end!==bytes.length)fail();ended=true;
  }else if(type[0]===type[0].toUpperCase())fail();
  if(seenData&&type!=='IDAT')dataEnded=true;
  at=end;
 }
 if(!ended||!idat.some(p=>p.length))fail();
 return {width,height,depth,color,interlace,palette,idat};
}
