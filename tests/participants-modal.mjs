import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('src/main.js','utf8');
const fn=source.slice(source.indexOf('function eventParticipantsModal('),source.indexOf('const school=createSchoolUI('));
for(const participants of [[],[{child_id:1,child_name:'Test child',child_age:5,guardian_name:'Test guardian'}]]){
 const views=[];
 const context=vm.createContext({S:{events:[{id:1,title:'Test event',max_capacity:10}],children:[]},api:async()=>({participants,count:participants.length,max_capacity:10}),showModal:(...args)=>views.push(args),escape:x=>String(x??''),icon:()=>'',initials:()=>'',age:()=>5});
 vm.runInContext(fn,context);context.eventParticipantsModal(1);await new Promise(r=>setImmediate(r));
 assert.equal(views.length,2);assert(!views[1][1].includes('Erro'));assert(views[1][1].includes(`${participants.length}/10`));
 assert(views[1][2].includes(participants.length?'Test child':'Nenhum inscrito ainda'));
}
console.log('Participant modal renders API object responses with zero or one registration');
