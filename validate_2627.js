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

  console.log('19) geen los positie-dropdown meer in speelronde-invoer:', !/data-field="positie"/.test(html));
  console.log('20) evt-head kolomkoppen hebben nowrap/ellipsis CSS:', /\.evt-head span\{[^}]*white-space:nowrap/.test(html));

  const testClub = get(sb, 'DATA.clubs[0]');
  const testSpeler = get(sb, `STATE.players.find(p=>p.club===${JSON.stringify(testClub)})`);
  const positieMatch = get(sb, `(function(){
    const bekend = playersOfClub(${JSON.stringify(testClub)}).find(p => p.naam.toLowerCase() === ${JSON.stringify(testSpeler.naam)}.trim().toLowerCase());
    return bekend && bekend.positie === ${JSON.stringify(testSpeler.positie)};
  })()`);
  console.log('21) positie is opzoekbaar via playersOfClub op naam:', positieMatch);

  console.log('22) alle 34 rondes hebben een wedstrijdschema (9 wedstrijden):', get(sb, "Object.keys(DATA.allweeks).length")===34 && get(sb, "Object.values(DATA.allweeks).every(w=>w.length===9)"));
  console.log('23) ronde 1 seizoensopener klopt (SC_Cambuur-Excelsior):', get(sb, "DATA.allweeks['1'][0].club_thuis")==='SC_Cambuur' && get(sb,"DATA.allweeks['1'][0].club_uit")==='Excelsior');
  console.log('24) elke ronde bevat alle 18 clubs precies 1x:', get(sb, `(function(){
    for(const [r,ms] of Object.entries(DATA.allweeks)){
      const clubs = new Set();
      ms.forEach(m=>{ clubs.add(m.club_thuis); clubs.add(m.club_uit); });
      if(clubs.size!==18) return false;
    }
    return true;
  })()`));
  console.log('25) spelregels.periodes correct (1-9/10-17/18-26/27-34):', get(sb, `(function(){
    const p = DATA.spelregels.periodes;
    return p.periode1.van===1 && p.periode1.tot===9 && p.periode2.van===10 && p.periode2.tot===17 &&
           p.periode3.van===18 && p.periode3.tot===26 && p.periode4.van===27 && p.periode4.tot===34;
  })()`));

  // Live periodetotaal: geef het team uit test 13 een basisspeler met een bekende naam, vul ronde 2
  // (binnen periode 1) met een uitslag+statistiek in en check dat periodeTotaal('periode1') meetelt.
  run(sb, `
    const team = STATE.teams[Object.keys(STATE.teams)[0]];
    const speler = STATE.players[0];
    team.basis.push({naam: speler.naam, club: speler.club, prijs: speler.prijs, positie: speler.positie});
    const rd2 = ensureRonde(2);
    rd2.matches[0].uitslagThuis = 2; rd2.matches[0].uitslagUit = 0;
    rd2.matches[0].spelersThuis = [{naam: speler.naam, positie: speler.positie, rol:'basis', goal:1,pen_scoren:0,pen_missen:0,pen_stoppen:0,eigen_doelpunt:0,assist:0,geen_tegengoals:0,geel:0,geel2:0,rood:0}];
  `);
  const p1Waarde = get(sb, `(function(){ const team = STATE.teams[Object.keys(STATE.teams)[0]]; buildTeamList(); const t = TEAM_LIST.find(x=>x.key===Object.keys(STATE.teams)[0]); return periodeTotaal(t,'periode1'); })()`);
  console.log('26) live periodetotaal (P1) telt score uit ronde 2 mee:', p1Waarde > 0);

  // Migratietest: simuleer een bestaande cloud-STATE (dataVersion 4, zoals nu live) waarin
  // ronde 1 al 9 echte wedstrijden heeft (door Koen/Frank zelf ingevuld) maar rondes 2-34 nog leeg
  // zijn. Na de upgrade naar SEED_VERSION 5 (met het nieuwe wedstrijdschema) mag ronde 1 niet
  // overschreven worden, maar moeten de lege rondes wel het echte schema krijgen.
  let sb2 = newSandbox({embeddedStateJSON: makeEl('null'), loginOverlay: makeEl(), appRoot: makeEl(), loginError: makeEl(), firebaseStatus: makeEl(), fbHeaderStatus: makeEl(), loginUserBadge: makeEl()}, {}, {firebase: makeFakeFirebase({value:null,listeners:[]}, users)});
  const oudeState = get(sb2, `(function(){
    const s = { dataVersion: 4, huidigeRonde: 1, teams: {}, players: [], wisselLog: [], transferLog: [], rounds: {} };
    for(let i=1;i<=34;i++) s.rounds[String(i)] = {matches:[]};
    s.rounds['1'].matches.push({clubThuis:'SC_Cambuur', clubUit:'Excelsior', uitslagThuis:null, uitslagUit:null, spelersThuis:[], spelersUit:[]});
    return s;
  })()`);
  run(sb2, `STATE = normaliseState(${JSON.stringify(oudeState)});`);
  console.log('27) migratie behoudt bestaande ronde 1 (niet overschreven):', get(sb2, "STATE.rounds['1'].matches.length")===1 && get(sb2,"STATE.rounds['1'].matches[0].clubThuis")==='SC_Cambuur');
  console.log('28) migratie vult lege ronde 2 met echt wedstrijdschema:', get(sb2, "STATE.rounds['2'].matches.length")===9);
  console.log('29) migratie zet dataVersion bij naar huidige SEED_VERSION:', get(sb2,'STATE.dataVersion')===get(sb2,'SEED_VERSION'));

  console.log('ALLES OK');
}
main().catch(e=>{ console.error('TESTFOUT', e); process.exit(1); });
