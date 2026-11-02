'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 10000);
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
const ROOT = __dirname;
const MAX_BODY = 40000;
const MAX_COMMAND = 8000;
const MAX_ROUNDS = 3;
const PASS_SCORE = 85;

const EMPLOYEES = [
  {name:'Dasturchi', expertise:'Dastur, backend/frontend kod, integratsiya, texnik yechimlar', instruction:'Kod va texnik yechimlarni aniq, izohlangan va ishga tushirishga tayyor yoz. Fayllarni yaratgan yoki kodni ishga tushirgan deb da’vo qilma.'},
  {name:'Dizayner', expertise:'UX/UI, dizayn tizimi, foydalanuvchi oqimi, vizual konsepsiya', instruction:'Foydalanish qulayligi, accessibility, responsive va izchil dizaynni ko‘zda tut. Kerak bo‘lsa komponentlar va dizayn tokenlarini ber.'},
  {name:'Kontent mutaxassisi', expertise:'Matn, hujjat, mahsulot tavsifi, ssenariy va kontent strategiyasi', instruction:'Auditoriyaga mos, ravon va faktlarga ehtiyotkor kontent yoz. Uydirma faktlarni belgilab qo‘y.'},
  {name:'Marketing mutaxassisi', expertise:'Marketing, reklama, SEO, auditoriya va o‘sish strategiyasi', instruction:'O‘lchanadigan KPI, kanal, budjet taxmini va test g‘oyalarini taklif qil. Natijani kafolatlama.'},
  {name:'Moliya mutaxassisi', expertise:'Budjet, xarajatlar, daromad modeli, moliyaviy hisob', instruction:'Hisob-kitoblarni formulalar bilan ko‘rsat, taxminlarni faktlardan ajrat va risklarni ayt.'},
  {name:'Biznes tahlilchi', expertise:'Talablar, jarayonlar, loyiha reja, risk va biznes tahlil', instruction:'Talablarni aniqlashtir, vazifalarni o‘lchanadigan natijalarga ajrat, qabul mezonlarini yoz.'},
  {name:'QA sinovchi', expertise:'Sifat nazorati, test reja, edge case, xatolar va qabul mezonlari', instruction:'Test ssenariylari va topilgan muammolarni dalil bilan yoz. Testni amalda bajarmagan bo‘lsang, faqat test reja ekanini ayt.'}
];
const EMPLOYEE_NAMES = EMPLOYEES.map(x=>x.name);

function send(res,status,data,type='application/json; charset=utf-8'){
  res.writeHead(status,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
  res.end(type.startsWith('application/json')?JSON.stringify(data):data);
}
function readBody(req){return new Promise((resolve,reject)=>{
  let raw='',size=0,done=false;
  req.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY&&!done){done=true;reject(new Error('So‘rov hajmi limitdan oshdi'));req.destroy();return;}if(!done)raw+=chunk;});
  req.on('end',()=>{if(done)return;try{resolve(JSON.parse(raw||'{}'));}catch{reject(new Error('JSON noto‘g‘ri formatda'));}});
  req.on('error',e=>{if(!done)reject(e);});
});
}
async function askAI(instructions,input){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),90000);
  let response;try{response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',headers:{Authorization:`Bearer ${API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:MODEL,instructions,input}),signal:controller.signal
  });}catch(e){if(e.name==='AbortError')throw new Error('OpenAI 90 soniyada javob bermadi. Model/API/billingni tekshiring.');throw new Error('OpenAI bilan aloqa xatosi: '+e.message);}finally{clearTimeout(timer);}
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error?.message||`OpenAI API xatosi (${response.status})`);
  const text=data.output_text||(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');
  if(!text)throw new Error('AI bo‘sh javob qaytardi');
  return text;
}
function parseJson(text){
  const cleaned=text.trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  const a=cleaned.indexOf('{'),b=cleaned.lastIndexOf('}');
  if(a<0||b<a)throw new Error('AI javobi JSON formatida emas');
  return JSON.parse(cleaned.slice(a,b+1));
}
function safeString(v,max=5000){return String(v??'').trim().slice(0,max);}
async function managerWorkflow(command){
  // Conversational prompts get a direct natural-language answer; project commands trigger the team workflow.
  const intent=parseJson(await askAI('Siz Virtual Office Hub so‘rov routerisiz. Foydalanuvchi oddiy suhbat/savol so‘rayaptimi yoki xodimlarga bo‘linadigan loyiha/vazifa buyuryaptimi? JSON: {"mode":"chat" yoki "work"}. Oddiy salom, savol, maslahat, suhbat = chat. Yaratish, ishlab chiqish, rejalash, tahlil, bajarish, loyiha = work. Faqat JSON qaytaring.',command));
  if(intent.mode==='chat') return {mode:'chat',reply:await askAI('Siz Virtual Office Hub ichidagi o‘zbek tilida samimiy, foydali AI yordamchisiz. Oddiy savollarga bevosita javob bering, suhbatlashing. Buyruq bo‘lmasa, vazifalarni xodimlarga taqsimlamang.',command),status:'AI javobi'};
  // 1) Manager makes a clear, limited, role-matched plan.
  const plan=parseJson(await askAI(
    `Siz Virtual Office Hub AI Managerisiz. Buyruqni tushunib, 1–3 ta mustaqil, bajariladigan vazifaga ajrating. Faqat ushbu xodimlarni tanlang: ${EMPLOYEE_NAMES.join(', ')}. JSON: {"summary":"...","tasks":[{"employee":"...","task":"...","acceptance_criteria":["..."]}]}. Vazifalar takrorlanmasin, qabul mezonlari tekshiriladigan bo‘lsin.`,command));
  if(!Array.isArray(plan.tasks)||!plan.tasks.length)throw new Error('Manager ish rejasini tuza olmadi');
  plan.tasks=plan.tasks.slice(0,3).map(t=>({employee:EMPLOYEE_NAMES.includes(t.employee)?t.employee:'Biznes tahlilchi',task:safeString(t.task,3000),acceptance_criteria:Array.isArray(t.acceptance_criteria)?t.acceptance_criteria.slice(0,6).map(x=>safeString(x,500)):[]}));

  // 2) Real API calls: each worker receives role-specific system instructions.
  let workers=[];
  for(const task of plan.tasks){
    const profile=EMPLOYEES.find(e=>e.name===task.employee);
    const deliverable=await askAI(
      `Siz ${profile.name} nomli AI xodimsiz. Mutaxassisligingiz: ${profile.expertise}. ${profile.instruction} Manager topshirig‘ini mustaqil va professional bajaring. Bajarilmagan ishni bajarildi demang.`,
      `ASL FOYDALANUVCHI BUYRUG‘I:\n${command}\n\nSIZNING VAZIFANGIZ:\n${task.task}\n\nQABUL MEZONLARI:\n${task.acceptance_criteria.join('\n- ')}\n\nNatija, qarorlar, taxminlar va cheklovlarni tartibli yozing.`);
    workers.push({employee:task.employee,task:task.task,acceptance_criteria:task.acceptance_criteria,deliverable,revision:0});
  }

  // 3) Independent Controller checks evidence and requests targeted repairs.
  const reviews=[];
  for(let round=1;round<=MAX_ROUNDS;round++){
    const review=parseJson(await askAI(
      `Siz mustaqil Controller/QA auditorisiz. Foydalanuvchi talabi va xodim deliverablelarini mezonlar bo‘yicha tekshiring. Faqat JSON: {"score":0,"passed":false,"summary":"...","issues":[{"employee":"...","issue":"...","required_change":"..."}],"tests_performed":["..."],"test_limitations":"..."}. 85/100 dan kam bo‘lsa passed=false. Ish bajarilganiga dalil bo‘lmasa, bajarildi demang. Testlar amalda bajarilmagan bo‘lsa, buni limitationda yozing.`,
      `ROUND ${round}/${MAX_ROUNDS}\nASL BUYRUQ:\n${command}\n\nREJA:\n${JSON.stringify(plan)}\n\nNATIJALAR:\n${JSON.stringify(workers)}`));
    review.score=Math.max(0,Math.min(100,Number(review.score)||0));review.passed=review.score>=PASS_SCORE;review.round=round;reviews.push(review);
    if(review.passed||round===MAX_ROUNDS)break;
    const issues=Array.isArray(review.issues)?review.issues:[];
    // Only repair workers that Controller specifically flagged.
    for(const w of workers){
      const relevant=issues.filter(i=>i.employee===w.employee||i.employee==='Barcha xodimlar'||!i.employee);
      if(!relevant.length)continue;
      const p=EMPLOYEES.find(e=>e.name===w.employee);
      const revised=await askAI(`Siz ${p.name} AI xodimisiz. Controller aniq kamchiliklarni topdi. Ularni tuzating. ${p.instruction} Test yoki real ish bajarilgan deb yolg‘on da’vo qilmang.`,
        `ASL BUYRUQ: ${command}\nVAZIFA: ${w.task}\nOLDINGI NATIJA: ${w.deliverable}\nCONTROLLER KAMCHILIKLARI: ${JSON.stringify(relevant)}\nQayta topshirilgan, yaxshilangan yakuniy natijani yoz.`);
      w.deliverable=revised;w.revision++;
    }
  }
  const last=reviews[reviews.length-1];
  return {status:last.passed?'Yakuniy hisobot tayyor':'Qayta ishlash talab qilinadi',plan,workers,reviews,score:last.score,finalReport:last.passed?`Manager nazoratdan o‘tkazdi. Baho ${last.score}/100. ${last.summary}`:`Nazoratdan keyin ham kamchiliklar qoldi. Baho ${last.score}/100. Manager tasdiqlamadi. ${last.summary}`,testLimitations:last.test_limitations||'Server AI matnli tahlilini bajaradi; kodni sandboxda ishga tushirish yoki real brauzer testlari hali ulanmagan.'};
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{ok:true,service:'Virtual Office Hub AI Manager',model:MODEL,apiKeyConfigured:Boolean(API_KEY),employees:EMPLOYEE_NAMES.length,workflow:'manager-workers-controller-revision'});
  if(req.method==='POST'&&url.pathname==='/api/chat'){
    if(!API_KEY)return send(res,503,{error:'Serverda OPENAI_API_KEY kiritilmagan.'});
    try{const body=await readBody(req);const message=safeString(body.message,MAX_COMMAND);if(!message)return send(res,400,{error:'Xabar bo‘sh.'});const reply=await askAI('Siz Virtual Office Hub ichidagi o‘zbek tilida samimiy, aniq AI yordamchisiz. Savollarga javob bering va foydalanuvchi bilan tabiiy suhbatlashing.',message);return send(res,200,{reply,model:MODEL});}catch(e){console.error('Chat error:',e.message);return send(res,500,{error:e.message||'Server xatosi'});}
  }
  if(req.method==='POST'&&url.pathname==='/api/manager'){
    if(!API_KEY)return send(res,503,{error:'Serverda OPENAI_API_KEY maxfiy sozlamasi kiritilmagan.'});
    try{const body=await readBody(req);const command=safeString(body.command,MAX_COMMAND);if(!command)return send(res,400,{error:'Manager buyrug‘i bo‘sh.'});if(String(body.command||'').length>MAX_COMMAND)return send(res,400,{error:`Buyruq ${MAX_COMMAND} belgidan oshmasin.`});const result=await managerWorkflow(command);return send(res,200,result);}
    catch(e){console.error('Manager workflow error:',e.message);return send(res,500,{error:e.message||'Server xatosi'});}
  }
  if(req.method==='GET'){
    const requested=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
    const file=path.resolve(ROOT,'.'+requested);
    if(!file.startsWith(ROOT+path.sep)&&file!==ROOT)return send(res,403,{error:'Forbidden'});
    fs.readFile(file,(err,buf)=>{if(err)return send(res,404,'Not found','text/plain; charset=utf-8');const ext=path.extname(file);const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};send(res,200,buf,types[ext]||'application/octet-stream');});return;
  }
  send(res,404,{error:'Not found'});
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Virtual Office Hub listening on ${PORT}; model=${MODEL}; AI key=${Boolean(API_KEY)}`));
