// 角色資料（純皮膚）——多遊戲平台重構後：所有遊戲機制與 stats 無關，
// 這裡只留 id / name / nameEn / type / color 給 UI 顯示用。
// id 對應 packages/client/src/assets/characters/<id>.png 貼圖檔名。

export const CAT_BREEDS = [
  { id: 'munchkin',           name: '曼赤肯',       nameEn: 'Munchkin',           type: 'cat', color: '#D4A574' },
  { id: 'persian',            name: '波斯貓',       nameEn: 'Persian',            type: 'cat', color: '#F5E6D3' },
  { id: 'siamese',            name: '暹羅貓',       nameEn: 'Siamese',            type: 'cat', color: '#C4A882' },
  { id: 'scottish_fold',      name: '蘇格蘭摺耳',   nameEn: 'Scottish Fold',      type: 'cat', color: '#B8A590' },
  { id: 'american_shorthair', name: '美國短毛貓',   nameEn: 'American Shorthair', type: 'cat', color: '#C0C5CF' },
  { id: 'bengal',             name: '孟加拉貓',     nameEn: 'Bengal',             type: 'cat', color: '#C4943A' },
  { id: 'ragdoll',            name: '布偶貓',       nameEn: 'Ragdoll',            type: 'cat', color: '#E8DDD0' },
  { id: 'russian_blue',       name: '俄羅斯藍貓',   nameEn: 'Russian Blue',       type: 'cat', color: '#8BA4B8' },
  { id: 'sphynx',             name: '斯芬克斯',     nameEn: 'Sphynx',             type: 'cat', color: '#D4B896' },
  { id: 'british_shorthair',  name: '英國短毛',     nameEn: 'British Shorthair',  type: 'cat', color: '#7B8B9E' },
];

export const DOG_BREEDS = [
  { id: 'husky',              name: '哈士奇',       nameEn: 'Husky',              type: 'dog', color: '#A0B4C8' },
  { id: 'golden',             name: '黃金獵犬',     nameEn: 'Golden Retriever',   type: 'dog', color: '#DAA520' },
  { id: 'shiba',              name: '柴犬',         nameEn: 'Shiba Inu',          type: 'dog', color: '#E8A840' },
  { id: 'corgi',              name: '柯基',         nameEn: 'Corgi',              type: 'dog', color: '#D4923A' },
  { id: 'poodle',             name: '貴賓犬',       nameEn: 'Poodle',             type: 'dog', color: '#F0E0F0' },
  { id: 'german_shepherd',    name: '德國牧羊犬',   nameEn: 'German Shepherd',    type: 'dog', color: '#5C4033' },
  { id: 'border_collie',      name: '邊境牧羊犬',   nameEn: 'Border Collie',      type: 'dog', color: '#3A3A3A' },
  { id: 'bulldog',            name: '鬥牛犬',       nameEn: 'Bulldog',            type: 'dog', color: '#C4A882' },
  { id: 'dalmatian',          name: '大麥町',       nameEn: 'Dalmatian',          type: 'dog', color: '#F5F5F5' },
  { id: 'chihuahua',          name: '吉娃娃',       nameEn: 'Chihuahua',          type: 'dog', color: '#E8B486' },
];

export const ALL_CHARACTERS = [...CAT_BREEDS, ...DOG_BREEDS];

export function getCharacterById(id) {
  return ALL_CHARACTERS.find(c => c.id === id);
}
