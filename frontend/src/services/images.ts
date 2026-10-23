import { tr } from '../i18n/tr';
/** maxSide: the longest edge kept. Document logos keep 960px; goal pictures, shown at 60px at most,
 * keep 256px (owner, 2026-10-21: one account loaded 1.4 MB of goal pictures on every visit). */
export async function imageFileToDataUrl(file:File, { maxSide = 960 }: { maxSide?: number } = {}):Promise<string> {
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error(tr("รองรับรูป PNG, JPEG และ WebP"));
 if(file.size>3*1024*1024)throw new Error(tr("ภาพต้องมีขนาดไม่เกิน 3MB"));
 const image=await createImageBitmap(file);
 try {
  const scale=Math.min(1,maxSide/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext('2d');if(!context)throw new Error(tr("ประมวลผลภาพไม่สำเร็จ"));context.drawImage(image,0,0,canvas.width,canvas.height);
  let result=canvas.toDataURL('image/webp',0.85);
  for(const quality of [0.7,0.55,0.4]){if(result.length<480000)break;result=canvas.toDataURL('image/webp',quality);}
  if(result.length>=480000)throw new Error(tr("ภาพมีรายละเอียดมากเกินไป กรุณาเลือกภาพที่เล็กลง"));return result;
 }finally{image.close();}
}

/** A smaller copy of a saved picture (data URL), at most maxSide on its longest edge; null when it is
 * not a picture or would not get smaller. Goal pictures saved before uploads were resized can weigh a
 * megabyte (owner, 2026-10-21, approved shrinking them). */
export async function shrinkImageDataUrl(dataUrl: string, maxSide = 256): Promise<string | null> {
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,/.test(dataUrl)) return null;
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const result = canvas.toDataURL('image/webp', 0.85);
  return result.startsWith('data:image/') && result.length < dataUrl.length ? result : null;
}
