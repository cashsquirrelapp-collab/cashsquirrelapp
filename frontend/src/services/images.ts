export async function imageFileToDataUrl(file:File):Promise<string> {
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('รองรับรูป PNG, JPEG และ WebP');
 if(file.size>3*1024*1024)throw new Error('ภาพต้องมีขนาดไม่เกิน 3MB');
 const image=await createImageBitmap(file);
 try {
  const scale=Math.min(1,960/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext('2d');if(!context)throw new Error('ประมวลผลภาพไม่สำเร็จ');context.drawImage(image,0,0,canvas.width,canvas.height);
  let result=canvas.toDataURL('image/webp',0.85);
  for(const quality of [0.7,0.55,0.4]){if(result.length<480000)break;result=canvas.toDataURL('image/webp',quality);}
  if(result.length>=480000)throw new Error('ภาพมีรายละเอียดมากเกินไป กรุณาเลือกภาพที่เล็กลง');return result;
 }finally{image.close();}
}
