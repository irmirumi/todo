// Deterministic schedule simulation using actual UI functions; no Firebase access.
// node dev/tests/repro/races.mjs
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../../src/ui.js',import.meta.url),'utf8');
const auto=src.slice(src.indexOf('const autoOn='),src.indexOf('/* 휴지통:'));
const add=src.slice(src.indexOf('function addFromTpl('),src.indexOf('/* ---------- 카테고리 관리'));
const purge=src.slice(src.indexOf('function purgeTrash('),src.indexOf('/* 서버에서 받은 최신'));
const model=fs.readFileSync(new URL('../../src/model.js',import.meta.url),'utf8');
const queue=[];const db=new Map();
function device(){const c=vm.createContext({console,Date,Map,Set,S:{tasks:new Map(),trash:new Map(),tpls:new Map([['r_x',{id:'r_x',title:'원본',days:[4],cat:'k1',time:'09:00'}]])},today:'2026-10-29',catOf:()=>({archived:false}),uid8:()=> 's_id',setTask:(id,b)=>queue.push(()=>db.set(id,b)),patchTask:(id,p)=>queue.push(()=>db.set(id,{...db.get(id),...p})),delTask:id=>queue.push(()=>db.delete(id))});vm.runInContext(model+'\nconst {addDays,parse,okEnd}=TodoModel;\n'+auto+add+purge,c);return c;}
const a=device(),b=device();vm.runInContext('autoAdd()',a);const first=queue.splice(0);vm.runInContext('autoAdd()',b);
first.forEach(f=>f());const id='t_x_20261029';db.set(id,{...db.get(id),title:'폰에서 수정',done:true});queue.splice(0).forEach(f=>f());
assert.equal(db.get(id).title,'원본');assert.equal(db.get(id).done,false);console.log('CONFIRMED schedule: late second device set overwrites edit/completion; fixed ID does not protect data');
const c=device();c.S.trash.set('t_old',{id:'t_old',deletedAt:1});db.set('t_old',{deletedAt:1});vm.runInContext('purgeTrash()',c);db.set('t_old',{deletedAt:null,title:'복원됨'});queue.splice(0).forEach(f=>f());assert.equal(db.has('t_old'),false);console.log('CONFIRMED schedule: stale purge deletes restored task');
const q=vm.runInContext("TodoModel.parseQuick('2월31일 회의','2026-01-01')",c);assert.equal(q.date,'2026-02-31');console.log('CONFIRMED invalid calendar date:',q.date);
// Actual Firestore interleavings still require emulator/two clients. This models unconditional set/delete semantics only.
