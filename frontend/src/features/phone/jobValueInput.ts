const JOB_VALUE_EDIT = /^[0-9]*(?:\.[0-9]{0,2})?$/;
const JOB_VALUE_GROUPED_EDIT = /^(?:[0-9]*|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]{0,2})?$/;
const JOB_VALUE_FINAL = /^(?:(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]{0,2})?|\.[0-9]{1,2})$/;
export function formatJobValue(text: string){
 const [whole,fraction]=text.replace(/,/g,'').split('.');
 return whole.replace(/\B(?=([0-9]{3})+(?![0-9]))/g,',')+(fraction===undefined?'':'.'+fraction);
}
export function bindJobValueInput(input: HTMLInputElement) {
 const listeners: Array<[string, EventListener]> = [];
 const listen = (name: string, listener: (event: any) => void) => {
  listeners.push([name, listener]); input.addEventListener(name, listener);
 };
 if(input.dataset.numericJobValue==='true')return;
 input.dataset.numericJobValue='true';input.type='text';input.inputMode='decimal';
 input.setAttribute('pattern','([0-9]+|[0-9]{1,3}(,[0-9]{3})+)([.][0-9]{0,2})?|[.][0-9]{1,2}');
 input.setAttribute('autocapitalize','off');input.spellcheck=false;
 if(JOB_VALUE_GROUPED_EDIT.test(input.value))input.value=formatJobValue(input.value);
 let previous={value:input.value,start:0,end:0,direction:'none' as 'none' | 'forward' | 'backward'},pendingValue: string | null=null,composing=false;
 const plain=(text: string)=>text.replace(/,/g,'');
 let history: Array<typeof previous>=[],historyIndex=-1,applyingHistory=false;
 function remember(){
  if(!composing&&JOB_VALUE_GROUPED_EDIT.test(input.value)){
   previous={value:input.value,start:input.selectionStart??input.value.length,end:input.selectionEnd??input.value.length,direction:input.selectionDirection||'none'};
   if(history[historyIndex]?.value===input.value)history[historyIndex]={...previous};
  }
 }
 function recordHistory(){
  if(applyingHistory)return;
  if(history[historyIndex]?.value===input.value)return;
  history.splice(historyIndex+1);history.push({...previous});
  if(history.length>100)history.shift();
  historyIndex=history.length-1;
 }
 function stepHistory(delta: number){
  remember();const next=historyIndex+delta;
  if(next<0||next>=history.length)return;
  historyIndex=next;previous={...history[next]};restore();pendingValue=null;
  applyingHistory=true;
  try{input.dispatchEvent(new Event('input',{bubbles:true}));}finally{applyingHistory=false;}
 }
 function proposed(text: string){
  const a=input.selectionStart??input.value.length,b=input.selectionEnd??a;
  return input.value.slice(0,a)+text+input.value.slice(b);
 }
 function restore(){
  input.value=previous.value;
  input.setSelectionRange(previous.start,previous.end,previous.direction);
 }
 function formatSelection(knownEdit=false){
  const raw=input.value,clean=plain(raw);
  if(!JOB_VALUE_EDIT.test(clean)||(!knownEdit&&!JOB_VALUE_GROUPED_EDIT.test(raw))){restore();return;}
  const a=input.selectionStart??raw.length,b=input.selectionEnd??a,direction=input.selectionDirection||'none';
  const formatted=formatJobValue(clean);
  // Map both selection ends by numeric characters, preserving which side of a
  // surviving comma the caret occupies. Never send a middle edit to the end.
  const position=(offset: number)=>{
   const count=plain(raw.slice(0,offset)).length;
   let pos=0,seen=0;
   while(pos<formatted.length&&seen<count){if(formatted[pos]!==',')seen++;pos++;}
   if(offset>0&&raw[offset-1]===','&&formatted[pos]===',')pos++;
   return pos;
  };
  if(formatted!==raw){
   input.value=formatted;
   input.setSelectionRange(position(a),position(b),direction);
  }
  remember();recordHistory();
 }
 ['focus','select','keydown','pointerup'].forEach(name=>listen(name,remember));
 // Reformatting input.value can invalidate the browser's native undo entries.
 // Keep a bounded history of accepted edits, including selection/caret positions.
 listen('keydown',e=>{
  if(composing||e.isComposing||!(e.ctrlKey||e.metaKey)||e.altKey)return;
  const key=e.key.toLowerCase();
  if(key!=='z'&&!(key==='y'&&e.ctrlKey))return;
  e.preventDefault();stepHistory(key==='y'||e.shiftKey?1:-1);
 });
 listen('beforeinput',e=>{
  if(composing||e.isComposing||/Composition/.test(e.inputType||''))return;
  if(['historyUndo','historyRedo'].includes(e.inputType)&&e.cancelable){
   e.preventDefault();stepHistory(e.inputType==='historyUndo'?-1:1);return;
  }
  remember();
  if(e.inputType?.startsWith('insert')&&e.data!=null){
   const candidate=proposed(e.data);
   // Commas are inserted by the formatter; typed signs, letters and exponents
   // cannot turn into a different valid amount by silently stripping them.
   const external=['insertFromPaste','insertReplacementText','insertFromYank'].includes(e.inputType);
   const validText=external?JOB_VALUE_GROUPED_EDIT.test(e.data):/^[0-9.]*$/.test(e.data);
   if(!validText||!JOB_VALUE_EDIT.test(plain(candidate))){
    pendingValue=null;if(e.cancelable)e.preventDefault();return;
   }
   pendingValue=candidate;
  }
  const a=input.selectionStart??0,b=input.selectionEnd??a;
  if(a!==b||!e.cancelable)return;
  // Deleting a separator must also delete the adjacent digit; otherwise the
  // formatter would put the same comma back and Backspace/Delete would stall.
  if(e.inputType==='deleteContentBackward'&&a>0&&input.value[a-1]===','){
   e.preventDefault();input.setRangeText('',Math.max(0,a-2),a,'end');
  }else if(e.inputType==='deleteContentForward'&&input.value[a]===','){
   e.preventDefault();input.setRangeText('',a,Math.min(input.value.length,a+2),'end');
  }else return;
  formatSelection(true);pendingValue=null;
  input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 listen('paste',e=>{
  if(composing)return;
  remember();if(!e.clipboardData)return;
  const pasted=e.clipboardData.getData('text/plain'),candidate=proposed(pasted);
  if(!JOB_VALUE_GROUPED_EDIT.test(pasted)||!JOB_VALUE_EDIT.test(plain(candidate))){
   e.preventDefault();pendingValue=null;
   input.dispatchEvent(new CustomEvent('money-input-rejected', {bubbles:true,detail:'วางได้เฉพาะตัวเลข เช่น 1,500 หรือ 1,500.50'}));
   return;
  }
  pendingValue=candidate;
 });
 // Drop positions differ between browsers; preserve the original paste-only rule.
 listen('drop',e=>e.preventDefault());
 listen('compositionstart',()=>{remember();composing=true;pendingValue=null;});
 listen('compositionend',e=>{
  composing=false;
  const expected=previous.value.slice(0,previous.start)+(e.data||'')+previous.value.slice(previous.end);
  formatSelection(input.value===expected&&/^[0-9.]*$/.test(e.data||''));
  input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 // Fallback covers autofill, voice input and non-cancelable beforeinput. Unknown
 // replacement text still needs valid grouping; letters are never sanitized away.
 listen('input',e=>{
  if(composing||e.isComposing)return;
  if(['historyUndo','historyRedo'].includes(e.inputType)){restore();stepHistory(e.inputType==='historyUndo'?-1:1);return;}
  const knownEdit=input.value===pendingValue||e.inputType?.startsWith('delete');
  formatSelection(knownEdit);pendingValue=null;
 });
 remember();recordHistory();
 return () => { for(const [name,listener] of listeners)input.removeEventListener(name,listener);delete input.dataset.numericJobValue; };
}

