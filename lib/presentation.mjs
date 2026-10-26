import {portraitAssetId,portraitAssetUrl} from '../public/play/portrait-image.js';
class PresentationError extends Error { constructor(message) { super(message); this.status = 400; } }
// Presentation data never mutates game resources, rules, or resolved actions.
export function imageSource(value, optional = true) {
  if (!value && optional) return '';
  if (typeof value !== 'string' || value.length > 350000) throw new PresentationError('이미지는 250KB 이하로 준비해주세요.');
  if (value === '/play/alley.png') return value;
  if (/^\/api\/table\?room=[a-f0-9-]{1,64}&asset=[a-f0-9-]{36}$/.test(value)) return value;
  if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new PresentationError('PNG, JPEG, WebP 이미지만 사용할 수 있습니다.');
  return value;
}
export function portraitSet(items) {
  if (!Array.isArray(items) || items.length > 6) throw new PresentationError('초상화 이미지는 인물당 6개까지 등록할 수 있습니다.');
  const ids = new Set();
  return items.map(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(item.id) || ids.has(item.id)) throw new PresentationError('초상화 ID가 올바르지 않거나 중복됩니다.');
    if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 40) throw new PresentationError('초상화 이름은 1~40자로 입력하세요.');
    ids.add(item.id);
    const crops={};
    for(const key of ['crop','tokenCrop'])if(item[key]!==undefined){
      const c=item[key];
      if(!c||!['x','y','w','h'].every(k=>Number.isFinite(c[k]))||c.x<0||c.y<0||c.w<.0001||c.h<.0001||c.x+c.w>1.000001||c.y+c.h>1.000001)
        throw new PresentationError('초상화 구도가 이미지 범위를 벗어났습니다.');
      crops[key]={x:c.x,y:c.y,w:c.w,h:c.h};
    }
    return { id: item.id, label: item.label.trim(), image: portraitAssetId(item.image)?portraitAssetUrl(portraitAssetId(item.image)):imageSource(item.image, false),...(item.tokenFocus==='face'?{tokenFocus:'face'}:{}),...crops };
  });
}
export function presentationFields(room, input) {
  const background = input.background === undefined ? (room.scene.background === 'alley' ? '/play/alley.png' : room.scene.background || '/play/alley.png') : imageSource(input.background, false);
  const speakerId = typeof input.speakerId === 'string' ? input.speakerId : '';
  const speaker = [...room.characters, ...(room.cast || [])].find(c => c.id === speakerId);
  if (speakerId && !speaker) throw new PresentationError('등록한 화자를 선택하세요.');
  const expressionId = typeof input.expressionId === 'string' ? input.expressionId : '';
  if (expressionId && !speaker?.portraits?.some(p => p.id === expressionId)) throw new PresentationError('화자에게 등록한 초상화만 사용할 수 있습니다.');
  return { background, speakerId, expressionId };
}
