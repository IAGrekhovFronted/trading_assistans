export const MAX_HINT_IMAGE_BYTES=5*1024*1024;
export const HINT_IMAGE_TYPES=['image/png','image/jpeg','image/webp','image/gif'];
export function assertHintImage(image){
  if(!image||typeof image.name!=='string'||!image.name.trim()||image.name.length>500||typeof image.data!=='string')throw new Error('Некорректный скриншот');
  if(image.data.length>Math.ceil(MAX_HINT_IMAGE_BYTES/3)*4+64)throw new Error('Скриншот больше 5 МБ');
  const prefix=image.data.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,/);
  if(!prefix)throw new Error('Нужен PNG, JPEG, WebP или GIF');
  const data=image.data.slice(prefix[0].length);
  if(!data.length||data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw new Error('Повреждённые данные скриншота');
  const bytes=data.length/4*3-(data.endsWith('==')?2:data.endsWith('=')?1:0);
  if(bytes>MAX_HINT_IMAGE_BYTES)throw new Error('Скриншот больше 5 МБ');
  return image;
}
export function validateHintFile(file){
  if(!file||!HINT_IMAGE_TYPES.includes(file.type))throw new Error('Нужен PNG, JPEG, WebP или GIF');
  if(!Number.isInteger(file.size)||file.size<1||file.size>MAX_HINT_IMAGE_BYTES)throw new Error('Скриншот должен быть не больше 5 МБ');
  return file;
}
export function readHintImageFile(file){
  validateHintFile(file);
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Не удалось прочитать скриншот'));
    reader.onload=()=>{try{resolve(assertHintImage({name:file.name||'Скриншот',data:reader.result}));}catch(e){reject(e);}};
    reader.readAsDataURL(file);
  });
}

export const MAX_SCHEME_IMAGES=10;
export function assertImageGallery(images){
  if(!Array.isArray(images)||images.length>MAX_SCHEME_IMAGES)throw new Error('В галерее может быть не больше '+MAX_SCHEME_IMAGES+' изображений');
  const ids=new Set();
  for(const image of images){
    assertHintImage(image);
    if(typeof image.id!=='string'||image.id.length>100||!/^[A-Za-z0-9_-]+$/.test(image.id)||['__proto__','constructor','prototype'].includes(image.id)||ids.has(image.id))throw new Error('Некорректный ID изображения в галерее');
    ids.add(image.id);
  }
  return images;
}
export function imageGallery(owner,plural,legacy){
  if(owner?.[plural]!==undefined)return owner[plural];
  return owner?.[legacy]?[{...owner[legacy],id:'legacy'}]:[];
}
export function setImageGallery(owner,plural,legacy,images){
  owner[plural]=assertImageGallery(images);delete owner[legacy];
}
