// Conservative, deterministic extraction: the declaration remains the source of intent.
export function actionSpeech(text,otherNames=[]) {
 const source=String(text||''),lines=[];
 const quotes=/"([^"\n]+)"|“([^”\n]+)”|「([^」\n]+)」|『([^』\n]+)』|‘([^’\n]+)’|(?<![A-Za-z0-9])'([^'\n]+)'(?![A-Za-z0-9])/gu;
 let match;
 while((match=quotes.exec(source))){
  const before=source.slice(0,match.index),after=source.slice(quotes.lastIndex);
  if([...otherNames,'그','그녀','상대'].some(name=>['이','가','은','는'].some(particle=>before.trimEnd().endsWith(name+particle))))continue;
  // Written labels, internal thoughts and someone else's recalled words are not spoken lines.
  if(/^(?:\s*(?:이라고|라고|라는|이라는|하고))?\s*(?:적힌|쓰인|써진|글|표지|간판|문구|이름|적|쓰|생각)/u.test(after)||/^[을를]\s*(?:읽|생각|열|집|들|본)/u.test(after))continue;
  if(/(?:생각|속으로|회상|말했던|했던 말|의 말|글귀|간판|표지판|문구)[^.!?\n]*$/u.test(before))continue;
  if(/(?:[이가] 말(?:한다|했다|하며|하길)|[이가] 했던 말)\s*[:：]?\s*$/u.test(before))continue;
  const line=match.slice(1).find(v=>v!==undefined)?.trim();if(line)lines.push(line);
 }
 if(lines.length)return lines;
 // Unquoted speech is supported only at the beginning, avoiding invented clause boundaries.
 if(/["“”「」『』‘’']/u.test(source))return [];
 const plain=source.match(/^(.+?)(?:이라고|라고)\s*(?:말하(?:며|면서|고|다)|말한다|말했다|외치며|외친다|묻는다|물으며)(?:[\s.,!?]|$)/u);
 if(!plain||/(?:생각|적힌|쓰인|간판|표지판|[이가] 말)/u.test(plain[1]))return [];
 return [plain[1].trim()];
}
