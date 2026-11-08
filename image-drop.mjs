import {validateHintFile} from './hint-images.mjs';

export function isFileDrag(transfer){
  return Boolean(transfer&&(Array.from(transfer.types||[]).includes('Files')||transfer.files?.length));
}
export function imageFilesFromDrop(transfer,maxFiles=1){
  const files=Array.from(transfer?.files||[]);
  if(!files.length)throw new Error('Перетащи файл изображения с компьютера.');
  if(files.length>maxFiles)throw new Error(maxFiles===1?'В эту область можно прикрепить только один скриншот.':'Можно добавить не больше '+maxFiles+' скриншотов за раз.');
  files.forEach(validateHintFile);
  return files;
}
export function bindImageDrop({root,eventTarget=root.ownerDocument,onFiles,onError}){
  let active=null,depth=0;
  const zoneFor=e=>{const zone=e.target?.closest?.('[data-image-drop]');return zone&&root.contains(zone)?zone:null;};
  const clear=()=>{active?.classList.remove('is-dragover');active=null;depth=0;};
  function activate(zone){if(active!==zone){clear();active=zone;depth=1;zone.classList.add('is-dragover');}}
  const handlers={
    dragenter(e){
      if(!isFileDrag(e.dataTransfer))return;
      e.preventDefault();const zone=zoneFor(e);
      if(!zone){clear();return;}
      if(active===zone)depth++;else activate(zone);
    },
    dragover(e){
      if(!isFileDrag(e.dataTransfer))return;
      e.preventDefault();const zone=zoneFor(e);
      if(zone)activate(zone);else clear();
      e.dataTransfer.dropEffect=zone?'copy':'none';
    },
    dragleave(e){
      if(zoneFor(e)!==active)return;
      depth=Math.max(0,depth-1);if(!depth)clear();
    },
    async drop(e){
      const zone=zoneFor(e),fileDrag=isFileDrag(e.dataTransfer);
      if(!zone&&!fileDrag)return;
      e.preventDefault();clear();
      if(!zone){onError('Перетащи скриншот в область добавления изображений.');return;}
      try{
        const limit=Number(zone.dataset.maxFiles)||1;
        await onFiles(imageFilesFromDrop(e.dataTransfer,limit),zone);
      }catch(error){onError(error.message||'Не удалось добавить изображение.');}
    },
    dragend:clear
  };
  for(const [name,handler]of Object.entries(handlers))eventTarget.addEventListener(name,handler);
  return ()=>{clear();for(const [name,handler]of Object.entries(handlers))eventTarget.removeEventListener(name,handler);};
}
