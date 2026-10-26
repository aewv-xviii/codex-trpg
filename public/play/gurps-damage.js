// Basic Set B16: one shared damage table for server calculations and display modes.
const thrust=['1d6-6','1d6-6','1d6-5','1d6-5','1d6-4','1d6-4','1d6-3','1d6-3','1d6-2','1d6-2','1d6-1','1d6-1','1d6','1d6','1d6+1','1d6+1','1d6+2','1d6+2','2d6-1','2d6-1','2d6','2d6','2d6+1','2d6+1','2d6+2','2d6+2','3d6-1','3d6-1','3d6','3d6'];
const swing=['1d6-5','1d6-5','1d6-4','1d6-4','1d6-3','1d6-3','1d6-2','1d6-2','1d6-1','1d6','1d6+1','1d6+2','2d6-1','2d6','2d6+1','2d6+2','3d6-1','3d6','3d6+1','3d6+2','4d6-1','4d6','4d6+1','4d6+2','5d6-1','5d6','5d6+1','5d6+1','5d6+2','5d6+2'];
export function strengthDamage(st,basis='thrust'){if(!Number.isInteger(st)||!['thrust','swing'].includes(basis))return null;return (basis==='swing'?swing:thrust)[st-1]??null;}
export function addDamage(damage,add){const m=/^(\d+)d6([+-]\d+)?$/.exec(damage);if(!m||!Number.isInteger(add))throw Error('피해 식을 확인하세요.');const n=Number(m[2]||0)+add;return m[1]+'d6'+(n>0?'+'+n:n<0?n:'');}
