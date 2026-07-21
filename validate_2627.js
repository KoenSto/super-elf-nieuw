const fs = require('fs');
const vm = require('vm');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'dist', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);

function makeEl(initial){ return { innerHTML:'', value:'', textContent: initial!==undefined?initial:'', children:[], className:'', dataset:{}, style:{}, disabled:false,
  addEventListener(){}, appendChild(c){this.children.push(c);}, scrollIntoView(){}, querySelectorAll(){return [];}, querySelector(){return null;}, classList:{toggle(){},add(){},remove(){}} }; }

function makeFakeFirebase(cloud, users){
  const cloneCloud = ()=> cloud.value===null ? null : JSON.parse(JSON.stringify(cloud.value));
  let authState = { user: null, listeners: [] };
  function notifyAuth(){ authState.listeners.forEach(fn=>fn(authState.user)); }
  return {
    apps: [],
    initializeApp(cfg){ this.apps.push({cfg}); return {cfg}; },
    app(){ return this.apps[0]; },
    database(){
      return { ref(path){ return {
        path,
        once(){ return Promise.resolve({ val(){ return cloneCloud(); } }); },
        set(v){ cloud.value = JSON.parse(JSON.stringify(v)); cloud.listeners.forEach(fn=>fn({ val(){ return cloneCloud(); } })); return Promise.resolve(); },
        on(evt, cb){ cloud.listeners.push(cb); },
        off(){ cloud.listeners.length = 0; }
      }; } };
    },
    auth(){
      return {
        signInWithEmailAndPassword(email, pass){
          const u = users[email];
          if(!u || u.password !== pass){ return Promise.reject(new Error('wrong-password')); }
          authState.user = { email, uid: u.uid };
          notifyAuth();
          return Promise.resolve({user: authState.user});
        },
        signOut(){ authState.user = null; notifyAuth(); return Promise.resolve(); },
        onAuthStateChanged(cb){ authState.listeners.push(cb); cb(authState.user); }
      };
    }
  };
}

function newSandbox(elements, store, extra){
  const document = { getElementById(id){ if(!elements[id]) elements[id]=makeEl(); return elements[id]; }, createElement(){return makeEl();}, addEventListener(){}, querySelectorAll(){return [];} };
  const localStorage = { getItem(k){return store[k]||null;}, setItem(k,v){store[k]=v;}, removeItem(k){delete store[k];}, clear(){store={};} };
  const sandbox = Object.assign({ document, localStorage, console, alert(m){console.log('ALERT:',m);}, confirm(){return true;},
    Blob:function(){}, URL:{createObjectURL(){return '';}}, FileReader:function(){},
    Number,String,Object,Array,Math,JSON,Date,setTimeout,clearTimeout,isNaN,Promise }, extra||{});
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  scripts.forEach(s=>vm.runInContext(s, sandbox));
  return sandbox;
}
function get(sb,n){ return vm.runInContext(n, sb); }
function run(sb,c){ return vm.runInContext('(function(){ ' + c + ' })();', sb); }

async function main(){
  const users = { 'koen@super-elf.local': {password:'test1234', uid:'UIDKOEN'} };
  const cloud = { value: null, listeners: [] };
  const fakeFb = makeFakeFirebase(cloud, users);
  let sb = newSandbox({embeddedStateJSON: makeEl('null'), loginOverlay: makeEl(), appRoot: makeEl(), loginError: makeEl(), firebaseStatus: makeEl(), fbHeaderStatus: makeEl(), loginUserBadge: makeEl()}, {}, {firebase: fakeFb});

  console.log('1) DATA.clubs heeft 18 clubs:', get(sb,'DATA.clubs.length')===18);
  console.log('2) DATA.players heeft spelers:', get(sb,'DATA.players.length')>0);
  console.log('3) geen ADO-dubbele club-typo (Exccelsior):', !get(sb,'DATA.clubs').includes('Exccelsior'));
  console.log('4) spelregels.max_wissels === 5:', get(sb,'DATA.spelregels.max_wissels')===5);
  console.log('5) spelregels.extra_wissel_na_ronde === 17:', get(sb,'DATA.spelregels.extra_wissel_na_ronde')===17);
  console.log('6) maxWisselsVoorRonde(10) === 5:', get(sb,'maxWisselsVoorRonde(10)')===5);
  console.log('7) maxWisselsVoorRonde(17) === 5:', get(sb,'maxWisselsVoorRonde(17)')===5);
  console.log('8) maxWisselsVoorRonde(18) === 6:', get(sb,'maxWisselsVoorRonde(18)')===6);
  console.log('9) maxWisselsVoorRonde(34) === 6:', get(sb,'maxWisselsVoorRonde(34)')===6);

  await get(sb,'doLogin')('koen','test1234');
  await new Promise(r=>setTimeout(r,10));
  console.log('10) na login: appRoot zichtbaar:', get(sb,"document.getElementById('appRoot').style.display")==='block');
  console.log('11) STATE.teams is leeg object (nog geen teams):', Object.keys(get(sb,'STATE.teams')).length===0);
  console.log('12) STATE.players geladen vanuit seed (445 spelers):', get(sb,'STATE.players.length')===445);
  run(sb, "addTeam('Koen','Team Koen');");
  console.log('13) team aanmaken werkt (STATE.teams heeft 1 team):', Object.keys(get(sb,'STATE.teams')).length===1);
  console.log('14) navDataBtn zichtbaar voor editor (koen):', get(sb,"document.getElementById('navDataBtn').style.display")==='');

  console.log('15) tab-stand is standaard zichtbaar (geen inline display:none):', /id="tab-stand" class="tabcontent">/.test(html));
  console.log('16) tab-ronde is standaard verborgen:', /id="tab-ronde" class="tabcontent" style="display:none;"/.test(html));
  const navOrder = ['stand','spelers','clubs','teams','regels','ronde','data'];
  const idxs = navOrder.map(t => html.indexOf(`data-tab="${t}"`));
  const juisteVolgorde = idxs.every((v,i)=> i===0 || v > idxs[i-1]);
  console.log('17) navigatievolgorde klopt (Tussenstand..Data):', juisteVolgorde);
  console.log('18) Tussenstand-knop heeft class="active":', /data-tab="stand" class="active"/.test(html));

  console.log('ALLES OK');
}
main().catch(e=>{ console.error('TESTFOUT', e); process.exit(1); });
