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
  const users = { 'koen@super-elf.local': {password:'test1234', uid:'UIDKOEN'}, 'gast@super-elf.local': {password:'super11', uid:'UIDGAST'} };
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
  const navOrder = ['stand','spelers','clubs','teams','stats','beker','regels','ronde','data'];
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

  // Speelronde: naam-select in plaats van datalist, met dezelfde volgorde als Voetbalploegen en pastelkleur per positie.
  console.log('30) geen datalist meer voor spelernaam in speelronde:', !/id="spelerlijst-/.test(html) && !/list="spelerlijst-/.test(html));
  console.log('31) spelernaam-veld in speelronde is nu een <select>:', /<select[^>]*data-field="naam"/.test(html));
  const testClub2 = get(sb, 'DATA.clubs[1]');
  const volgordeCheck = get(sb, `(function(){
    const club = ${JSON.stringify(testClub2)};
    const viaHelper = [...playerSelectOptionsHTML(club, '').matchAll(/<option value="([^"]*)"/g)].map(m=>m[1]).filter(v=>v!=='');
    const viaVoetbalploegen = STATE.players.filter(p=>p.club===club)
      .sort((a,b)=> ({K:0,V:1,M:2,A:3}[a.positie]-{K:0,V:1,M:2,A:3}[b.positie]) || a.naam.localeCompare(b.naam))
      .map(p=>p.naam);
    return JSON.stringify(viaHelper)===JSON.stringify(viaVoetbalploegen) && viaHelper.length>0;
  })()`);
  console.log('32) dropdown-volgorde in speelronde komt exact overeen met Voetbalploegen:', volgordeCheck);
  const pastelCheck = get(sb, `(function(){
    const club = ${JSON.stringify(testClub2)};
    const speler = STATE.players.find(p=>p.club===club);
    const html2 = playerSelectOptionsHTML(club, speler.naam);
    return html2.includes('var(--pos'+speler.positie+'-bg)') && html2.includes('var(--pos'+speler.positie+'-text)');
  })()`);
  console.log('33) geselecteerde speler krijgt pastelkleur van zijn positie:', pastelCheck);
  const naamStijlCheck = get(sb, `(function(){
    const club = ${JSON.stringify(testClub2)};
    const speler = STATE.players.find(p=>p.club===club);
    const rowHtml = statRowHTML(1, 0, 'thuis', 0, {naam: speler.naam, positie: speler.positie}, null, club);
    return /<select[^>]*data-field="naam"[^>]*style="background-color:var\\(--pos/.test(rowHtml);
  })()`);
  console.log('34) gesloten select-veld krijgt zelf ook de pastelkleur (naamStijl):', naamStijlCheck);

  // Teamscore mag niet meer los invulbaar zijn en moet automatisch volgen uit goals/eigen doelpunten.
  console.log('35) geen los invulveld meer voor de teamscore in speelronde:', !/data-field="uitslagThuis"/.test(html) && !/data-field="uitslagUit"/.test(html));
  const scoreCheck = get(sb, `(function(){
    const m = {
      clubThuis:'A', clubUit:'B',
      spelersThuis:[{naam:'X1',positie:'A',goal:2,eigen_doelpunt:0},{naam:'X2',positie:'A',goal:0,eigen_doelpunt:1}],
      spelersUit:[{naam:'Y1',positie:'A',goal:1,eigen_doelpunt:0},{naam:'Y2',positie:'A',goal:0,eigen_doelpunt:1}]
    };
    const u = berekenUitslagVanWedstrijd(m);
    // Thuis: 2 eigen goals (X1) + 1 eigen doelpunt van uit-speler Y2 (telt vóór thuis) = 3.
    // Uit: 1 eigen goal (Y1) + 1 eigen doelpunt van thuis-speler X2 (telt vóór uit) = 2.
    return u.thuis===3 && u.uit===2;
  })()`);
  console.log('36) goal telt voor eigen team en eigen doelpunt telt voor tegenstander:', scoreCheck);
  const syncCheck = get(sb, `(function(){
    const m = { clubThuis:'A', clubUit:'B', uitslagThuis:0, uitslagUit:0,
      spelersThuis:[{naam:'X1',positie:'A',goal:1,eigen_doelpunt:0}], spelersUit:[] };
    syncUitslag(m);
    return m.uitslagThuis===1 && m.uitslagUit===0;
  })()`);
  console.log('37) syncUitslag schrijft de berekende score terug op de wedstrijd:', syncCheck);

  const penCheck = get(sb, `(function(){
    const m = {
      clubThuis:'A', clubUit:'B',
      spelersThuis:[{naam:'X1',positie:'A',goal:1,pen_scoren:1,pen_missen:1,pen_stoppen:0,eigen_doelpunt:0}],
      spelersUit:[{naam:'Y1',positie:'A',goal:0,pen_scoren:0,pen_missen:0,pen_stoppen:1,eigen_doelpunt:0}]
    };
    const u = berekenUitslagVanWedstrijd(m);
    // Thuis: 1 gewone goal + 1 gescoorde penalty = 2 (de gemiste penalty telt niet mee).
    // Uit: 0 (de gestopte penalty van de keeper levert geen doelpunt op, en er is geen eigen doelpunt).
    return u.thuis===2 && u.uit===0;
  })()`);
  console.log('38) gescoorde penalty telt mee als doelpunt; gemiste/gestopte penalty niet:', penCheck);

  console.log('39) geen los invulveld meer voor clean sheet (Schoon) in speelronde:', !/data-field="geen_tegengoals"/.test(html));
  const cleanSheetCheck = get(sb, `(function(){
    const m = {
      clubThuis:'A', clubUit:'B',
      spelersThuis:[{naam:'X1',positie:'K',goal:1,pen_scoren:0,eigen_doelpunt:0,geen_tegengoals:0},{naam:'X2',positie:'V',goal:0,pen_scoren:0,eigen_doelpunt:0,geen_tegengoals:0}],
      spelersUit:[{naam:'Y1',positie:'A',goal:0,pen_scoren:0,eigen_doelpunt:0,geen_tegengoals:0}]
    };
    syncUitslag(m);
    // Uitslag wordt 1-0: thuis kreeg geen tegengoal (clean sheet voor alle thuisspelers),
    // uit incasseerde wel een goal (dus geen clean sheet voor de uit-speler).
    return m.spelersThuis.every(sp=>sp.geen_tegengoals===1) && m.spelersUit.every(sp=>sp.geen_tegengoals===0);
  })()`);
  console.log('40) clean sheet wordt automatisch gezet voor het hele team bij 0 tegengoals:', cleanSheetCheck);
  const geenCleanSheetBijTegengoalCheck = get(sb, `(function(){
    const m = {
      clubThuis:'A', clubUit:'B',
      spelersThuis:[{naam:'X1',positie:'K',goal:0,pen_scoren:0,eigen_doelpunt:0,geen_tegengoals:1}],
      spelersUit:[{naam:'Y1',positie:'A',goal:1,pen_scoren:0,eigen_doelpunt:0,geen_tegengoals:0}]
    };
    syncUitslag(m);
    // Uit scoort 1x, dus thuis krijgt geen clean sheet (ook al stond die er per ongeluk al op 1).
    return m.spelersThuis.every(sp=>sp.geen_tegengoals===0);
  })()`);
  console.log('41) clean sheet wordt automatisch weer weggehaald zodra het team een tegengoal krijgt:', geenCleanSheetBijTegengoalCheck);

  // Tabblad Statistieken: nav-knop, sectie en de aggregatiefuncties die de top-10 overzichten voeden.
  console.log('42) nav-knop Statistieken staat tussen Teams en Beker/Spelregels:', /data-tab="teams">Teams<\/button>\s*<button data-tab="stats">/.test(html) && /data-tab="stats">Statistieken<\/button>\s*<button data-tab="beker">/.test(html));
  console.log('43) tab-stats is standaard verborgen:', /id="tab-stats" class="tabcontent" style="display:none;"/.test(html));

  run(sb, `
    const rd20 = ensureRonde(20);
    rd20.matches = [{
      clubThuis:'TestClubX', clubUit:'TestClubY', uitslagThuis:0, uitslagUit:0,
      spelersThuis:[{naam:'Piet Test', positie:'A', goal:2, pen_scoren:0, pen_missen:0, pen_stoppen:0, eigen_doelpunt:0, assist:1, geen_tegengoals:0, geel:1, geel2:0, rood:0}],
      spelersUit:[{naam:'Klaas Test', positie:'K', goal:0, pen_scoren:0, pen_missen:0, pen_stoppen:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0}]
    }];
    syncUitslag(rd20.matches[0]);
    const rd21 = ensureRonde(21);
    rd21.matches = [{
      clubThuis:'TestClubX', clubUit:'TestClubZ', uitslagThuis:0, uitslagUit:0,
      spelersThuis:[{naam:'Piet Test', positie:'A', goal:1, pen_scoren:0, pen_missen:0, pen_stoppen:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:1}],
      spelersUit:[{naam:'Jan Test', positie:'K', goal:0, pen_scoren:0, pen_missen:0, pen_stoppen:0, eigen_doelpunt:1, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0}]
    }];
    syncUitslag(rd21.matches[0]);
  `);
  const aggCheck = get(sb, `(function(){
    const agg = aggregeerPerSpeler(alleSpelerBeurten());
    const piet = agg.find(a=>a.naam==='Piet Test');
    const jan = agg.find(a=>a.naam==='Jan Test');
    return piet && piet.goals===3 && piet.assists===1 && piet.geel===1 && piet.rood===1 &&
           jan && jan.eigenDoelpunt===1 && jan.blooperTotaal===1;
  })()`);
  console.log('44) aggregeerPerSpeler telt goals/assists/kaarten/blooper-stats correct op over meerdere rondes:', aggCheck);
  const topscorerCheck = get(sb, `(function(){
    const agg = aggregeerPerSpeler(alleSpelerBeurten());
    return topN(agg,'goals',10)[0].naam === 'Piet Test';
  })()`);
  console.log('45) topN zet de speler met de meeste goals bovenaan:', topscorerCheck);
  const svdrCheck = get(sb, `(function(){
    const svdr = spelerVanDeRonde(alleSpelerBeurten());
    const r20 = svdr.find(x=>x.ronde===20);
    const r21 = svdr.find(x=>x.ronde===21);
    return r20 && r20.naam==='Piet Test' && r21 && r21.naam==='Piet Test';
  })()`);
  console.log('46) speler van de ronde bevat de juiste (hoogst scorende) speler voor rondes 20 en 21:', svdrCheck);
  console.log('47) statsContainer wordt gevuld na renderStats():', get(sb, `(function(){ renderStats(); return document.getElementById('statsContainer').innerHTML.includes('Topscorers'); })()`));

  // Beker: bracket-grootte/rondenummers, loting+doorstroom, byes, en tiebreak op budget.
  console.log('48) bepaalBekerRondeNummers(10) -> bracket 16, rondes 5/10/15/20:', get(sb, `(function(){
    const r = bepaalBekerRondeNummers(10);
    return r.bracketSize===16 && JSON.stringify(r.rondeNummers)===JSON.stringify([5,10,15,20]);
  })()`));
  console.log('49) bepaalBekerRondeNummers(64) -> bracket 64, finale in ronde 30:', get(sb, `(function(){
    const r = bepaalBekerRondeNummers(64);
    return r.bracketSize===64 && JSON.stringify(r.rondeNummers)===JSON.stringify([5,10,15,20,25,30]);
  })()`));
  console.log('50) bepaalBekerRondeNummers(70) -> bracket 128, finale verkort naar ronde 34:', get(sb, `(function(){
    const r = bepaalBekerRondeNummers(70);
    return r.bracketSize===128 && JSON.stringify(r.rondeNummers)===JSON.stringify([5,10,15,20,25,30,34]);
  })()`));

  run(sb, `
    STATE.teams['beker_t1'] = {speler:'Koen', teamnaam:'Beker Team 1', basis:[{naam:'BekerSpelerT1', positie:'A', prijs:100}], wissels:[], totaal_weken:{}};
    STATE.teams['beker_t2'] = {speler:'Frank', teamnaam:'Beker Team 2', basis:[{naam:'BekerSpelerT2', positie:'A', prijs:100}], wissels:[], totaal_weken:{}};
    STATE.teams['beker_t3'] = {speler:'Koen', teamnaam:'Beker Team 3', basis:[{naam:'BekerSpelerT3', positie:'A', prijs:100}], wissels:[], totaal_weken:{}};
    STATE.teams['beker_t4'] = {speler:'Frank', teamnaam:'Beker Team 4', basis:[{naam:'BekerSpelerT4', positie:'A', prijs:100}], wissels:[], totaal_weken:{}};
    buildTeamList();
    // Ronde 5 (bekerronde 1): T1 verslaat T2 (3 goals om 0) en T4 verslaat T3 (2 goals om 0).
    const rd5 = ensureRonde(5);
    rd5.matches = [{
      clubThuis:'BekerClubX', clubUit:'BekerClubY', uitslagThuis:0, uitslagUit:0,
      spelersThuis:[{naam:'BekerSpelerT1', positie:'A', goal:3, pen_scoren:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0}],
      spelersUit:[{naam:'BekerSpelerT2', positie:'A', goal:0, pen_scoren:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0}]
    }, {
      clubThuis:'BekerClubP', clubUit:'BekerClubQ', uitslagThuis:0, uitslagUit:0,
      spelersThuis:[{naam:'BekerSpelerT3', positie:'A', goal:0, pen_scoren:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0}],
      spelersUit:[{naam:'BekerSpelerT4', positie:'A', goal:2, pen_scoren:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0}]
    }];
    syncUitslag(rd5.matches[0]);
    syncUitslag(rd5.matches[1]);
    // Ronde 10 (bekerronde 2, de "finale" van deze mini-bracket van 4): T1 verslaat T4.
    const rd10 = ensureRonde(10);
    rd10.matches = [{
      clubThuis:'BekerClubX', clubUit:'BekerClubZ', uitslagThuis:0, uitslagUit:0,
      spelersThuis:[{naam:'BekerSpelerT1', positie:'A', goal:2, pen_scoren:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0}],
      spelersUit:[{naam:'BekerSpelerT4', positie:'A', goal:0, pen_scoren:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0}]
    }];
    syncUitslag(rd10.matches[0]);
    STATE.beker = {drawn:true, slots:['beker_t1','beker_t2','beker_t3','beker_t4'], rondeNummers:[5,10], getrokkenOp:'test', aantalTeamsBijLoting:4};
  `);
  const bekerSchemaCheck = get(sb, `(function(){
    const {rondes, kampioenKey} = berekenBekerSchema();
    const r1 = rondes[0], r2 = rondes[1];
    const m1 = r1.wedstrijden[0]; // T1 vs T2 -> T1 wint op score
    const m2 = r1.wedstrijden[1]; // T3 vs T4 -> T4 heeft een bye (T3 heeft geen data in ronde 5 dus dat zou 0-0 zijn... )
    return m1.winnaarKey==='beker_t1' && m1.status==='gespeeld' && kampioenKey==='beker_t1';
  })()`);
  console.log('51) berekenBekerSchema laat de winnaar op rondescore correct doorstromen naar de volgende bekerronde:', bekerSchemaCheck);

  run(sb, `
    STATE.beker.slots = ['beker_t1','beker_t2','beker_t3', null];
  `);
  const byeCheck = get(sb, `(function(){
    const {rondes} = berekenBekerSchema();
    const byeWedstrijd = rondes[0].wedstrijden[1]; // T3 vs null
    return byeWedstrijd.teamA==='beker_t3' && byeWedstrijd.teamB===null && byeWedstrijd.status==='bye' && byeWedstrijd.winnaarKey==='beker_t3';
  })()`);
  console.log('52) een bye laat het team automatisch doorgaan zonder wedstrijd:', byeCheck);

  run(sb, `
    STATE.teams['beker_tiebreak_goedkoop'] = {speler:'Koen', teamnaam:'Tiebreak Goedkoop', basis:[{naam:'NietBestaandeSpelerA', positie:'A', prijs:100}], wissels:[], totaal_weken:{}};
    STATE.teams['beker_tiebreak_duur'] = {speler:'Frank', teamnaam:'Tiebreak Duur', basis:[{naam:'NietBestaandeSpelerB', positie:'A', prijs:900}], wissels:[], totaal_weken:{}};
    buildTeamList();
  `);
  const tiebreakCheck = get(sb, `(function(){
    // Beide spelers komen in geen enkele wedstrijd van ronde 5 voor -> score 0-0 -> tiebreak op budget.
    const res = bekerWedstrijdUitslag('beker_tiebreak_goedkoop', 'beker_tiebreak_duur', 5);
    return res.status==='gelijk_tiebreak' && res.winnaarKey==='beker_tiebreak_goedkoop';
  })()`);
  console.log('53) bij gelijke rondescore wint het team met het laagste spelersbudget:', tiebreakCheck);

  const nogSpelenCheck = get(sb, `(function(){
    const res = bekerWedstrijdUitslag('beker_t1', 'beker_t2', 33); // ronde 33 heeft nog geen spelersdata
    return res.status==='nog_spelen' && res.winnaarKey===null;
  })()`);
  console.log('54) een bekerwedstrijd in een nog niet ingevulde speelronde blijft \'nog te spelen\':', nogSpelenCheck);

  run(sb, `
    STATE.beker = {drawn:true, slots:['beker_t1','beker_t2','beker_t3', null], rondeNummers:[25,26], getrokkenOp:'test', aantalTeamsBijLoting:3};
  `);
  const tbdCheck = get(sb, `(function(){
    const {rondes, kampioenKey} = berekenBekerSchema();
    const m1 = rondes[0].wedstrijden[0]; // T1 vs T2 in ronde 25 -> geen spelersdata -> nog niet beslist
    const m2 = rondes[0].wedstrijden[1]; // T3 vs bye -> T3 gaat automatisch door
    const finale = rondes[1].wedstrijden[0]; // (nog onbekend) vs T3
    return m1.winnaarKey===null && m2.winnaarKey==='beker_t3' &&
           finale.status==='wacht_op_vorige_ronde' && finale.teamA==='TBD' && finale.teamB==='beker_t3' &&
           kampioenKey===null;
  })()`);
  console.log('55) een onbesliste wedstrijd voorkomt dat een team ten onrechte kampioen wordt via een dubbele bye:', tbdCheck);

  const geenDubbeleByeCheck = get(sb, `(function(){
    for(let poging=0; poging<200; poging++){
      const n = 2 + Math.floor(Math.random()*30); // 2..31 teams
      const teams = Array.from({length:n}, (_,i)=>'fake_'+i);
      const {bracketSize} = bepaalBekerRondeNummers(n);
      const slots = bouwBekerSlots(teams, bracketSize);
      for(let j=0;j<slots.length;j+=2){
        if(slots[j]===null && slots[j+1]===null) return false; // twee bye-plekken in dezelfde wedstrijd mag niet
      }
      const nullCount = slots.filter(s=>s===null).length;
      if(nullCount !== bracketSize-n) return false; // aantal byes moet exact kloppen
    }
    return true;
  })()`);
  console.log('56) de loting verdeelt byes altijd over verschillende koppels (nooit twee bye-plekken tegen elkaar):', geenDubbeleByeCheck);

  console.log('57) knop "Loting wissen" staat naast "Loting trekken":', /id="btnBekerLoting">[^<]*<\/button>\s*<button class="btn" id="btnBekerWissen">/.test(html));
  const wisCheck = get(sb, `(function(){
    STATE.beker = {drawn:true, slots:['beker_t1','beker_t2'], rondeNummers:[5], getrokkenOp:'test', aantalTeamsBijLoting:2};
    wisBekerLoting(); // confirm() is in deze testsandbox al gemockt naar true
    return STATE.beker === null;
  })()`);
  console.log('58) wisBekerLoting() maakt STATE.beker weer leeg:', wisCheck);

  // Kijker-rol (alleen-lezen): een niet-editor account (zoals "gast") mag alles zien maar
  // moet geblokkeerd worden bij elke poging tot wijzigen, zowel via de losse guard-functie
  // als via de daadwerkelijke mutatiefuncties (die intern blokkeerAlsKijker() aanroepen).
  let sb3 = newSandbox({embeddedStateJSON: makeEl('null'), loginOverlay: makeEl(), appRoot: makeEl(), loginError: makeEl(), firebaseStatus: makeEl(), fbHeaderStatus: makeEl(), loginUserBadge: makeEl(), kijkerBanner: makeEl()}, {}, {firebase: makeFakeFirebase({value:null,listeners:[]}, users)});
  await get(sb3,'doLogin')('gast','super11');
  await new Promise(r=>setTimeout(r,10));
  console.log('59) canEdit() is false voor gast en true voor koen (editor):', get(sb3,'canEdit()')===false && get(sb,'canEdit()')===true);
  console.log('60) navDataBtn blijft verborgen voor gast:', get(sb3,"document.getElementById('navDataBtn').style.display")==='none');
  console.log('61) kijkerBanner wordt getoond voor gast:', get(sb3,"document.getElementById('kijkerBanner').style.display")==='');
  run(sb3, "addTeam('Gast','Team Gast');");
  console.log('62) gast kan geen team aanmaken (addTeam wordt geblokkeerd):', Object.keys(get(sb3,'STATE.teams')).length===0);
  run(sb3, `
    STATE.teams['gast_test_team'] = {speler:'Gast', teamnaam:'Gast Test', basis:[], wissels:[], totaal_weken:{}};
    addBasisSpeler('gast_test_team', DATA.clubs[0], STATE.players.find(p=>p.club===DATA.clubs[0]).naam);
  `);
  console.log('63) gast kan geen basisspeler toevoegen (addBasisSpeler wordt geblokkeerd):', get(sb3,"STATE.teams['gast_test_team'].basis.length")===0);
  run(sb3, "trekBekerLoting();");
  console.log('64) gast kan geen bekerloting trekken (trekBekerLoting wordt geblokkeerd):', !get(sb3,'STATE.beker'));
  run(sb3, "addPlayerToClub(DATA.clubs[0], 'Gast Speler Test', 'V', 100);");
  console.log('65) gast kan geen speler aan een club toevoegen (addPlayerToClub wordt geblokkeerd):', !get(sb3,"STATE.players.some(p=>p.naam==='Gast Speler Test')"));
  const aantalTeamsVoor66 = get(sb,'Object.keys(STATE.teams).length');
  run(sb, "addTeam('Frank','Team Frank');");
  console.log('66) koen (editor) kan nog steeds gewoon een team aanmaken (bestaand gedrag blijft werken):', get(sb,'Object.keys(STATE.teams).length')===aantalTeamsVoor66+1);

  // "Bestand koppelen" (lokale auto-save naar bestand) is verwijderd nu alles via Firebase
  // gedeeld wordt: knop, Data-tab paneel en onderliggende functies mogen nergens meer voorkomen.
  console.log('67) knop "Bestand koppelen" staat niet meer in de header:', !/id="fileConnStatus"/.test(html));
  console.log('68) "Automatisch opslaan naar dit bestand"-paneel staat niet meer bij Data:', !/btnConnectFile/.test(html) && !/fileConnStatusLong/.test(html));
  console.log('69) connectFile/writeToConnectedFile bestaan niet meer:', get(sb,"typeof connectFile")==='undefined' && get(sb,"typeof writeToConnectedFile")==='undefined');
  console.log('70) saveState() verwijst niet meer naar scheduleFileWrite:', get(sb,"typeof scheduleFileWrite")==='undefined');

  // Print ronde-uitslag: knop bij Tussenstand, en printRondeUitslag() zet de juiste ranglijst
  // (incl. winnaar/gedeelde winst) klaar in het verborgen print-only element.
  console.log('71) knop "Print ronde-uitslag" staat bij Tussenstand naast de rondeselectie:', /id="standRondeSelect"><\/select>\s*<button class="btn" id="btnPrintRonde"/.test(html));
  run(sb, "window.print = function(){ window.__printAangeroepen = true; };");
  run(sb, `
    STATE.teams['print_test_a'] = {speler:'Koen', teamnaam:'Print Test A', basis:[{naam:'PrintSpelerA', positie:'A', prijs:100}], wissels:[], totaal_weken:{}};
    STATE.teams['print_test_b'] = {speler:'Frank', teamnaam:'Print Test B', basis:[{naam:'PrintSpelerB', positie:'A', prijs:100}], wissels:[], totaal_weken:{}};
    buildTeamList();
    const rd28 = ensureRonde(28);
    rd28.matches = [{
      clubThuis:'PrintClubX', clubUit:'PrintClubY', uitslagThuis:0, uitslagUit:0,
      spelersThuis:[{naam:'PrintSpelerA', positie:'A', goal:3, pen_scoren:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0}],
      spelersUit:[{naam:'PrintSpelerB', positie:'A', goal:1, pen_scoren:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0}]
    }];
    syncUitslag(rd28.matches[0]);
    standRonde = 28;
    printRondeUitslag();
  `);
  const printSoloWinnaarCheck = get(sb, `(function(){
    const h = document.getElementById('printRondeUitslag').innerHTML;
    return h.includes('Winnaar speelronde 28') && h.includes('Print Test A') && window.__printAangeroepen===true;
  })()`);
  console.log('72) printRondeUitslag() wijst bij een duidelijk verschil de juiste winnaar aan en roept window.print() aan:', printSoloWinnaarCheck);
  run(sb, `
    window.__printAangeroepen = false;
    const rd29 = ensureRonde(29);
    // Twee losse wedstrijden met exact dezelfde spelersstatistiek (1 goal, verder niets, allebei
    // een "winst"-resultaat) leveren gegarandeerd evenveel fantasypunten op, ongeacht de precieze
    // puntentabel — dat maakt dit een robuuste, tabel-onafhankelijke test voor een gedeelde winst.
    rd29.matches = [
      {clubThuis:'PrintClubX', clubUit:'PrintClubY', uitslagThuis:0, uitslagUit:0,
        spelersThuis:[{naam:'PrintSpelerA', positie:'A', goal:1, pen_scoren:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0}],
        spelersUit:[]},
      {clubThuis:'PrintClubP', clubUit:'PrintClubQ', uitslagThuis:0, uitslagUit:0,
        spelersThuis:[{naam:'PrintSpelerB', positie:'A', goal:1, pen_scoren:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0}],
        spelersUit:[]}
    ];
    syncUitslag(rd29.matches[0]);
    syncUitslag(rd29.matches[1]);
    standRonde = 29;
    printRondeUitslag();
  `);
  const printGedeeldCheck = get(sb, `(function(){
    const h = document.getElementById('printRondeUitslag').innerHTML;
    return h.includes('Gedeelde winst') && h.includes('Print Test A') && h.includes('Print Test B');
  })()`);
  console.log('73) printRondeUitslag() herkent een gedeelde winst bij een gelijke rondescore:', printGedeeldCheck);

  // Tussenstand: "Ronde X origineel" en "Verschil" waren altijd leeg dit seizoen (geen historisch
  // archief zoals bij 25-26) en zijn daarom verwijderd; de resterende kolom heet nu "Speelronde X".
  run(sb, "standRonde = 12; renderStand();");
  const standTableHtml = get(sb, "document.getElementById('standTable').innerHTML");
  console.log('74) Tussenstand-kolomkop toont "Speelronde 12" in plaats van "Ronde 12 live":', standTableHtml.includes('Speelronde 12') && !standTableHtml.includes('Ronde 12 live'));
  console.log('75) Tussenstand toont geen "origineel"/"Verschil"-kolom meer:', !standTableHtml.includes('origineel') && !standTableHtml.includes('Verschil'));
  console.log('76) STAND_COLUMNS bevat geen orig/diff meer:', !get(sb,"STAND_COLUMNS.some(c=>c.key==='orig'||c.key==='diff')"));

  // Teams-tabblad gebruikte nog origineelTotaal (altijd null dit seizoen) om te sorteren/tonen en
  // gaf daardoor elk team het "nieuw"-vlaggetje in plaats van een echt rangnummer; nu gebaseerd op
  // seizoenTotaal (live), en de introtekst boven de tabbladen is verwijderd (niet nuttig).
  console.log('77) introNote staat niet meer in de pagina:', !/id="introNote"/.test(html));
  run(sb, "renderTeamsGrid();");
  // renderTeamsGrid() bouwt de kaarten via appendChild() (net als in een echte browser); de
  // fake-DOM van deze testharness houdt appendChild-kinderen apart in .children bij (in
  // tegenstelling tot een echte browser telt dit niet automatisch op bij .innerHTML), dus we
  // lezen de kaartinhoud via .children terug in plaats van via .innerHTML van de grid zelf.
  const teamsGridHtml = get(sb, "document.getElementById('teamsGrid').children.map(c=>c.innerHTML).join('')");
  console.log('78) Teams-overzicht toont geen "nieuw"-vlaggetje meer en gebruikt echte rangnummers:', !teamsGridHtml.includes('flag">nieuw') && /#1/.test(teamsGridHtml));
  run(sb, `selectedTeamKey = Object.keys(STATE.teams)[0]; renderTeamDetail();`);
  const teamDetailHtml = get(sb, "document.getElementById('teamDetail').innerHTML");
  console.log('79) Teamdetail toont "Seizoenstotaal:" (niet meer "(origineel)") en geen dode origineel-tekst meer:', teamDetailHtml.includes('Seizoenstotaal:') && !teamDetailHtml.includes('Seizoenstotaal (origineel)') && !teamDetailHtml.includes('Het <b>origineel</b>'));

  // ---- Teams-tab: dubbele club rood, budget-overschrijding rood, pastelkleuren dropdowns,
  // wissel-speler in de basisopstelling (niet meer eronder), en puntentelling per actieve periode ----
  run(sb, `
    addTeam('TestSpeler', 'Team Wisseltest');
    window.__wtKey = Object.keys(STATE.teams).find(k=>STATE.teams[k].teamnaam==='Team Wisseltest');
    const clubX = DATA.clubs[0];
    const spelersX = STATE.players.filter(p=>p.club===clubX);
    window.__wtSpelerA = spelersX[0].naam;
    window.__wtSpelerB = spelersX[1].naam;
    addBasisSpeler(window.__wtKey, clubX, window.__wtSpelerA);
    addBasisSpeler(window.__wtKey, clubX, window.__wtSpelerB); // zelfde club -> mag niet, moet rood worden
    selectedTeamKey = window.__wtKey;
    renderTeamDetail();
  `);
  const wtHtml80 = get(sb, "document.getElementById('teamDetail').innerHTML");
  console.log('80) Twee actieve spelers van dezelfde club in de basisopstelling worden rood/foutief aangegeven:', wtHtml80.includes('row-error') && wtHtml80.includes('dubbele club'));

  run(sb, `
    const teamX = STATE.teams[window.__wtKey];
    teamX.basis.forEach(b=>{ b.prijs = DATA.spelregels.budget; }); // 2x het volledige budget -> ruim over de cap
    renderTeamDetail();
  `);
  const wtHtml81 = get(sb, "document.getElementById('teamDetail').innerHTML");
  console.log('81) Overschrijding van het budget basis-11 wordt rood gearceerd:', wtHtml81.includes('pill-danger') && wtHtml81.includes('over budget'));
  console.log('82) Speler-dropdowns (basis toevoegen) tonen weer de pastelkleur per positie:', /data-newbasis-speler="[^"]*"\s+style="background-color:var\(--pos/.test(wtHtml81) && /<option value="[^"]*" style="background-color:var\(--pos/.test(wtHtml81));
  console.log('83) Sectie "Reservebank \\/ wissels" bestaat niet meer (samengevoegd in Basisopstelling, met een losse "Wissel doorvoeren"-sectie):', !wtHtml81.includes('Reservebank / wissels') && wtHtml81.includes('Wissel doorvoeren'));

  // Puntenperiodes: speler A start in de basis, wordt in ronde 32 vervangen door speler B (uit
  // dezelfde club — dat mag), en in ronde 33 wisselt speler A weer terug in voor speler B. Elke
  // speler mag alleen meetellen binnen zijn eigen actieve periode, zonder puntenverlies of
  // dubbeltelling, ook al komt speler A dus twee keer voor (twee losse, niet-overlappende periodes).
  run(sb, `
    addTeam('PeriodeSpeler', 'Team Periodetest');
    window.__ptKey = Object.keys(STATE.teams).find(k=>STATE.teams[k].teamnaam==='Team Periodetest');
    const clubY = DATA.clubs[1];
    const spelersY = STATE.players.filter(p=>p.club===clubY);
    window.__ptSpelerA = spelersY[0].naam;
    window.__ptSpelerB = spelersY[1].naam;
    addBasisSpeler(window.__ptKey, clubY, window.__ptSpelerA);

    const rd31 = ensureRonde(31);
    rd31.matches = [{
      clubThuis: clubY, clubUit: 'PeriodeClubTegenstander31', uitslagThuis:1, uitslagUit:0,
      spelersThuis:[{naam:window.__ptSpelerA, positie:'A', goal:1, pen_scoren:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0}],
      spelersUit:[]
    }];

    const rd32 = ensureRonde(32);
    rd32.matches = [{
      clubThuis: clubY, clubUit: 'PeriodeClubTegenstander32', uitslagThuis:4, uitslagUit:0,
      spelersThuis:[
        {naam:window.__ptSpelerA, positie:'A', goal:3, pen_scoren:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0},
        {naam:window.__ptSpelerB, positie:'A', goal:1, pen_scoren:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0}
      ],
      spelersUit:[]
    }];
    addWissel(window.__ptKey, clubY, window.__ptSpelerB, 32, window.__ptSpelerA, 'regulier');

    const rd33 = ensureRonde(33);
    rd33.matches = [{
      clubThuis: clubY, clubUit: 'PeriodeClubTegenstander33', uitslagThuis:3, uitslagUit:0,
      spelersThuis:[
        {naam:window.__ptSpelerA, positie:'A', goal:2, pen_scoren:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0},
        {naam:window.__ptSpelerB, positie:'A', goal:1, pen_scoren:0, eigen_doelpunt:0, assist:0, geen_tegengoals:0, geel:0, geel2:0, rood:0}
      ],
      spelersUit:[]
    }];
    addWissel(window.__ptKey, clubY, window.__ptSpelerA, 33, window.__ptSpelerB, 'regulier');
    buildTeamList();

    window.__pt = {};
    const teamObj = TEAM_LIST.find(t=>t.key===window.__ptKey);
    window.__pt.puntenA32 = getSpelerPuntenInRonde(32, window.__ptSpelerA);
    window.__pt.puntenB32 = getSpelerPuntenInRonde(32, window.__ptSpelerB);
    window.__pt.puntenA31 = getSpelerPuntenInRonde(31, window.__ptSpelerA);
    window.__pt.puntenA33 = getSpelerPuntenInRonde(33, window.__ptSpelerA);
    window.__pt.puntenB33 = getSpelerPuntenInRonde(33, window.__ptSpelerB);
    window.__pt.live31 = liveTotaalRonde(teamObj, 31).total;
    window.__pt.live32 = liveTotaalRonde(teamObj, 32).total;
    window.__pt.live33 = liveTotaalRonde(teamObj, 33).total;
  `);
  const pt = get(sb, "window.__pt");
  console.log('84) Ronde 31 (vóór de wissel) telt gewoon de score van speler A mee:', pt.live31 === pt.puntenA31);
  console.log('85) Ronde 32 (wisselronde): alleen de nieuwe speler B telt mee, speler A niet meer:', pt.live32 === pt.puntenB32 && pt.live32 !== pt.puntenA32);
  console.log('86) Ronde 33 (speler A wisselt terug in voor B): weer alleen A telt mee, niet meer B:', pt.live33 === pt.puntenA33 && pt.live33 !== pt.puntenB33);
  run(sb, "selectedTeamKey = window.__ptKey; renderTeamDetail();");
  const ptDetailHtml = get(sb, "document.getElementById('teamDetail').innerHTML");
  console.log('87) Wissel binnen dezelfde club is toegestaan zolang er maar 1 actief blijft (geen dubbele-club foutmelding):', !ptDetailHtml.includes('row-error') && !ptDetailHtml.includes('dubbele club'));

  console.log('ALLES OK');
}
main().catch(e=>{ console.error('TESTFOUT', e); process.exit(1); });
