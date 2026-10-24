// @ts-nocheck
// Ligamester: kjører kampene på fast tid, uavhengig av om noen er innlogget.
// Deploy som Edge Function "tick" (Verify JWT: av) og kall den hvert minutt med pg_cron.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
/* ===== Ligamester: spillmotor (ren logikk, ingen DOM) ===== */
const Engine = (() => {
'use strict';

const SK = ['kp','df','mf','ps','wg','sc','sp'];
const SKI = {}; SK.forEach((k,i)=>{ SKI[k]=i; });
const SK_NAME = {kp:'Keeper', df:'Forsvar', mf:'Midtbane', ps:'Pasning', wg:'Ving', sc:'Scoring', sp:'Dødballer'};
const SK_SHORT = {kp:'KEE', df:'FOR', mf:'MID', ps:'PAS', wg:'VIN', sc:'SCO', sp:'DØD'};
const SEC = ['LD','CD','RD','MD','LA','CA','RA'];
const SEC_NAME = {LD:'Forsvar venstre', CD:'Forsvar midten', RD:'Forsvar høyre', MD:'Midtbane', LA:'Angrep venstre', CA:'Angrep midten', RA:'Angrep høyre'};
const SPEC = {hode:'Hode', rask:'Rask', teknisk:'Teknisk', kraftfull:'Kraftfull', uforutsigbar:'Uforutsigbar'};
const SPEC_INFO = {
  hode:'Farlig på dødballer og innlegg, og stopper motstanderens dødballer.',
  rask:'Sterkere i angrep og skaper ekstra kontringer.',
  teknisk:'Styrker midtbane og angrep gjennom midten.',
  kraftfull:'Sterkere i forsvar og midtbane, og mindre påvirket av dårlig form.',
  uforutsigbar:'Kan gjøre noe genialt, som regel en gjennombruddspassning (oftere jo bedre pasning han har), eller noe katastrofalt.'
};
const ROLE_NAME = {GK:'Keeper', CB:'Midtstopper', WB:'Back', IM:'Midtbane', W:'Ving', FW:'Spiss'};
const ORDER_NAME = {normal:'Normal', def:'Defensiv', off:'Offensiv', left:'Mot venstre', right:'Mot høyre', mid:'Inn mot midten'};
const SLOT_NAME = {GK:'Keeper', DL:'Venstre back', DC:'Midtstopper', DR:'Høyre back', WL:'Venstre ving', WR:'Høyre ving', AL:'Venstre angrepsving', AR:'Høyre angrepsving', MC:'Midtbane', FC:'Spiss'};
const SLOT_ROLE = {GK:'GK', DC:'CB', DL:'WB', DR:'WB', WL:'W', WR:'W', AL:'W', AR:'W', MC:'IM', FC:'FW'};
const SLOT_SIDE = {DL:'L', WL:'L', AL:'L', DR:'R', WR:'R', AR:'R'};

const N_TEAMS = 14, ROUNDS = 26, SQUAD_MIN = 15, SQUAD_MAX = 28, MATCH_DAYS = [1,4,6]; // tirsdag, fredag, søndag
const START_MONEY = 2000000, SPONSOR_WEEK = 50000, GATE_HOME = 20000, WIN_BONUS = 5000;
const PRIZES = [600000, 350000, 200000];

const FORMATIONS = {
  '4-4-2': ['GK','DL','DC','DC','DR','WL','MC','MC','WR','FC','FC'],
  '4-3-3': ['GK','DL','DC','DC','DR','MC','MC','MC','AL','FC','AR'],
  '3-5-2': ['GK','DC','DC','DC','WL','MC','MC','MC','WR','FC','FC'],
  '4-5-1': ['GK','DL','DC','DC','DR','WL','MC','MC','MC','WR','FC'],
  '5-3-2': ['GK','DL','DC','DC','DC','DR','MC','MC','MC','FC','FC'],
  '3-4-3': ['GK','DC','DC','DC','WL','MC','MC','WR','AL','FC','AR'],
  '5-4-1': ['GK','DL','DC','DC','DC','DR','WL','MC','MC','WR','FC']
};
const LAYOUT = {
  '4-4-2': [[50,90],[11,70],[36,73],[64,73],[89,70],[11,46],[37,50],[63,50],[89,46],[34,25],[66,25]],
  '4-3-3': [[50,90],[11,70],[36,73],[64,73],[89,70],[25,50],[50,54],[75,50],[13,27],[50,25],[87,27]],
  '3-5-2': [[50,90],[24,73],[50,75],[76,73],[9,46],[30,51],[50,54],[70,51],[91,46],[34,25],[66,25]],
  '4-5-1': [[50,90],[11,70],[36,73],[64,73],[89,70],[9,44],[30,51],[50,47],[70,51],[91,44],[50,25]],
  '5-3-2': [[50,90],[8,66],[28,73],[50,75],[72,73],[92,66],[27,48],[50,52],[73,48],[34,25],[66,25]],
  '3-4-3': [[50,90],[24,73],[50,75],[76,73],[9,46],[38,50],[62,50],[91,46],[13,27],[50,25],[87,27]],
  '5-4-1': [[50,90],[8,66],[28,73],[50,75],[72,73],[92,66],[9,44],[38,50],[62,50],[91,44],[50,25]]
};

/* Hva hver posisjon bidrar med til de sju sektorene: [sektor, egenskap, vekt] */
const CT = {
  GK:[['LD','kp',.45],['CD','kp',1.4],['RD','kp',.45]],
  DC:[['CD','df',1],['LD','df',.22],['RD','df',.22],['MD','mf',.10]],
  DL:[['LD','df',1],['CD','df',.35],['MD','mf',.10],['LA','wg',.25],['LA','ps',.05]],
  DR:[['RD','df',1],['CD','df',.35],['MD','mf',.10],['RA','wg',.25],['RA','ps',.05]],
  WL:[['LD','df',.35],['MD','mf',.55],['MD','ps',.10],['LA','wg',.85],['LA','ps',.20],['CA','sc',.12],['CA','ps',.15]],
  WR:[['RD','df',.35],['MD','mf',.55],['MD','ps',.10],['RA','wg',.85],['RA','ps',.20],['CA','sc',.12],['CA','ps',.15]],
  AL:[['LD','df',.12],['MD','mf',.25],['LA','wg',1],['LA','ps',.25],['CA','sc',.22],['CA','ps',.12]],
  AR:[['RD','df',.12],['MD','mf',.25],['RA','wg',1],['RA','ps',.25],['CA','sc',.22],['CA','ps',.12]],
  MC:[['CD','df',.25],['CD','mf',.15],['LD','df',.10],['RD','df',.10],['MD','mf',1],['CA','ps',.40],['CA','mf',.10],['LA','ps',.15],['RA','ps',.15]],
  FC:[['CA','sc',1],['CA','ps',.25],['MD','mf',.12],['LA','sc',.18],['RA','sc',.18]]
};
const isD = s => s==='LD'||s==='CD'||s==='RD';
const isA = s => s==='LA'||s==='CA'||s==='RA';

function ordersFor(st){
  if(st==='GK') return ['normal'];
  if(SLOT_SIDE[st]) return ['normal','def','off','mid'];
  return ['normal','def','off','left','right'];
}

const _oc = {};
function orderedContribs(st, ord){
  const key = st+'|'+ord; if(_oc[key]) return _oc[key];
  let list = CT[st].map(c=>c.slice());
  const winger = st==='WL'||st==='WR'||st==='AL'||st==='AR';
  if(st==='FC' && ord==='def'){
    /* defensiv spiss: faller dypere, mer midtbane og mindre angrep */
    list.forEach(c=>{ if(isA(c[0])) c[2]*=0.75; else if(c[0]==='MD') c[2]*=1.8; });
    list.push(['MD','ps',.10]);
  }
  else if(ord==='def') list.forEach(c=>{ if(isD(c[0])) c[2]*=1.30; else if(isA(c[0])) c[2]*=0.55; });
  else if(ord==='off' && winger){
    /* offensiv ving: mer sideangrep, litt mindre midtbane og forsvar */
    const sideA = SLOT_SIDE[st]==='L' ? 'LA' : 'RA';
    list.forEach(c=>{ if(c[0]===sideA) c[2]*=1.30; else if(isD(c[0])) c[2]*=0.55; else if(c[0]==='MD') c[2]*=0.85; });
  }
  else if(ord==='off') list.forEach(c=>{ if(isA(c[0])) c[2]*=1.30; else if(isD(c[0])) c[2]*=0.55; });
  else if(ord==='left'||ord==='right'){
    const out=[];
    list.forEach(c=>{
      if(c[0]==='CD'||c[0]==='CA'){
        const side = ord==='left' ? (c[0]==='CD'?'LD':'LA') : (c[0]==='CD'?'RD':'RA');
        out.push([c[0],c[1],c[2]*0.6]); out.push([side,c[1],c[2]*0.36]);
      } else out.push(c);
    });
    list = out;
  } else if(ord==='mid'){
    const sd = SLOT_SIDE[st]; const out=[];
    list.forEach(c=>{
      const onSide = (sd==='L' && (c[0]==='LD'||c[0]==='LA')) || (sd==='R' && (c[0]==='RD'||c[0]==='RA'));
      if(onSide){ out.push([c[0],c[1],c[2]*0.6]); out.push([isD(c[0])?'CD':'CA',c[1],c[2]*0.36]); }
      else if(c[0]==='MD' && winger) out.push([c[0],c[1],c[2]*1.15]);
      else out.push(c);
    });
    list = out;
  }
  return (_oc[key] = list.map(c=>[SEC.indexOf(c[0]), SKI[c[1]], c[2], c[0]]));
}
const NORM = SEC.map(()=>0);
FORMATIONS['4-4-2'].forEach(st=>CT[st].forEach(c=>{ NORM[SEC.indexOf(c[0])] += c[2]; }));

/* ---------- tilfeldighet ---------- */
function hashSeed(s){ let h=1779033703^s.length; for(let i=0;i<s.length;i++){ h=Math.imul(h^s.charCodeAt(i),3432918353); h=h<<13|h>>>19; } h=Math.imul(h^h>>>16,2246822507); h=Math.imul(h^h>>>13,3266489909); return (h^h>>>16)>>>0; }
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function rngFrom(str){ return mulberry32(hashSeed(String(str))); }
const ri = (r,a,b)=> a+Math.floor(r()*(b-a+1));
const pick = (r,arr)=> arr[Math.floor(r()*arr.length)];
const clamp = (v,a,b)=> v<a?a:v>b?b:v;
function normal(r){ let u=0,v=0; while(u===0) u=r(); while(v===0) v=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function wpick(r, items, wf){ let t=0; const w=items.map(x=>{ const v=Math.max(0,wf(x)); t+=v; return v; }); if(t<=0) return items[Math.floor(r()*items.length)]; let x=r()*t; for(let i=0;i<items.length;i++){ x-=w[i]; if(x<=0) return items[i]; } return items[items.length-1]; }
function uid(r){ let s='p'; for(let i=0;i<8;i++) s+= '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(r()*36)]; return s; }

/* ---------- spillere ---------- */
const FIRST = ['Torvald','Eirik','Håkon','Leif','Magne','Bjørn','Anders','Tobias','Viljar','Kaelen','Marko','Davor','Isak','Nils','Odd','Rune','Stian','Joar','Mikkel','Aksel','Tarjei','Sander','Erlend','Even','Halvor','Jostein','Knut','Lasse','Mathis','Olav','Per','Ragnar','Sigurd','Trygve','Ulrik','Vegard','Yngve','Arvid','Bertil','Conrad','Dario','Emil','Fredrik','Gunnar','Henrik','Ivar','Jonas','Kasper','Lukas','Mateo','Nikolai','Oskar','Pavel','Rasmus','Sven','Teodor','Ulf','Viktor','Willem','Ylva','Zeno','Alvar','Brage','Casimir','Dag','Elias','Fabian','Gaute','Hugo','Iver','Jarle','Kjell','Linus','Milan','Njål','Otto','Pelle','Roar','Stefan','Thor','Vidar','Wilhelm','Ásgeir','Benno','Cato','Dmitri','Edvard','Finn','Gustav','Hallvard','Ingmar','Jens','Kristoffer'];
const LAST = ['Brekke','Nordvik','Aasen','Halvorsen','Skjelbred','Moen','Vinterstad','Kragh','Dahlen','Sævik','Rødal','Fjeldstad','Lunde','Bakken','Tveit','Storli','Heggen','Ulvestad','Grytten','Kvamme','Solheim','Ravndal','Bergsvik','Haugland','Strand','Lie','Myrvold','Eikeland','Vold','Aamodt','Furuseth','Gjerde','Holmen','Isaksen','Jakobsen','Kleven','Langeland','Midtun','Nybø','Overgård','Pedersvik','Quist','Rognstad','Sandvær','Torp','Urdal','Valen','Wold','Yttri','Zander','Andreasen','Balke','Corneliussen','Dybvik','Engen','Fossum','Grønli','Hovland','Ingebrigtsen','Jørgensvik','Krasnic','Lindqvist','Marinovic','Novak','Ostrov','Petrenko','Rinaldi','Sorensen','Tamm','Varga','Weiss','Zelenka','Berglund','Carlsen','Dalgard','Eide','Foss','Garberg','Hagen','Ilstad','Johannessen','Koppang','Lorentzen','Mathisen','Nesse','Opsahl','Paulsrud','Reinholt','Skarpaas','Thoresen','Unneland','Vestby','Waage'];
const ROLES = ['GK','CB','WB','IM','W','FW'];
const SQUAD_ROLES = ['GK','GK','CB','CB','CB','CB','WB','WB','WB','IM','IM','IM','IM','IM','W','W','W','FW','FW','FW','FW'];
const SPEC_W = {
  GK:null,
  CB:{hode:.35,kraftfull:.35,rask:.15,teknisk:.10,uforutsigbar:.05},
  WB:{rask:.40,kraftfull:.20,teknisk:.20,hode:.10,uforutsigbar:.10},
  IM:{teknisk:.40,kraftfull:.20,uforutsigbar:.20,rask:.10,hode:.10},
  W:{rask:.40,teknisk:.30,uforutsigbar:.20,hode:.05,kraftfull:.05},
  FW:{hode:.30,rask:.25,teknisk:.20,kraftfull:.15,uforutsigbar:.10}
};
function ageOffset(a){ const t={17:-4.5,18:-3.5,19:-2.6,20:-1.7,21:-1.0,22:-.4,23:0,24:.2,25:.3,26:.4,27:.4,28:.3,29:.1,30:-.2,31:-.6,32:-1.1,33:-1.8,34:-2.5}; return a in t ? t[a] : (a<17?-4.5:-3.2); }
function randAge(r){ const x=r(); if(x<.15) return ri(r,17,19); if(x<.40) return ri(r,20,23); if(x<.80) return ri(r,24,29); return ri(r,30,34); }

/* ---------- alder i år og dager: ett aldersår = 52 runder (to sesonger) ---------- */
const AGE_ROUNDS = 52;
let CUR_RN = 0;
function setClock(rn){ CUR_RN = rn; }
function rnOf(league){ return (league.s-1)*ROUNDS + league.r; }
function ageAt(p, rn){ return p.bn==null ? p.a : Math.floor((rn-p.bn)/AGE_ROUNDS); }
function ageParts(p, rn){ if(p.bn==null) return {y:p.a, d:null}; const x=rn-p.bn; return {y:Math.floor(x/AGE_ROUNDS), d:Math.floor(((x%AGE_ROUNDS)+AGE_ROUNDS)%AGE_ROUNDS*7/3)}; }
function ensureAges(teams, rn){
  const ch=new Set();
  for(const t of teams) for(const p of t.players){
    if(p.bn==null){ p.bn = rn - p.a*AGE_ROUNDS - (hashSeed(p.id)%AGE_ROUNDS); ch.add(t.i); }
    const a=ageAt(p,rn); if(a!==p.a){ p.a=a; ch.add(t.i); }
  }
  return ch;
}
function genPlayer(r, role, ab, age, names){
  const n = ()=>normal(r)*1.1;
  const sk=[0,0,0,0,0,0,0];
  const set=(i,v)=>{ sk[i]=clamp(Math.round(v+n()),0,20); };
  switch(role){
    case 'GK': set(0,ab+.8); sk[1]=ri(r,1,5); sk[2]=ri(r,0,3); sk[3]=ri(r,0,4); sk[5]=ri(r,0,2); set(6,ab*.5); break;
    case 'CB': set(1,ab+.5); set(2,ab*.45); set(3,ab*.35); sk[4]=ri(r,0,3); sk[5]=ri(r,0,3); sk[0]=ri(r,0,1); set(6,ab*.45); break;
    case 'WB': set(1,ab); set(4,ab*.6); set(2,ab*.45); set(3,ab*.5); sk[5]=ri(r,0,4); set(6,ab*.35); break;
    case 'IM': set(2,ab+.3); set(3,ab*.85); set(1,ab*.55); sk[4]=ri(r,1,5); set(5,ab*.45); set(6,ab*.5); break;
    case 'W': set(4,ab+.3); set(3,ab*.7); set(2,ab*.55); set(1,ab*.28); set(5,ab*.5); set(6,ab*.4); break;
    default: set(5,ab+.5); set(3,ab*.5); set(2,ab*.4); set(4,ab*.3); sk[1]=ri(r,0,3); set(6,ab*.4);
  }
  let sp=null; const sw=SPEC_W[role];
  if(sw && r()<.28){ const keys=Object.keys(sw); sp=wpick(r,keys,k=>sw[k]); }
  else if(!sw && r()<.05) sp='kraftfull';
  let name; let tries=0;
  do { name = pick(r,FIRST)+' '+pick(r,LAST); tries++; } while(names && names.has(name) && tries<40);
  if(names) names.add(name);
  const tm=clamp(Math.round(5+normal(r)*2.2),1,10), ld=clamp(Math.round(4.5+normal(r)*2+(age>=27?0.8:0)),1,10);
  const sy=r()<.65?pick(r,Object.keys(STYLE)):null;
  const xp=Math.max(0,age-17)*ri(r,0,10)+ri(r,0,15);
  const bn=CUR_RN-age*AGE_ROUNDS-ri(r,0,AGE_ROUNDS-1);
  return {id:uid(r), n:name, a:age, bn, s:sk, pr:[0,0,0,0,0,0,0], f:ri(r,4,6), sp, gl:0, tm, ld, sy, xp, yc:0, sus:0};
}

const ROLE_SC = {
  GK:p=>p.s[0],
  CB:p=>.80*p.s[1]+.20*p.s[2],
  WB:p=>.60*p.s[1]+.30*p.s[4]+.10*p.s[3],
  IM:p=>.65*p.s[2]+.25*p.s[3]+.10*p.s[1],
  W:p=>.60*p.s[4]+.20*p.s[3]+.10*p.s[2]+.10*p.s[5],
  FW:p=>.70*p.s[5]+.15*p.s[3]+.15*p.s[2]
};
function bestRole(p){ let br='IM',bv=-1; for(const k of ROLES){ const v=ROLE_SC[k](p); if(v>bv){bv=v;br=k;} } return br; }
function ability(p){ let bv=0; for(const k of ROLES){ const v=ROLE_SC[k](p); if(v>bv) bv=v; } return bv; }
function ageValueF(a){ return a<=21?1.2: a<=23?1.1: a<=28?1.0: a<=30?.82: a<=32?.6: a<=34?.4: .25; }
function value(p){ const a=Math.max(ability(p),.5); let v=1100*Math.pow(a,2.6)*ageValueF(p.a); if(p.sp) v*=1.08; return Math.max(5000, Math.round(v/1000)*1000); }
function wage(p){ return Math.max(300, Math.round(value(p)*0.0022/100)*100); }

function genSquad(r, T, names){
  const players = SQUAD_ROLES.map(role=>{ const age=randAge(r); return genPlayer(r, role, clamp(T+normal(r)*1.7+ageOffset(age),1,19), age, names); });
  return players;
}
function genYouth(r, names){ const role=pick(r,ROLES); return genPlayer(r, role, clamp(4.5+normal(r)*1.5,1,9), 17, names); }
function genMarketPlayer(r, names){ const role=pick(r,ROLES); const age=ri(r,18,33); const ab=clamp(8.2+normal(r)*2.6+ageOffset(age)*.5,1.5,17.5); return genPlayer(r, role, ab, age, names); }

/* ---------- lag ---------- */
const TEAM_DEFS = [
  ['Fjellvik IL','FJE','#C8102E','#FFFFFF'], ['Skagerak FK','SKA','#0B5FA5','#F2C230'], ['Nordhavn United','NOR','#16324F','#7FD1F5'],
  ['Rødberg SK','RØD','#9E1B1B','#F4E3C1'], ['Vestmark Rovers','VES','#1F7A4D','#FFFFFF'], ['Blåfjell BK','BLÅ','#2B50AA','#FFFFFF'],
  ['Svartelva FK','SVA','#1A1A1A','#E9B824'], ['Tindra IF','TIN','#6C3A8C','#F1E6F7'], ['Kystbyen AFC','KYS','#0E8A8F','#FFFFFF'],
  ['Lysfjord Athletic','LYS','#E58B1B','#1D2B3A'], ['Granmoen FK','GRA','#2F5B2E','#E3D26F'], ['Stormarken SK','STO','#4B5563','#FF5A36'],
  ['Dalsvik City','DAL','#78B7E8','#0F2E52'], ['Ravnheim FK','RAV','#3B2A4F','#D9D9D9']
];
function newTeam(i, r, names, T){
  const d=TEAM_DEFS[i];
  const t = { i, name:d[0], short:d[1], c:[d[2],d[3]], owner:null, money:START_MONEY, players:genSquad(r,T,names), lineup:null, training:{a:null,b:null}, ai:{}, tl:[], st:{} };
  t.training = {a:pick(r,['df','mf','ps','sc','wg']), b:null};
  t.ai = {pref:pick(r,Object.keys(FORMATIONS)), until:0};
  t.lineup = autoLineup(t);
  return t;
}

/* ---------- ratinger ---------- */
function formMult(p){ let m=0.80+0.035*(p.f||5); if(p.sp==='kraftfull') m=1+(m-1)*0.5; return m; }
function specMult(p, sec){
  let m=1;
  if(p.sp==='rask' && isA(sec)) m*=1.08;
  else if(p.sp==='teknisk'){ if(sec==='MD') m*=1.07; else if(sec==='CA') m*=1.05; }
  else if(p.sp==='kraftfull'){ if(isD(sec)) m*=1.07; else if(sec==='MD') m*=1.04; }
  if(p.sy==='kjemp' && (isD(sec)||sec==='MD')) m*=1.03;
  return m;
}
const DEF_T = ['DL','DC','DR'];
function defIdx(types){ const a=[]; types.forEach((t,i)=>{ if(DEF_T.includes(t)) a.push(i); }); return a; }
/* mulige roller for forsvarsspiller nr k av d, gitt rekkefølgen venstre til høyre */
function defAllowed(k,d){ if(d<=1) return ['DC']; if(k===0) return ['DC','DL']; if(k===d-1) return ['DC','DR']; return ['DC']; }
function validTy(base, ty){
  if(!Array.isArray(ty) || ty.length!==11) return false;
  const di=defIdx(base); let dc=0;
  for(let i=0;i<11;i++){
    const k=di.indexOf(i);
    if(k<0){ if(ty[i]!==base[i]) return false; }
    else { if(!defAllowed(k,di.length).includes(ty[i])) return false; if(ty[i]==='DC') dc++; }
  }
  return dc<=3;
}
function slotsOf(lineup){ const b=FORMATIONS[lineup.f] || FORMATIONS['4-4-2']; return (lineup.ty && validTy(b,lineup.ty)) ? lineup.ty : b; }
function layoutOf(lineup){
  const b=FORMATIONS[lineup.f] || FORMATIONS['4-4-2']; const lay=(LAYOUT[lineup.f]||LAYOUT['4-4-2']).map(x=>x.slice());
  const ty=slotsOf(lineup); const di=defIdx(b); if(ty===b) return lay;
  const hasL=ty[di[0]]==='DL', hasR=ty[di[di.length-1]]==='DR';
  const cs=di.filter(i=>ty[i]==='DC'); const left=hasL?30:14, right=hasR?70:86;
  di.forEach((i,k)=>{
    if(ty[i]==='DL'){ lay[i]=[10,68]; }
    else if(ty[i]==='DR'){ lay[i]=[90,68]; }
    else { const j=cs.indexOf(i); const x=cs.length===1?50:left+(right-left)*j/(cs.length-1); lay[i]=[Math.round(x),74]; }
  });
  return lay;
}
function mapById(players){ const m={}; players.forEach(p=>{ m[p.id]=p; }); return m; }

function calcRatings(players, lineup, byId){
  byId = byId || mapById(players);
  return calcRatingsSl(byId, slotsOf(lineup), lineup.sl, lineup.o);
}
function slotScore(p, st){ let s=0; for(const c of CT[st]) s+=p.s[SKI[c[1]]]*c[2]*(c[0]==='MD'?1.1:1); return s*(0.88+0.024*(p.f||5)); }
const SLOT_ORDER = {GK:0, FC:1, AL:2, AR:2, WL:3, WR:3, MC:4, DL:5, DR:5, DC:6};
function lineupQuality(r){ return (r[0]+r[1]+r[2])/3 + r[3]*1.1 + (r[4]+r[5]+r[6])/3*1.1; }

function assignFormation(players, f){
  const slots=FORMATIONS[f]; const idx=slots.map((s,i)=>i).sort((a,b)=>SLOT_ORDER[slots[a]]-SLOT_ORDER[slots[b]]);
  const used=new Set(); const sl=new Array(11).fill(null);
  for(const i of idx){
    let best=null,bv=-1;
    for(const p of players){ if(used.has(p.id)) continue; const v=slotScore(p,slots[i]); if(v>bv){bv=v;best=p;} }
    if(best){ sl[i]=best.id; used.add(best.id); }
  }
  return sl;
}
function bestTaker(players, sl){ let b=null,bv=-1; const by=mapById(players); sl.forEach(id=>{ const p=by[id]; if(p && p.s[6]>bv){bv=p.s[6];b=p.id;} }); return b; }
function autoLineup(team){
  const players=team.players; let best=null,bq=-1; const pref=team.ai&&team.ai.pref;
  for(const f of Object.keys(FORMATIONS)){
    const sl=assignFormation(players,f);
    const lu={f, sl, o:new Array(11).fill('normal'), tk:null};
    const q=lineupQuality(calcRatings(players,lu))*(f===pref?1.05:1);
    if(q>bq){bq=q;best=lu;}
  }
  best.tk=bestTaker(players,best.sl); best.cap=bestCaptainId(mapById(players),best.sl); best.subs=[];
  return best;
}
/* Gyldig oppstilling? Ellers fyll hull med beste ledige spiller */
function ensureLineup(team){
  const lu=team.lineup;
  const ids=new Set(team.players.map(p=>p.id));
  if(!lu || !FORMATIONS[lu.f] || !Array.isArray(lu.sl) || lu.sl.length!==11){ team.lineup=autoLineup(team); return true; }
  let changed=false; const seen=new Set();
  lu.sl = lu.sl.map(id=>{ if(id && ids.has(id) && !seen.has(id)){ seen.add(id); return id; } changed=true; return null; });
  if(lu.ty && !validTy(FORMATIONS[lu.f],lu.ty)){ lu.ty=null; changed=true; }
  if(!lu.o || lu.o.length!==11){ lu.o=new Array(11).fill('normal'); changed=true; }
  const slots=slotsOf(lu);
  lu.o = lu.o.map((o,i)=> ordersFor(slots[i]).includes(o)?o:'normal');
  if(lu.sl.some(x=>!x)){
    const free=team.players.filter(p=>!seen.has(p.id));
    slots.map((s,i)=>i).sort((a,b)=>SLOT_ORDER[slots[a]]-SLOT_ORDER[slots[b]]).forEach(i=>{
      if(lu.sl[i]) return;
      let best=null,bv=-1; for(const p of free){ if(seen.has(p.id)) continue; const v=slotScore(p,slots[i]); if(v>bv){bv=v;best=p;} }
      if(best){ lu.sl[i]=best.id; seen.add(best.id); }
    });
    changed=true;
  }
  if(!lu.tk || !ids.has(lu.tk)){ lu.tk=bestTaker(team.players,lu.sl); changed=true; }
  if(!lu.cap || !ids.has(lu.cap)){ lu.cap=bestCaptainId(mapById(team.players),lu.sl); changed=true; }
  const subs=Array.isArray(lu.subs)?lu.subs:[]; const okSubs=subs.filter(x=>x&&ids.has(x.out)&&ids.has(x.inn)&&x.out!==x.inn).slice(0,5);
  if(!Array.isArray(lu.subs) || okSubs.length!==subs.length){ lu.subs=okSubs; changed=true; }
  return changed;
}
function teamStrength(team){ ensureLineup(team); return lineupQuality(calcRatings(team.players, team.lineup)); }

/* ---------- trening ---------- */
const REL = {
  kp:{GK:1,CB:.04,WB:.04,IM:.04,W:.04,FW:.04},
  df:{CB:1,WB:.9,IM:.35,W:.25,FW:.12,GK:.15},
  mf:{IM:1,W:.5,FW:.35,WB:.35,CB:.3,GK:.08},
  ps:{IM:1,W:.8,FW:.6,WB:.6,CB:.45,GK:.12},
  wg:{W:1,WB:.65,IM:.2,FW:.28,CB:.08,GK:.04},
  sc:{FW:1,W:.45,IM:.3,WB:.1,CB:.08,GK:.03},
  sp:{IM:.65,FW:.6,W:.6,WB:.5,CB:.5,GK:.3}
};
function cost(level){ return 0.55*Math.pow(1.16, level); }
function ageTrainF(a){ return a<=17?2.2: a===18?2.05: a===19?1.85: a===20?1.65: a===21?1.45: a===22?1.28: a===23?1.12: a<=26?1: a===27?.96: a===28?.92: a===29?.88: a===30?.82: a<=32?.70: .55; }
function lineupRoles(team){ const m={}; const slots=slotsOf(team.lineup); team.lineup.sl.forEach((id,i)=>{ if(id) m[id]=SLOT_ROLE[slots[i]]; }); return m; }
function trainShare(team){ const tr=team.training||{}; const ks=[tr.a,tr.b].filter(Boolean); return {ks, share: ks.length===2?0.6:1}; }
const TRAIN_SCALE = 0.3;
function trainingRate(p, k, role, inLine, share){ return TRAIN_SCALE*REL[k][role]*(inLine?1:0.5)*share*ageTrainF(p.a); }
function trainTeam(team, r, week){
  const {ks,share}=trainShare(team); if(!ks.length) return;
  ensureLineup(team);
  const roles=lineupRoles(team);
  for(const p of team.players){
    const inLine=!!roles[p.id]; const role=roles[p.id]||bestRole(p);
    for(const k of ks){
      const i=SKI[k]; if(p.s[i]>=20) continue;
      p.pr[i] += trainingRate(p,k,role,inLine,share)*(0.85+r()*0.3);
      let up=0;
      while(p.s[i]<20 && p.pr[i]>=cost(p.s[i])){ p.pr[i]-=cost(p.s[i]); p.s[i]++; up++; }
      if(p.s[i]>=20) p.pr[i]=0;
      if(up) team.tl.unshift({w:week,p:p.n,k,l:p.s[i],d:1});
    }
  }
  team.tl = team.tl.slice(0,24);
}
const DECLINE_W = {kp:.5, df:1, mf:.8, ps:.6, wg:1.3, sc:1, sp:.35};
function agingDecline(team, r, week){
  for(const p of team.players){
    if(p.a<30) continue;
    const base=Math.min(0.045, 0.006*(p.a-29));
    SK.forEach((k,i)=>{
      if(p.s[i]>0 && r()<base*DECLINE_W[k]){ p.s[i]--; p.pr[i]=0; team.tl.unshift({w:week,p:p.n,k,l:p.s[i],d:-1}); }
    });
  }
  team.tl = team.tl.slice(0,24);
}
function formDrift(team, r){
  for(const p of team.players){
    const x=r(); let step = x<.25?-1: x>.75?1:0;
    if(p.f>=7 && r()<.3) step=-1; if(p.f<=3 && r()<.3) step=1;
    p.f=clamp((p.f||5)+step,1,8);
  }
}
function aiPlan(team, r, week){
  if(team.ai && team.ai.until>week) return;
  const pool=['df','mf','ps','sc','wg','df','mf','sc','kp','sp'];
  const a=pick(r,pool); let b=pick(r,pool); let g=0; while(b===a && g++<10) b=pick(r,pool);
  team.training={a, b: r()<.55?b:null};
  team.ai={pref:(team.ai&&team.ai.pref)||pick(r,Object.keys(FORMATIONS)), until: week+ri(r,3,6)};
}

/* ---------- økonomi ---------- */
function weeklyFinance(team){
  const w=team.players.reduce((s,p)=>s+wage(p),0);
  team.money += SPONSOR_WEEK - w;
  return {income:SPONSOR_WEEK, wages:w};
}

/* ---------- kampmotor ---------- */
/* ---------- personlighet, kaptein, kort ---------- */
const STYLE = {lag:'Lagspiller', ind:'Individualist', kjemp:'Kjemper', fair:'Fair spiller'};
const STYLE_INFO = {
  lag:'Spiller ofte fram medspillere og legger opp til flere mål.',
  ind:'Går ofte for avslutning selv, men legger sjeldnere opp til andre.',
  kjemp:'Hardtarbeidende i forsvar og på midtbanen, men tar oftere frispark.',
  fair:'Spiller ryddig og får sjeldnere kort.'
};
const tmOf = p => p.tm==null?5:p.tm;
const ldOf = p => p.ld==null?5:p.ld;
function expLevel(p){ return clamp((p.xp||0)/10,0,10); }
function capScore(p){ return clamp((0.55*ldOf(p)+0.45*expLevel(p))/10,0,1); }
function tmLabel(v){ return v<=3?'Rolig':v<=6?'Balansert':v<=8?'Hissig':'Temperamentsfull'; }
function ldLabel(v){ return v<=3?'Svak leder':v<=6?'Middels leder':v<=8?'God leder':'Født leder'; }
function expLabel(l){ return l<2?'Uerfaren':l<5?'Litt erfaren':l<8?'Erfaren':'Veteran'; }
function capLabel(p){ const c=capScore(p); return c<.3?'Dårlig egnet':c<.5?'Passe egnet':c<.7?'Godt egnet':'Svært godt egnet'; }
function bestCaptainId(by, sl){ let b=null,bv=-1; sl.forEach(id=>{ const p=by[id]; if(p){ const v=capScore(p); if(v>bv){bv=v;b=p.id;} } }); return b; }

/* AI-lagenes bytteplan: søk offensivt ved tap, sikre ved ledelse */
function aiSubs(team, lu, by, sus){
  const inXI=new Set(lu.sl); const bench=team.players.filter(p=>!inXI.has(p.id) && !(sus&&sus.has(p.id)));
  const slots=slotsOf(lu); const subs=[]; const usedIn=new Set(), usedOut=new Set();
  const weakest=(types)=>{ let bi=-1,bv=1e9; slots.forEach((st,i)=>{ if(!types.includes(st)||!lu.sl[i]||usedOut.has(lu.sl[i])) return; const v=slotScore(by[lu.sl[i]],st); if(v<bv){bv=v;bi=i;} }); return bi; };
  const bestIn=(st)=>{ let b=null,bv=-1; bench.forEach(p=>{ if(usedIn.has(p.id)) return; const v=slotScore(p,st); if(v>bv){bv=v;b=p;} }); return b; };
  let i=weakest(['DC']); let inn=bestIn('FC');
  if(i>=0 && inn){ subs.push({m:60,c:'trail',out:lu.sl[i],inn:inn.id,as:'FC'}); usedOut.add(lu.sl[i]); usedIn.add(inn.id); }
  i=weakest(['FC','AL','AR']); inn=bestIn('DC');
  if(i>=0 && inn){ subs.push({m:70,c:'lead',out:lu.sl[i],inn:inn.id,as:'DC'}); usedOut.add(lu.sl[i]); usedIn.add(inn.id); }
  let bg=0,bi=-1,bp=null;
  slots.forEach((st,j)=>{ if(st==='GK'||!lu.sl[j]||usedOut.has(lu.sl[j])) return; bench.forEach(p=>{ if(usedIn.has(p.id)) return; const g=slotScore(p,st)-slotScore(by[lu.sl[j]],st); if(g>bg){bg=g;bi=j;bp=p;} }); });
  if(bi>=0 && bg>0.8) subs.push({m:65,c:'always',out:lu.sl[bi],inn:bp.id,as:null});
  return subs;
}
/* Gyldig oppstilling for en kamp: erstatt utestengte, sjekk kaptein, legg til AI-bytter */
function effLineup(team){
  ensureLineup(team);
  const lu=JSON.parse(JSON.stringify(team.lineup)); const by=mapById(team.players);
  const sus=new Set(team.players.filter(p=>(p.sus||0)>0).map(p=>p.id));
  const slots=slotsOf(lu); const taken=new Set(lu.sl.filter(id=>id&&!sus.has(id)));
  slots.map((s,i)=>i).sort((a,b)=>SLOT_ORDER[slots[a]]-SLOT_ORDER[slots[b]]).forEach(i=>{
    if(lu.sl[i] && !sus.has(lu.sl[i])) return;
    let best=null,bv=-1; for(const p of team.players){ if(taken.has(p.id)||sus.has(p.id)) continue; const v=slotScore(p,slots[i]); if(v>bv){bv=v;best=p;} }
    lu.sl[i]=best?best.id:null; if(best){ taken.add(best.id); lu.o[i]='normal'; }
  });
  if(!lu.cap || !lu.sl.includes(lu.cap)) lu.cap=bestCaptainId(by,lu.sl);
  if(!lu.tk || !lu.sl.includes(lu.tk)) lu.tk=bestTaker(team.players,lu.sl);
  if(!team.owner) lu.subs=aiSubs(team,lu,by,sus);
  return {lu,by,sus};
}

/* ---------- kampsimulering i tidsvinduer (5 min) med bytter, kort og kaptein ---------- */
const SHOOT_W = {FC:1, AL:.5, AR:.5, WL:.35, WR:.35, MC:.22, DL:.04, DR:.04, DC:.04, GK:0};
const ASSIST_W = {MC:1, WL:.9, WR:.9, AL:.9, AR:.9, FC:.5, DL:.35, DR:.35, DC:.15, GK:0};
const PEN_W = {GK:.5, DC:1.3, DL:1, DR:1, MC:.7, WL:.3, WR:.3, AL:.2, AR:.2, FC:.2};
const FOUL_W = {GK:.05, DC:1.2, DL:1, DR:1, MC:1.3, WL:.8, WR:.8, AL:.7, AR:.7, FC:.6};
/* typisk bidrag per rolle; kamprating 5 = typisk for rollen */
const RATE_REF = {GK:6.7, DL:5.5, DR:5.5, DC:3.2, MC:5.0, WL:6.2, WR:6.2, AL:6.6, AR:6.6, FC:4.8};
const PG0 = 0.31, PGK = 1.0, RD_ = 0.5;
const SUB_SLOTS = ['DC','DL','DR','MC','WL','WR','AL','AR','FC'];
const SUB_COND = {always:'Alltid', trail:'Ved tap', lead:'Ved ledelse', draw:'Ved uavgjort'};
function fm(p){ return formMult(p); }
function calcRatingsSl(by, types, sl, o){
  const r=[0,0,0,0,0,0,0];
  types.forEach((st,i)=>{
    const p=by[sl[i]]; if(!p) return; const f=formMult(p);
    for(const c of orderedContribs(st, (o&&o[i])||'normal')) r[c[0]] += p.s[c[1]]*c[2]*f*specMult(p,c[3]);
  });
  return r.map((v,k)=>v/NORM[k]);
}
function mkSide(team, home, r){
  const {lu,by,sus}=effLineup(team);
  return {team, by, types:slotsOf(lu).slice(), sl:lu.sl.slice(), o:lu.o.slice(), f:lu.f, home,
    mult:home?1.06:1, noise:[0,0,0,0,0,0,0].map(()=>1+normal(r)*0.035),
    capId:lu.cap, tkId:lu.tk, subs:(lu.subs||[]).slice(0,5).map(s=>({...s,done:false})), subsLeft:5,
    yel:{}, played:new Set(lu.sl.filter(Boolean)), sus, capTalk:false, ratSum:0};
}
function onField(side){ const o=[]; side.types.forEach((st,i)=>{ const p=side.by[side.sl[i]]; if(p) o.push({st, p, ord:(side.o&&side.o[i])||'normal', i}); }); return o; }
function capInfo(side){
  let p=side.by[side.capId]; let k=1;
  if(!p || !side.sl.includes(p.id)){ p=null; let bv=-1; side.sl.forEach(id=>{ const q=side.by[id]; if(q){ const v=capScore(q); if(v>bv){bv=v;p=q;} } }); k=.8; }
  return {p, q:p?capScore(p)*k:0};
}
function sideRat(side, deficit){
  const rat=calcRatingsSl(side.by, side.types, side.sl, side.o);
  const ci=capInfo(side); const cf=1+ci.q*(0.02+(deficit>=2?0.045:deficit===1?0.03:0));
  return rat.map((v,k)=>v*side.mult*side.noise[k]*cf);
}
function mkCtx(side, rat){
  const xi=onField(side); const gk=xi.find(x=>x.st==='GK');
  return {team:side.team, side, rat, xi, gk:gk?gk.p:null,
    tk: side.by[side.tkId] && side.sl.includes(side.tkId) ? side.by[side.tkId] : bestTakerP(xi),
    hodeAtk: Math.min(3, xi.filter(x=>x.p.sp==='hode' && x.st!=='GK').length),
    hodeDef: Math.min(3, xi.filter(x=>x.p.sp==='hode' && (x.st==='DC'||x.st==='DL'||x.st==='DR')).length),
    quick: Math.min(2, xi.filter(x=>x.p.sp==='rask').length),
    unp: xi.filter(x=>x.p.sp==='uforutsigbar').slice(0,2)};
}
function bestTakerP(xi){ let b=null,bv=-1; xi.forEach(x=>{ if(x.p.s[6]>bv){bv=x.p.s[6];b=x.p;} }); return b; }
function shootW(x){ return SHOOT_W[x.st]*(x.p.s[5]+1)*(x.p.sy==='ind'?1.25:1); }
function pickShooter(r, T, not){ return wpick(r, T.xi.filter(x=>x.p!==not), shootW); }
function pickAssist(r, T, not){ return wpick(r, T.xi.filter(x=>x.p!==not), x=>ASSIST_W[x.st]*(x.p.s[3]+1)*(x.p.sy==='lag'?1.35:x.p.sy==='ind'?.85:1)); }

/* ---------- kommentar ---------- */
const GOAL_KINDS = {g:1, s:1, u:1, b:1, p:1};
const P = (r,arr)=>arr[Math.floor(r()*arr.length)];
function buildUp(r, sec, S, A){
  const side = sec===0?'venstre':sec===2?'høyre':'midten';
  let s;
  if(A){
    if(sec===1) s=P(r,[`${A} finner ${S} sentralt med en vakker pasning mellom linjene.`,`${A} stikker ballen i dybden, og ${S} er på den!`,`${A} sender ballen inn i midten til ${S}.`,`Fin kombinasjon i midten mellom ${A} og ${S}.`]);
    else s=P(r,[`${A} vrir spillet mot ${side} med god pasning opp til ${S} som setter fart fremover.`,`${A} slår ballen ut på ${side} kanten til ${S}.`,`${S} får ballen på ${side} siden etter en lur pasning fra ${A}.`,`Angrep ned ${side} kanten! ${A} spiller opp ${S}.`]);
  } else {
    s=P(r,[`${S} vinner ballen og drar av gårde mot mål.`,`${S} tar saken i egne hender og går fremover.`,`${S} får ballen og setter fart ${sec===1?'rett mot mål':'ned '+side+' kanten'}.`]);
  }
  const d=r();
  if(d<.35) s+=` ${S} runder en spiller.`+(r()<.45?' Han runder en til!':'');
  else if(d<.55) s+=` ${S} lurer forsvaret med en finte.`;
  return s;
}
const shotLine=(r,S)=>P(r,['Fyrer av et skudd.',`${S} skyter!`,`${S} prøver seg!`,`${S} tar sats og avslutter.`]);
function goalLine(r,S,K){
  return P(r,[`Limer ballen i krysset! ${K} er sjanseløs! For en scoring!`,`Rett i hjørnet! ${K} er sjanseløs! For et angrep og for en herlig scoring!`,`Ballen går i nettet! ${S} jubler!`,`${K} får ikke tak i den. Mål!`,`Ballen suser i mål, og ${K} står igjen uten svar!`]);
}
function missLine(r,kind,K,S){
  if(kind==='sv') return P(r,[`${K} får fingrene på ballen og tar den!`,`${K} redder i full strekk!`,`Flott redning av ${K}!`]);
  if(kind==='ms') return P(r,['Så nær, men ballen går utenfor.','Ballen går rett over mål.','Forbi stolpen.']);
  if(kind==='bl') return P(r,['Forsvaret kaster seg i veien og blokkerer.','Skuddet blir blokkert i siste liten.']);
  return P(r,['Ballen smeller i stolpen!','Ballen treffer tverrliggeren! Så nær!']);
}
function fillerText(r, X, Y){
  const pl=T=>T.xi.filter(x=>x.st!=='GK'); const xs=pl(X); const a=P(r,xs).p.n, b=P(r,xs.filter(x=>x.p.n!==a)).p.n, c=P(r,pl(Y)).p.n;
  return P(r,[`${a} og ${b} holder ballen godt på midtbanen.`,`${X.team.name} presser høyt og vinner ballen tilbake.`,`${c} stopper et lovende angrep for ${Y.team.name}.`,`${a} prøver en lang ball, men ${c} er våken.`,`Rolig oppbygging hos ${X.team.name}.`,`${b} tar et løp, men blir stoppet like utenfor feltet.`,`Det er hard duell på midtbanen mellom ${a} og ${c}.`,`${X.team.name} holder ballen og leter etter en åpning.`]);
}
function labelOf(t, L1){
  const L2s=L1+15;
  if(t<L1){ const m=Math.max(1,Math.ceil(t)); return m>45?`45+${m-45}'`:`${m}'`; }
  const tt=t-L2s+45; const m=Math.max(46,Math.ceil(tt)); return m>90?`90+${m-90}'`:`${m}'`;
}

function simulateMatch(Ht, At, r){
  const sides=[mkSide(Ht,true,r), mkSide(At,false,r)];
  const L1=45+ri(r,1,4), L2=45+ri(r,2,6), Ttot=L1+L2;
  const ev=[]; const mirror={0:2,1:1,2:0}; const cards=[];
  const sr=v=>{ const f=Math.floor(v); return f+(r()<v-f?1:0); };
  const toReal=x=> x<L1 ? Math.max(0.3,x) : L1+15+(x-L1);
  const gm=x=> x<L1 ? Math.min(x,44.9) : 45+(x-L1);
  const sc=[0,0]; const SK_=['h','a'];
  const push=(x,e)=>{ e.t=Math.round(toReal(x)*10)/10; ev.push(e); if(GOAL_KINDS[e.k]) sc[e.s==='h'?0:1]++; };
  const wins=[]; for(let x=0;x<L1;x+=5) wins.push([x,Math.min(L1,x+5)]); for(let x=L1;x<Ttot;x+=5) wins.push([x,Math.min(Ttot,x+5)]);
  const kpName=Y=>Y.gk?Y.gk.n:'keeperen';
  let shots=[0,0], shareSum=0, firstRat=null;
  const startTy=sides.map(sd=>sd.types.slice());
  const xg=[0,0]; const addx=(side,v)=>{ xg[side==='h'?0:1]+=v; };
  const rs=[]; const pacc={};
  /* spillerens bidrag til lagets ratinger (ferdighet x koeffisient x form x spesialitet, normalisert som lagratingene) */
  const contribOf=(p,st,o)=>{ const f=formMult(p); let v=0; for(const c of orderedContribs(st,o||'normal')) v+=p.s[c[1]]*c[2]*f*specMult(p,c[3])/NORM[c[0]]; return v; };
  const trackPlayers=(side,w)=>{ side.types.forEach((st,i)=>{ const p=side.by[side.sl[i]]; if(!p) return; const a=pacc[p.id]||(pacc[p.id]={n:p.n,m:0,c:0,st,h:side===sides[0],i,s:rs.length<=1?1:0}); a.m+=w; a.c+=w*contribOf(p,st,side.o[i]); a.st=st; }); };

  function attackOnce(X, Y, side, x, R){
    const secW=[X.rat[4],X.rat[5],X.rat[6]];
    const s=wpick(r,[0,1,2],i=>secW[i]*secW[i]);
    const att=X.rat[4+s], def=Y.rat[mirror[s]];
    const Rr=0.5+(Math.pow(att,1.6)/(Math.pow(att,1.6)+Math.pow(def,1.6))-0.5)*RD_;
    const pShot=Math.min(0.75, 0.5*Math.pow(Rr,1.2));
    if(r()>=pShot) return;
    shots[side==='h'?0:1]++;
    const sh=pickShooter(r,X);
    /* måltsjansen avgjøres av sektorduellen: lagets angrepsrating mot motstanderens forsvarsrating (keeperen er en del av forsvarsratingen) */
    let pg=clamp(PG0+PGK*(Rr-0.5),0.05,0.70);
    if(s!==1){ pg*=0.92; if(sh.p.sp==='hode') pg+=0.06; }
    addx(side,pg);
    const asst = r()<0.72 ? pickAssist(r,X,sh.p) : null;
    const S=sh.p.n, K=kpName(Y);
    const base=buildUp(r,s,S,asst?asst.p.n:null)+' '+shotLine(r,S);
    if(r()<pg) push(x+r()*5,{k:'g', s:side, p:S, i:sh.p.id, a:asst?asst.p.n:null, tx:base+' '+goalLine(r,S,K)});
    else { const o=r(); const kind=o<.55?'sv':o<.77?'ms':o<.9?'bl':'po'; push(x+r()*5,{k:kind, s:side, p:S, tx:base+' '+missLine(r,kind,K,S)}); }
  }
  /* keeper på dødball og straffe: dødball teller mest, keeperskill en del */
  const gkQ=Y=>Y.gk?(0.6*Y.gk.s[6]+0.4*Y.gk.s[0])*fm(Y.gk):0;
  function setPiece(X, Y, side, x, free){
    const sp=X.tk?X.tk.s[6]*fm(X.tk):0;
    const kf=clamp(1.2-0.035*gkQ(Y),0.5,1.3);
    const p=clamp(0.85*kf*(0.025+0.11*(sp/20)+0.014*X.hodeAtk-0.008*Y.hodeDef), 0.01, 0.3);
    shots[side==='h'?0:1]++; addx(side,p);
    const T=X.tk?X.tk.n:'en spiller'; const corner=!free;
    const intro=corner?`Hjørnespark til ${X.team.name}. ${T} slår ballen inn i feltet.`:`Frispark til ${X.team.name} i god posisjon. ${T} står klar over ballen.`;
    if(r()<p){
      const cand=X.xi.filter(z=>z.st!=='GK'); const w=wpick(r,cand,z=>(z.p.sp==='hode'?3:1)*(z.p.s[5]+z.p.s[1]*.5+2));
      const S=w.p.n; const hd=w.p.sp==='hode'||r()<.5;
      const fin = (!corner && w.p===X.tk) ? `${S} sparker ballen rett i mål! ${kpName(Y)} står helt stille.` : hd ? `${S} hever seg høyest og nikker ballen i mål!` : `${S} får ballen og dundrer den i mål!`;
      push(x+r()*5,{k:'s', s:side, p:S, i:w.p.id, a:X.tk?X.tk.n:null, tx:intro+' '+fin+' Så deilig!'});
    } else push(x+r()*5,{k:'sn', s:side, tx:intro+' '+P(r,['Forsvaret klarerer til slutt.',`${kpName(Y)} redder dødballen.`,'Ballen går rett over mål.','Ingenting kommer ut av det.'])});
  }
  function penalty(X, Y, side, x){
    const T=X.tk||bestTakerP(X.xi).p||X.xi[0].p; const tp=T.s[6]*fm(T), ts=T.s[5]*fm(T);
    const tq=0.75*tp+0.25*ts, kq=gkQ(Y); const K=kpName(Y);
    shots[side==='h'?0:1]++;
    const pg=clamp(0.70+0.022*(tq-kq),0.45,0.90); addx(side,pg);
    const intro=`${T.n} stiller opp foran ballen på straffemerket. ${K} står klar på streken.`;
    if(r()<pg) push(x,{k:'p', s:side, p:T.n, i:T.id, a:null, tx:intro+' '+P(r,[`${T.n} skyter sikkert i hjørnet. Mål!`,`${T.n} setter ballen midt i mål, og ${K} kaster seg feil vei!`,`${T.n} sender ballen i krysset! ${K} har ingen sjanse!`])+' Så kald fra elleve meter!'});
    else {
      const saved=r()<clamp(0.5+0.01*(kq-tq),0.35,0.7);
      push(x,{k:saved?'ps':'pm', s:side, p:T.n, tx:intro+' '+(saved?P(r,[`${K} leser ${T.n} og redder straffen!`,`${K} kaster seg riktig og tar straffen!`]):P(r,[`${T.n} setter ballen i stolpen!`,`${T.n} skyter høyt over mål!`,`${T.n} drar den utenfor!`]))});
    }
  }
  function sendOff(side, X, p, x){
    const i=side.sl.indexOf(p.id); if(i<0) return;
    const wasGk=side.types[i]==='GK'; side.sl[i]=null;
    if(wasGk){
      const cand=(side.subsLeft>0 ? Object.values(side.by).filter(q=>!side.played.has(q.id)&&!side.sus.has(q.id)) : onField(side).map(z=>z.p)).sort((a,b)=>b.s[0]-a.s[0]);
      const kp=cand[0];
      if(kp){
        if(side.subsLeft>0 && !side.sl.includes(kp.id)){ side.subsLeft--; side.played.add(kp.id); side.sl[i]=kp.id; side.o[i]='normal'; }
        else { const j=side.sl.indexOf(kp.id); if(j>=0){ side.sl[j]=null; side.sl[i]=kp.id; side.o[i]='normal'; } }
        // laget spiller på ti: ta bort den svakeste utespilleren hvis begge plasser er fylt
        if(side.sl.filter(Boolean).length>10){ let wi=-1,wv=1e9; side.types.forEach((st,j)=>{ if(st==='GK'||!side.sl[j]) return; const v=slotScore(side.by[side.sl[j]],st); if(v<wv){wv=v;wi=j;} }); if(wi>=0) side.sl[wi]=null; }
      }
    }
  }
  function foul(X, Y, sideCode, x, Xs, Ys){
    const w=wpick(r,X.xi,z=>FOUL_W[z.st]*(tmOf(z.p)+2)*(z.p.sy==='kjemp'?1.35:z.p.sy==='fair'?.6:1));
    const victim=P(r,Y.xi.filter(z=>z.st!=='GK').length?Y.xi.filter(z=>z.st!=='GK'):Y.xi).p;
    const p=w.p; const xx=x+r()*5;
    push(xx,{k:'fl', s:sideCode, p:p.n, tx:P(r,[`${p.n} kommer for sent inn mot ${victim.n}. Frispark til ${Y.team.name}.`,`${p.n} tar ${victim.n} hardt. Dommeren blåser for frispark.`,`Det blir frispark etter en dum takling fra ${p.n} på ${victim.n}.`])});
    const tm=tmOf(p); const fair=p.sy==='fair';
    const pRed=0.0004+0.0002*tm; const pY=(0.05+0.03*tm)*(fair?0.7:1)*(Xs.yel[p.id]?0.4:1);
    let red=false, yel=false;
    if(r()<pRed){ red=true; push(xx+0.05,{k:'rc', s:sideCode, p:p.n, i:p.id, tx:`Rødt kort! ${p.n} går i bakken og dommeren viser ham rødt kort for en grov takling. ${X.team.name} må spille med ti mann!`}); cards.push({i:p.id,s:sideCode,k:'r'}); }
    else if(r()<pY){
      if(Xs.yel[p.id]){ red=true; push(xx+0.05,{k:'rc', s:sideCode, p:p.n, i:p.id, tx:`Andre gule kort for ${p.n}, og dermed rødt! ${X.team.name} må spille med ti mann.`}); const ci=cards.findIndex(c=>c.i===p.id&&c.k==='y'); if(ci>=0) cards.splice(ci,1); cards.push({i:p.id,s:sideCode,k:'r'}); }
      else { yel=true; Xs.yel[p.id]=1; push(xx+0.05,{k:'yc', s:sideCode, p:p.n, i:p.id, tx:`Gult kort til ${p.n}.`}); cards.push({i:p.id,s:sideCode,k:'y'}); }
    }
    if(red) sendOff(Xs,X,p,x);
    if(r()<0.04*PEN_W[w.st]){
      push(xx+0.08,{k:'fl', s:sideCode, p:p.n, tx:`${p.n} bryter ned ${victim.n} inne i sekstenmeteren! Dommeren peker på straffemerket!`});
      return 'pen';
    }
    if(!red && r()<0.35) return 'fk';
    return red?'red':null;
  }
  function wild(X, Y, side, x, frac){
    for(const u of X.unp){
      if(r()>=0.4*frac) continue;
      const ps=u.p.s[3]; const pos=clamp(0.35+0.04*ps,0.35,0.92);
      const oside=side==='h'?'a':'h';
      if(r()<pos){
        const rc=pickShooter(r,X,u.p); if(!rc) continue;
        const K=kpName(Y);
        if(r()<0.8){
          const shv=rc.p.s[5]*fm(rc.p); const kv=(Y.gk?Y.gk.s[0]*fm(Y.gk):2); const q=shv*shv/(shv*shv+kv*kv+0.01);
          const intro=`${u.p.n} ser en glipp i forsvaret og slår en genial gjennombruddspassning! ${rc.p.n} er helt alene med ${K}.`;
          const pu=clamp(0.30+0.45*q,0.3,0.8); addx(side,pu);
          if(r()<pu) push(x+r()*5,{k:'u', s:side, p:rc.p.n, i:rc.p.id, a:u.p.n, tx:intro+' Han holder roen og setter ballen i mål! For en pasning!'});
          else push(x+r()*5,{k:'un', s:side, p:rc.p.n, tx:intro+' '+P(r,[`${K} redder fantastisk!`,`Men ${K} kommer ut og stenger vinkelen.`,`Skuddet går like utenfor!`])});
        } else {
          const intro=`${u.p.n} gjør noe helt uventet! Han dribler to mann og slår en finte.`;
          addx(side,0.6);
          if(r()<0.6) push(x+r()*5,{k:'u', s:side, p:u.p.n, i:u.p.id, a:null, tx:intro+' Så dundrer han ballen i mål!'});
          else push(x+r()*5,{k:'un', s:side, p:u.p.n, tx:intro+' '+P(r,['Men skuddet går like utenfor.',`Men ${K} gjør en flott redning.`])});
        }
      } else {
        const sh=pickShooter(r,Y); if(!sh) continue;
        addx(oside,0.45);
        if(r()<0.45) push(x+r()*5,{k:'b', s:oside, p:sh.p.n, i:sh.p.id, a:null, tx:`${u.p.n} slurver med ballen rett foran eget mål! ${sh.p.n} er framme og sender den i mål!`});
        else push(x+r()*5,{k:'un', s:side, p:u.p.n, tx:`${u.p.n} mister ballen i en farlig sone, men ${Y.team.name} klarer ikke å utnytte det.`});
      }
    }
  }
  function doSubs(side, x, deficit, sideCode){
    for(const sb of side.subs){
      if(sb.done || side.subsLeft<=0) continue;
      if(gm(x)<sb.m) continue;
      const c=sb.c||'always';
      if(c==='trail' && deficit<=0) continue; if(c==='lead' && deficit>=0) continue; if(c==='draw' && deficit!==0) continue;
      const i=side.sl.indexOf(sb.out); const inn=side.by[sb.inn];
      if(i<0 || !inn || side.played.has(sb.inn) || side.sus.has(sb.inn)){ if(i<0||!inn||side.played.has(sb.inn)||side.sus.has(sb.inn)) sb.done=true; continue; }
      sb.done=true; side.subsLeft--;
      const outP=side.by[sb.out];
      side.sl[i]=sb.inn; side.played.add(sb.inn);
      let moved='';
      if(sb.as && sb.as!==side.types[i] && SUB_SLOTS.includes(sb.as) && side.types[i]!=='GK'){ side.types[i]=sb.as; moved=` ${inn.n} spiller nå som ${SLOT_NAME[sb.as].toLowerCase()}.`; }
      if(!ordersFor(side.types[i]).includes(side.o[i])) side.o[i]='normal'; else side.o[i]='normal';
      if(side.capId===sb.out) { /* kapteinsbind overtas av beste på banen via capInfo */ }
      const why=c==='trail'?' Treneren satser offensivt.':c==='lead'?' Treneren sikrer ledelsen.':'';
      push(x,{k:'sub', s:sideCode, p:inn.n, i:inn.id, tx:`Bytte for ${side.team.name}: ${inn.n} kommer inn for ${outP?outP.n:'en spiller'}.${moved}${why}`});
    }
  }

  for(let wi=0; wi<wins.length; wi++){
    const [x0,x1]=wins[wi]; const w=x1-x0; const frac=w/Ttot;
    const diff=[sc[0]-sc[1], sc[1]-sc[0]];
    doSubs(sides[0],x0,diff[0],'h'); doSubs(sides[1],x0,diff[1],'a');
    const rat=[sideRat(sides[0],Math.max(0,-diff[0])), sideRat(sides[1],Math.max(0,-diff[1]))];
    if(!firstRat) firstRat=rat.map(a=>a.slice());
    rs.push([Math.round(toReal(x0)*10)/10, rat[0].map(v=>Math.round(v*10)/10), rat[1].map(v=>Math.round(v*10)/10)]);
    trackPlayers(sides[0],w); trackPlayers(sides[1],w);
    const C=[mkCtx(sides[0],rat[0]), mkCtx(sides[1],rat[1])];
    // kapteinen samler laget
    for(let k=0;k<2;k++){ const s=sides[k]; if(diff[k]<0 && !s.capTalk){ const ci=capInfo(s); if(ci.p && ci.q>=0.4){ s.capTalk=true; push(x0+0.05,{k:'c', s:SK_[k], p:ci.p.n, tx:`${ci.p.n} samler laget og roper at nå må ${s.team.name} sette fart! Kapteinen drar laget fremover.`}); } } }
    const mh=rat[0][3], ma=rat[1][3];
    let shareH = Math.pow(mh,1.6)/(Math.pow(mh,1.6)+Math.pow(ma,1.6)); shareH = 0.5+(shareH-0.5)*0.9; shareSum+=shareH*w;
    const nH=sr(41*shareH*(1+0.03*C[0].quick)*frac), nA=sr(41*(1-shareH)*(1+0.03*C[1].quick)*frac);
    for(let k=0;k<nH;k++) attackOnce(C[0],C[1],'h',x0);
    for(let k=0;k<nA;k++) attackOnce(C[1],C[0],'a',x0);
    // hjørnespark og frispark fra spill
    for(let k=0;k<2;k++){ const n=sr(1.7*frac); for(let j=0;j<n;j++){ const free=r()<.3; setPiece(C[k],C[1-k],SK_[k],x0,free); } }
    // frispark og kort
    for(let k=0;k<2;k++){
      const n=sr(3.6*frac);
      for(let j=0;j<n;j++){ const res=foul(C[k],C[1-k],SK_[k],x0,sides[k],sides[1-k]); if(res==='fk') setPiece(C[1-k],C[k],SK_[1-k],x0+0.1,true); else if(res==='pen') penalty(C[1-k],C[k],SK_[1-k],x0+0.5+r()*0.3); }
    }
    wild(C[0],C[1],'h',x0,frac); wild(C[1],C[0],'a',x0,frac);
    const nf=sr(8*frac); for(let j=0;j<nf;j++){ const h=r()<.5; const X=h?C[0]:C[1], Y=h?C[1]:C[0]; if(X.xi.length>2&&Y.xi.length>2) push(x0+r()*w,{k:'f', s:h?'h':'a', tx:fillerText(r,X,Y)}); }
  }
  const total=L1+15+L2;
  const st=(t,tx)=>ev.push({k:'st', s:'', t, tx});
  st(0,`Dommeren blåser i gang kampen mellom ${Ht.name} og ${At.name}!`);
  st(44.5,`Dommeren varsler ${L1-45} ${L1-45===1?'minutt':'minutter'} tilleggstid.`);
  st(L1,'Pause!');
  st(L1+15,'Andre omgang er i gang.');
  st(L1+15+44.5,`Dommeren varsler ${L2-45} minutter tilleggstid.`);
  st(total,'Dommeren blåser av kampen!');
  ev.sort((a,b)=>a.t-b.t);
  let hg=0, ag=0;
  ev.forEach(e=>{
    e.lab = e.k==='st' ? '' : labelOf(e.t, L1);
    if(GOAL_KINDS[e.k]){ if(e.s==='h') hg++; else ag++; e.sc=[hg,ag]; }
    if(e.k==='st' && e.tx==='Pause!') e.tx=`Pause! Stillingen er ${hg}–${ag}.`;
    if(e.k==='st' && e.tx==='Dommeren blåser av kampen!') e.tx=`Dommeren blåser av kampen! Sluttresultat ${Ht.name} ${hg}–${ag} ${At.name}.`;
  });
  const round1=a=>a.map(v=>Math.round(v*10)/10);
  const shareH=shareSum/Ttot;
  return {hg, ag, hs:shots[0], as:shots[1], hp:Math.round(shareH*100), hr:round1(firstRat[0]), ar:round1(firstRat[1]), hf:sides[0].f, af:sides[1].f, L1, L2, ty:startTy, rs, xg:[Math.round(xg[0]*100)/100,Math.round(xg[1]*100)/100], pr:Object.fromEntries(Object.entries(pacc).map(([id,a])=>[id,[Math.round(clamp(5*(a.c/Math.max(1,a.m))/(RATE_REF[a.st]||5),0,10)*10),Math.round(a.m),a.st,a.n,a.h?'h':'a',a.i,a.s]])), cd:cards, pl:{h:[...sides[0].played], a:[...sides[1].played]}, ev};
}

/* ---------- treningskamp: bruker godkjente oppstillinger, uten følger for tabell, kort og utestengelse ---------- */
function simulateFriendly(Ht, At, luH, luA, id){
  const mk=(T,lu)=>({...T, players:T.players.map(p=>({...p, sus:0})), lineup: lu?JSON.parse(JSON.stringify(lu)):JSON.parse(JSON.stringify(T.lineup||null))});
  const H=mk(Ht,luH), A=mk(At,luA);
  const res=simulateMatch(H,A,rngFrom('fr-'+id));
  return Object.assign({h:Ht.i,a:At.i},res);
}

/* ---------- terminliste ---------- */
function makeFixtures(season){
  const r=rngFrom('fx-'+season); let arr=[]; for(let i=0;i<N_TEAMS;i++) arr.push(i);
  for(let i=arr.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  const first=[];
  for(let rd=0;rd<N_TEAMS-1;rd++){
    const pairs=[];
    for(let i=0;i<N_TEAMS/2;i++){ const a=arr[i], b=arr[N_TEAMS-1-i]; pairs.push(((rd+i)%2===0)?[a,b]:[b,a]); }
    first.push(pairs);
    arr=[arr[0], arr[N_TEAMS-1], ...arr.slice(1,N_TEAMS-1)];
  }
  const second=first.map(rd=>rd.map(p=>[p[1],p[0]]));
  return first.concat(second);
}

/* ---------- tid (Europe/Oslo) ---------- */
const TZ='Europe/Oslo';
const _fmt = new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function osloParts(ms){ const o={}; _fmt.formatToParts(new Date(ms)).forEach(p=>{ if(p.type!=='literal') o[p.type]=+p.value; }); return o; }
function osloOffset(ms){ const p=osloParts(ms); return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-Math.floor(ms/1000)*1000; }
function osloToUtc(y,m,d,h,mi){ const guess=Date.UTC(y,m-1,d,h,mi); let ts=guess-osloOffset(guess); ts=guess-osloOffset(ts); return ts; }
function mondayOf(ms){ const p=osloParts(ms); const dt=new Date(Date.UTC(p.year,p.month-1,p.day)); const dow=(dt.getUTCDay()+6)%7; dt.setUTCDate(dt.getUTCDate()-dow); return {y:dt.getUTCFullYear(), m:dt.getUTCMonth()+1, d:dt.getUTCDate()}; }
const KICKOFF_H=18;
function slotTime(anchor, g){
  const wk=Math.floor(g/3), day=MATCH_DAYS[g%3];
  const dt=new Date(Date.UTC(anchor.y,anchor.m-1,anchor.d+7*wk+day));
  return osloToUtc(dt.getUTCFullYear(), dt.getUTCMonth()+1, dt.getUTCDate(), KICKOFF_H, 0);
}
function firstSlotAfter(anchor, ms){ let g=0; while(slotTime(anchor,g)<=ms) g++; return g; }

/* ---------- liga ---------- */
function emptyTable(){ const t=[]; for(let i=0;i<N_TEAMS;i++) t.push([0,0,0,0,0,0,0]); return t; } // [spilt,v,u,t,mål for,mål mot,poeng]
function tableOrder(tb){
  return tb.map((row,i)=>({t:i,p:row[0],w:row[1],d:row[2],l:row[3],gf:row[4],ga:row[5],pts:row[6],gd:row[4]-row[5]}))
    .sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||a.t-b.t);
}
function createLeague(now){
  setClock(0);
  const r=rngFrom('liga-'+now); const names=new Set();
  const teams=[]; for(let i=0;i<N_TEAMS;i++){ const T=clamp(8.6+normal(r)*0.7,7.0,10.2); teams.push(newTeam(i,r,names,T)); }
  { const t0=teams[0]; const jd=t0.players.filter(p=>bestRole(p)==='IM').sort((a,b)=>ability(b)-ability(a))[1] || t0.players[5];
    names.delete(jd.n); jd.n='Jan Do'; names.add('Jan Do'); jd.sp='uforutsigbar'; jd.a=27; jd.s[3]=Math.max(jd.s[3],13); jd.ld=Math.max(jd.ld,7); jd.sy='lag'; jd.xp=Math.max(jd.xp,70); }
  const anchor=mondayOf(now);
  const g0=firstSlotAfter(anchor, now+90*60000);
  const league={v:1, created:now, anchor, g:g0, g0, s:1, r:0, fx:makeFixtures(1), tb:emptyTable(), hist:[], wk:Math.floor(g0/3)};
  const market=newMarketDoc();
  refreshMarket(market, teams, r, league.wk, names);
  return {league, teams, market};
}

/* ---------- marked ---------- */
function newMarketDoc(){ return {w:0, items:[], log:[]}; }
function addLog(market, text, w){ market.log.unshift({w, t:text}); market.log=market.log.slice(0,30); }
function fmtKr(n){ const s=Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,' '); return s+' kr'; }
function refreshMarket(market, teams, r, week, names){
  market.w=week;
  // AI kjøper spillere som mennesker har lagt ut
  const keep=[];
  for(const it of market.items){
    if(it.from>=0){
      const seller=teams[it.from]; const p=seller && seller.players.find(x=>x.id===it.id);
      if(!p){ continue; }
      const v=value(p); const prob = it.price<=v*1.12 ? 0.6 : it.price<=v*1.4 ? 0.15 : 0.03;
      if(r()<prob){
        const buyers=teams.filter(t=>!t.owner && t.i!==it.from && t.money>=it.price && t.players.length<SQUAD_MAX);
        if(buyers.length){
          const b=pick(r,buyers);
          seller.players=seller.players.filter(x=>x.id!==p.id); seller.money+=it.price;
          delete p.lst; b.players.push(p); b.money-=it.price;
          addLog(market, `${b.name} kjøpte ${p.n} (${p.a} år) fra ${seller.name} for ${fmtKr(it.price)}`, week);
          continue;
        }
      }
      if(it.exp<=week){ delete p.lst; continue; }
      keep.push(it);
    } else {
      if(it.exp>week) keep.push(it);
    }
  }
  market.items=keep;
  const n=ri(r,18,22);
  for(let k=0;k<n;k++){
    const p=genMarketPlayer(r,names);
    const price=Math.round(value(p)*(1.05+r()*0.25)/1000)*1000;
    market.items.push({id:p.id, price, from:-1, exp:week+2, pl:p});
  }
  if(market.items.length>70) market.items=market.items.slice(-70);
}

/* ---------- sesongskifte ---------- */
function seasonRollover(league, teams, r, names){
  const order=tableOrder(league.tb);
  const champ=order[0];
  league.hist.push({s:league.s, t:champ.t, name:teams[champ.t].name, pts:champ.pts});
  league.hist=league.hist.slice(-20);
  order.slice(0,3).forEach((row,i)=>{ teams[row.t].money+=PRIZES[i]; });
  const notes=[];
  for(const t of teams){
    const retired=[];
    t.players.forEach(p=>{ p.gl=0; });
    t.players=t.players.filter(p=>{
      if(p.a>=38 || (p.a>=35 && r()<(p.a-34)*0.15)){ retired.push(p); return false; }
      return true;
    });
    t.players.push(genYouth(r,names));
    while(t.players.length<SQUAD_MIN+1) t.players.push(genYouth(r,names));
    if(!t.owner){ ensureLineup(t); const inXI=new Set(t.lineup.sl); while(t.players.length>23){ const c=t.players.filter(p=>!inXI.has(p.id)).sort((a,b)=>value(a)-value(b))[0]; if(!c) break; t.players=t.players.filter(p=>p!==c); } }
    ensureLineup(t);
    if(t.owner && retired.length) notes.push({t:t.i, text:`${retired.map(p=>p.n).join(', ')} la opp etter sesongen.`});
    t.st={};
  }
  league.s++; league.r=0; league.fx=makeFixtures(league.s); league.tb=emptyTable();
  return notes;
}

/* ---------- en kampdag i to faser: avspark og slutt ---------- */
function simulateRound(league, teams, market, names){
  const g=league.g;
  const rn0=rnOf(league); setClock(rn0);
  const r0=rngFrom('slot-'+g+'-'+league.s);
  const week=Math.floor(g/3);
  const out={doc:null, changed:new Set(), marketChanged:false};
  ensureAges(teams, rn0).forEach(i=>out.changed.add(i));
  if(g%3===0){
    for(const t of teams){
      if(!t.owner) aiPlan(t,r0,week);
      trainTeam(t,r0,week); agingDecline(t,r0,week); formDrift(t,r0); weeklyFinance(t);
      out.changed.add(t.i);
    }
    refreshMarket(market, teams, r0, week, names);
    league.wk=week;
    out.marketChanged=true;
  }
  const rd=league.r; const kick=slotTime(league.anchor,g);
  const doc={s:league.s, r:rd, g, t:kick, live:true, m:[]};
  for(const [h,a] of league.fx[rd]){
    const Ht=teams[h], At=teams[a];
    if(!Ht.owner && (!Ht.lineup || g%3===0)) Ht.lineup=autoLineup(Ht);
    if(!At.owner && (!At.lineup || g%3===0)) At.lineup=autoLineup(At);
    const res=simulateMatch(Ht,At,rngFrom(`m-${league.s}-${rd}-${h}-${a}`));
    doc.m.push(Object.assign({h,a},res));
    out.changed.add(h); out.changed.add(a);
  }
  doc.end = kick + Math.max(...doc.m.map(m=>m.L1+15+m.L2))*60000;
  league.ph=1;
  out.doc=doc;
  return out;
}
function finishRound(league, teams, doc, names){
  const r0=rngFrom('fin-'+doc.g+'-'+league.s);
  const out={changed:new Set(), notes:[], rolled:false};
  for(const res of doc.m){
    const Ht=teams[res.h], At=teams[res.a];
    const th=league.tb[res.h], ta=league.tb[res.a];
    th[0]++; ta[0]++; th[4]+=res.hg; th[5]+=res.ag; ta[4]+=res.ag; ta[5]+=res.hg;
    if(res.hg>res.ag){ th[1]++; ta[3]++; th[6]+=3; Ht.money+=WIN_BONUS; }
    else if(res.hg<res.ag){ ta[1]++; th[3]++; ta[6]+=3; At.money+=WIN_BONUS; }
    else { th[2]++; ta[2]++; th[6]++; ta[6]++; }
    Ht.money+=GATE_HOME;
    for(const [T,code] of [[Ht,'h'],[At,'a']]){
      T.players.forEach(p=>{ if((p.sus||0)>0) p.sus--; });
      for(const id of ((res.pl&&res.pl[code])||[])){ const p=T.players.find(x=>x.id===id); if(p) p.xp=(p.xp||0)+1; }
      for(const c of (res.cd||[])){ if(c.s!==code) continue; const p=T.players.find(x=>x.id===c.i); if(!p) continue;
        if(c.k==='r') p.sus=1; else { p.yc=(p.yc||0)+1; if(p.yc>=3){ p.sus=1; p.yc=0; } } }
    }
    for(const e of res.ev){ if(!GOAL_KINDS[e.k]) continue; const T=(e.s==='h')?Ht:At; const pl=T.players.find(p=>p.id===e.i); if(pl) pl.gl=(pl.gl||0)+1; }
    out.changed.add(res.h); out.changed.add(res.a);
  }
  doc.live=false;
  league.g++; league.r++; league.ph=0;
  setClock(rnOf(league)); ensureAges(teams, rnOf(league)).forEach(i=>out.changed.add(i));
  if(league.r>=ROUNDS){
    out.notes=seasonRollover(league,teams,r0,names);
    teams.forEach(t=>out.changed.add(t.i));
    out.rolled=true;
  }
  return out;
}
/* enkel hjelper for tester: kjør hele kampdagen i ett */
function runSlot(league, teams, market, names){
  const a=simulateRound(league,teams,market,names);
  const b=finishRound(league,teams,a.doc,names);
  b.round=a.doc; b.marketChanged=a.marketChanged; a.changed.forEach(i=>b.changed.add(i));
  return b;
}


return {
  SK, SKI, SK_NAME, SK_SHORT, SEC, SEC_NAME, SPEC, SPEC_INFO, ROLE_NAME, ORDER_NAME, SLOT_NAME, SLOT_ROLE, SLOT_SIDE, ROLES,
  N_TEAMS, ROUNDS, SQUAD_MIN, SQUAD_MAX, FORMATIONS, LAYOUT, CT, REL, ROLE_SC, TEAM_DEFS, PRIZES, START_MONEY,
  ordersFor, orderedContribs, calcRatings, slotScore, autoLineup, ensureLineup, lineupQuality, teamStrength, assignFormation,
  bestRole, ability, value, wage, cost, ageTrainF, trainingRate, lineupRoles, trainShare, formMult,
  genPlayer, genMarketPlayer, genYouth, genSquad, newTeam, mapById,
  simulateMatch, makeFixtures, slotTime, firstSlotAfter, mondayOf, osloParts, emptyTable, tableOrder,
  createLeague, newMarketDoc, refreshMarket, addLog, fmtKr, runSlot, simulateRound, finishRound, seasonRollover, GOAL_KINDS, labelOf,
  rngFrom, mulberry32, uid, SQUAD_ROLES, bestTaker,
  slotsOf, layoutOf, validTy, defAllowed, defIdx, simulateFriendly, rnOf, ageAt, ageParts, ensureAges, setClock, AGE_ROUNDS, TRAIN_SCALE,
  STYLE, STYLE_INFO, SUB_SLOTS, SUB_COND, tmOf, ldOf, expLevel, capScore, tmLabel, ldLabel, expLabel, capLabel, bestCaptainId, effLineup, calcRatingsSl
};
})();

/* ===== Ligamester: lagring og handlinger mot delt database ===== */
function makeStore({db, uid, now}){
  const E = Engine;
  now = now || (()=>Date.now());
  const hid = (uid||'anon')+'-'+Math.random().toString(36).slice(2,8);
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  const clone = o => JSON.parse(JSON.stringify(o));
  const refs = { league: db.doc('league/main'), market: db.doc('market/current'), teams: db.collection('teams') };
  const teamRef = i => db.doc('teams/t'+i);
  const fail = msg => { throw new Error(msg); };

  async function withLease(name, ttlMs, fn){
    for(let k=0;k<20;k++){
      const r = await db.doc('locks/'+name).acquire({holder:hid, ttlMs});
      if(r.acquired) return fn();
      await sleep(250+Math.random()*350);
    }
    fail('Spillet er opptatt akkurat nå. Prøv igjen om et øyeblikk.');
  }
  async function retry(fn){
    try { return await fn(); }
    catch(e){ if(e && e.code==='unavailable'){ await sleep(400+Math.random()*400); return fn(); } throw e; }
  }

  async function ensureInit(){
    const snap = await refs.league.get();
    if(snap.exists) return false;
    const lease = await db.doc('locks/init').acquire({holder:hid, ttlMs:30000});
    if(!lease.acquired) return false;
    if((await refs.league.get()).exists) return false;
    const {league, teams, market} = E.createLeague(now());
    for(const t of teams) await retry(()=>teamRef(t.i).set(t));
    await retry(()=>refs.market.set(market));
    await retry(()=>refs.league.set(league));
    return true;
  }

  async function readAllTeams(){
    const snap = await refs.teams.get();
    const arr = new Array(E.N_TEAMS).fill(null);
    snap.docs.forEach(d=>{ const t=d.data(); if(t && typeof t.i==='number') arr[t.i]=clone(t); });
    return arr;
  }

  const roundId = d => 'rounds/s'+d.s+'r'+d.r;
  function dueNow(L, doc){
    const t=now();
    if(!L.ph) return t >= E.slotTime(L.anchor, L.g);
    return doc ? t >= doc.end : false;
  }
  /* ----- treningskamper ----- */
  const frRef = id => db.doc('friendlies/'+id);
  const FR_ACTIVE = ['open','ready','live'];
  async function readFriendlies(){ const s=await db.collection('friendlies').get(); return s.docs.map(d=>d.data()).filter(Boolean); }
  async function challenge(fromI, toI){
    return withLease("friendly", 2500, async ()=>{
      const from=(await teamRef(fromI).get()).data(); const to=(await teamRef(toI).get()).data();
      if(!from || from.owner!==uid) fail('Du styrer ikke dette laget.');
      if(!to || toI===fromI) fail('Ugyldig motstander.');
      const all=await readFriendlies();
      if(all.some(f=>FR_ACTIVE.includes(f.st) && (f.h===fromI||f.a===fromI))) fail('Laget ditt har allerede en treningskamp på gang.');
      if(all.some(f=>FR_ACTIVE.includes(f.st) && (f.h===toI||f.a===toI))) fail('Motstanderen har allerede en treningskamp på gang.');
      const id='f'+now().toString(36)+Math.random().toString(36).slice(2,5);
      await retry(()=>frRef(id).set({id, st:'open', h:fromI, a:toI, ai:!to.owner, lu:{h:null,a:null}, ok:{h:false,a:false}, t0:now(), startAt:null}));
      return id;
    });
  }
  async function approveFriendly(id, ti){
    const res=await withLease("friendly", 2500, async ()=>{
      const snap=await frRef(id).get(); const f=snap.exists?snap.data():null;
      if(!f || f.st!=='open') fail('Treningskampen er ikke lenger åpen.');
      const side = f.h===ti ? 'h' : f.a===ti ? 'a' : null; if(!side) fail('Du er ikke med i denne kampen.');
      const team=(await teamRef(ti).get()).data(); if(!team || team.owner!==uid) fail('Du styrer ikke dette laget.');
      const c=clone(team); E.ensureLineup(c);
      f.lu[side]=clone(c.lineup); f.ok[side]=true;
      if(f.ai) f.ok.a=true;
      if(f.ok.h && f.ok.a){ f.st='ready'; f.startAt = f.ai ? now()+2*60000 : now(); }
      await retry(()=>frRef(id).set(f));
      return f;
    });
    try{ await tickFriendlies(); }catch(e){}
    return res;
  }
  async function cancelFriendly(id){
    const snap=await frRef(id).get(); const f=snap.exists?snap.data():null; if(!f) return;
    if(!['open','ready'].includes(f.st)) fail('Kampen kan ikke lenger avbrytes.');
    const [h,a]=await Promise.all([teamRef(f.h).get(), teamRef(f.a).get()]);
    if(h.data().owner!==uid && a.data().owner!==uid) fail('Du er ikke med i denne kampen.');
    await retry(()=>frRef(id).update({st:'cancelled'}));
  }
  async function tickFriendlies(){
    let n=0; const list=await readFriendlies(); const t=now();
    for(const f of list){
      if(f.st==='open' && t-f.t0>6*3600000){ await retry(()=>frRef(f.id).update({st:'expired'})); continue; }
      if(['done','cancelled','expired'].includes(f.st) && t-(f.end||f.t0)>48*3600000){ await retry(()=>frRef(f.id).delete()); continue; }
      if(f.st==='ready' && t>=f.startAt){
        const lease=await db.doc('locks/friendly-sim').acquire({holder:hid, ttlMs:10000}); if(!lease.acquired) continue;
        const fresh=(await frRef(f.id).get()).data(); if(!fresh || fresh.st!=='ready') continue;
        const [h,a]=await Promise.all([teamRef(fresh.h).get(), teamRef(fresh.a).get()]);
        const L=(await refs.league.get()).data(); if(L) E.setClock(E.rnOf(L));
        const m=E.simulateFriendly(h.data(), a.data(), fresh.lu.h, fresh.ai?null:fresh.lu.a, fresh.id);
        await retry(()=>frRef(fresh.id).set({...fresh, st:'live', live:true, t:fresh.startAt, end:fresh.startAt+(m.L1+15+m.L2)*60000, m})); n++;
      } else if(f.st==='live' && t>=f.end){
        await retry(()=>frRef(f.id).update({st:'done', live:false})); n++;
      }
    }
    return n;
  }

  async function tick(){
    try{ await tickFriendlies(); }catch(e){}
    const first = await refs.league.get();
    if(!first.exists) return {ran:0};
    const L0 = first.data();
    let d0=null;
    if(L0.ph){ const s=await db.doc('rounds/s'+L0.s+'r'+L0.r).get(); d0=s.exists?s.data():null; }
    if(!dueNow(L0,d0)) return {ran:0};
    const lease = await db.doc('locks/tick').acquire({holder:hid, ttlMs:60000});
    if(!lease.acquired) return {ran:0, busy:true};
    const league = clone((await refs.league.get()).data());
    const teams = await readAllTeams();
    if(teams.some(t=>!t)) fail('Mangler lagdata.');
    const orig = teams.map(t=>clone(t));
    const msnap = await refs.market.get();
    const market = msnap.exists ? clone(msnap.data()) : E.newMarketDoc();
    const names = new Set(); teams.forEach(t=>t.players.forEach(p=>names.add(p.n)));
    let doc=null; if(league.ph){ const s=await db.doc('rounds/s'+league.s+'r'+league.r).get(); doc=s.exists?clone(s.data()):null; if(!doc) league.ph=0; }
    const docs=new Map(); const changed=new Set(); let marketChanged=false; let started=0, finished=0; let guard=0;
    while(guard++<200){
      if(!league.ph){
        if(now() < E.slotTime(league.anchor, league.g)) break;
        const out=E.simulateRound(league,teams,market,names);
        doc=out.doc; docs.set(roundId(doc),doc); out.changed.forEach(i=>changed.add(i)); if(out.marketChanged) marketChanged=true; started++;
      } else {
        if(!doc || now() < doc.end) break;
        const out=E.finishRound(league,teams,doc,names);
        docs.set(roundId(doc),doc); out.changed.forEach(i=>changed.add(i)); finished++; doc=null;
      }
    }
    if(!started && !finished) return {ran:0};
    for(const d of docs.values()) await retry(()=>db.doc(roundId(d)).set(d));
    for(const i of changed){
      const diff={}; const a=teams[i], b=orig[i];
      for(const k of Object.keys(a)){ if(k==='owner'||k==='name'||k==='c'||k==='short') continue; if(JSON.stringify(a[k])!==JSON.stringify(b[k])) diff[k]=a[k]; }
      if(Object.keys(diff).length) await retry(()=>teamRef(i).update(diff));
    }
    if(marketChanged) await retry(()=>refs.market.set(market));
    await retry(()=>refs.league.set(league));
    return {ran:finished, started};
  }
  async function lineupLocked(){
    const s=await refs.league.get(); if(!s.exists) return false;
    const L=s.data(); return now() >= E.slotTime(L.anchor, L.g);
  }

  /* ----- lag ----- */
  const shortOf = n => (String(n).replace(/[^A-Za-zÆØÅæøå]/g,'').slice(0,3)||'LAG').toUpperCase();
  function cleanName(name, teams, selfI){
    name=String(name||'').trim().replace(/\s+/g,' ').slice(0,28);
    if(name.length<2) fail('Klubbnavnet er for kort.');
    if(teams.some(t=>t && t.i!==selfI && t.name.toLowerCase()===name.toLowerCase())) fail('Det navnet brukes allerede av et annet lag.');
    return name;
  }
  async function claimTeam(i, newName){
    return withLease("claim", 2500, async ()=>{
      const teams = await readAllTeams();
      if(teams.some(t=>t && t.owner===uid)) fail('Du styrer allerede et lag.');
      const t = teams[i]; if(!t) fail('Laget finnes ikke.');
      if(t.owner) fail('Laget er allerede tatt over av en annen manager.');
      const upd={owner:uid, ownerSince:now(), ai:{pref:(t.ai&&t.ai.pref)||'4-4-2', until:0}};
      if(newName!=null && String(newName).trim()!==t.name){ const nm=cleanName(newName,teams,i); upd.name=nm; upd.short=shortOf(nm); }
      await retry(()=>teamRef(i).update(upd));
    });
  }
  async function releaseTeam(i){
    return withLease("claim", 2500, async ()=>{
      const s = await teamRef(i).get(); const t=s.data();
      if(!t || t.owner!==uid) fail('Du styrer ikke dette laget.');
      await retry(()=>teamRef(i).update({owner:null, ownerSince:null}));
    });
  }
  async function saveLineup(i, lineup){
    if(await lineupLocked()) fail('Kampene pågår. Oppstillingen er låst til alle kamper er ferdige.');
    await retry(()=>teamRef(i).update({lineup}));
  }
  async function setNumbers(ti, map){
    return withLease("market", 2500, async ()=>{
      const t=(await teamRef(ti).get()).data();
      if(t.owner!==uid) fail('Du styrer ikke dette laget.');
      for(const p of t.players){ if(Object.prototype.hasOwnProperty.call(map,p.id)){ const v=map[p.id]; if(v==null||v==='') delete p.no; else p.no=v; } }
      const seen=new Set();
      for(const p of t.players){ if(p.no==null) continue; if(!Number.isInteger(p.no)||p.no<1||p.no>99) fail('Draktnummer må være et tall fra 1 til 99.'); if(seen.has(p.no)) fail('Nummer '+p.no+' er allerede i bruk på laget.'); seen.add(p.no); }
      await retry(()=>teamRef(ti).update({players:t.players}));
    });
  }
  async function saveTraining(i, training){ await retry(()=>teamRef(i).update({training})); }
  async function renameTeam(i, name){
    const teams=await readAllTeams(); name=cleanName(name,teams,i);
    await retry(()=>teamRef(i).update({name, short:shortOf(name)}));
  }

  /* ----- marked ----- */
  async function readMarket(){ const s=await refs.market.get(); return s.exists ? clone(s.data()) : E.newMarketDoc(); }
  async function listPlayer(ti, pid, price){
    price=Math.round(price/1000)*1000; if(!(price>=5000)) fail('Prisen må være minst 5 000 kr.');
    return withLease("market", 2500, async ()=>{
      const t=(await teamRef(ti).get()).data(); const m=await readMarket();
      if(t.owner!==uid) fail('Du styrer ikke dette laget.');
      const p=t.players.find(x=>x.id===pid); if(!p) fail('Spilleren finnes ikke.');
      if(m.items.some(it=>it.id===pid)) fail('Spilleren er allerede til salgs.');
      if(t.players.length<=E.SQUAD_MIN) fail('Du må beholde minst '+E.SQUAD_MIN+' spillere.');
      p.lst=price; m.items.push({id:pid, price, from:ti, exp:m.w+2});
      await retry(()=>teamRef(ti).update({players:t.players}));
      await retry(()=>refs.market.set(m));
    });
  }
  async function unlistPlayer(ti, pid){
    return withLease("market", 2500, async ()=>{
      const t=(await teamRef(ti).get()).data(); const m=await readMarket();
      if(t.owner!==uid) fail('Du styrer ikke dette laget.');
      const p=t.players.find(x=>x.id===pid); if(p) delete p.lst;
      m.items=m.items.filter(it=>it.id!==pid);
      await retry(()=>teamRef(ti).update({players:t.players}));
      await retry(()=>refs.market.set(m));
    });
  }
  async function quickSell(ti, pid){
    return withLease("market", 2500, async ()=>{
      const t=(await teamRef(ti).get()).data(); const m=await readMarket();
      if(t.owner!==uid) fail('Du styrer ikke dette laget.');
      const p=t.players.find(x=>x.id===pid); if(!p) fail('Spilleren finnes ikke.');
      if(t.players.length<=E.SQUAD_MIN) fail('Du må beholde minst '+E.SQUAD_MIN+' spillere.');
      const price=Math.round(E.value(p)*0.45/1000)*1000;
      t.players=t.players.filter(x=>x.id!==pid); t.money+=price;
      m.items=m.items.filter(it=>it.id!==pid);
      E.addLog(m, `${t.name} solgte ${p.n} (${p.a} år) til klubbens speidere for ${E.fmtKr(price)}`, m.w);
      await retry(()=>teamRef(ti).update({players:t.players, money:t.money}));
      await retry(()=>refs.market.set(m));
      return price;
    });
  }
  async function buy(itemId, ti){
    return withLease("market", 3000, async ()=>{
      const m=await readMarket(); const it=m.items.find(x=>x.id===itemId);
      if(!it) fail('Spilleren er ikke lenger til salgs.');
      if(it.from===ti) fail('Du kan ikke kjøpe din egen spiller.');
      const b=(await teamRef(ti).get()).data();
      if(b.owner!==uid) fail('Du styrer ikke dette laget.');
      if(b.money<it.price) fail('Du har ikke råd. Du mangler '+E.fmtKr(it.price-b.money)+'.');
      if(b.players.length>=E.SQUAD_MAX) fail('Troppen er full (maks '+E.SQUAD_MAX+' spillere).');
      let p, seller=null;
      if(it.from>=0){
        seller=(await teamRef(it.from).get()).data();
        p=seller.players.find(x=>x.id===itemId);
        if(!p){ m.items=m.items.filter(x=>x.id!==itemId); await refs.market.set(m); fail('Spilleren er ikke lenger på laget.'); }
        seller.players=seller.players.filter(x=>x.id!==itemId); seller.money+=it.price;
      } else p=clone(it.pl);
      delete p.lst; delete p.no; p.gl=0;
      b.players.push(p); b.money-=it.price;
      m.items=m.items.filter(x=>x.id!==itemId);
      E.addLog(m, `${b.name} kjøpte ${p.n} (${p.a} år) for ${E.fmtKr(it.price)}${seller?` fra ${seller.name}`:''}`, m.w);
      await retry(()=>teamRef(ti).update({players:b.players, money:b.money}));
      if(seller) await retry(()=>teamRef(it.from).update({players:seller.players, money:seller.money}));
      await retry(()=>refs.market.set(m));
      return p;
    });
  }

  return { ensureInit, tick, tickFriendlies, challenge, approveFriendly, cancelFriendly, lineupLocked, claimTeam, releaseTeam, saveLineup, saveTraining, setNumbers, renameTeam, listPlayer, unlistPlayer, quickSell, buy, hid };
}

/* ===== Supabase-adapter: gir samme db-grensesnitt som spillet bruker (doc/collection/get/set/update/delete/acquire/onSnapshot) ===== */
function makeDb(sb){
  const clone = o => o===undefined?undefined:JSON.parse(JSON.stringify(o));
  const fail = (error) => { const e=new Error(error.message||'Databasefeil'); e.code = (/finnes ikke|not exist/i.test(error.message||''))?'invalid_argument':(error.code||'unavailable'); throw e; };
  const snapOf = (path, row) => ({ id:path.split('/').pop(), exists:!!row, data:()=>row?clone(row.data):undefined, metadata:{fromCache:false,hasPendingWrites:false} });
  const collOf = p => p.split('/')[0];
  let chan=0;
  function docRef(path){
    return {
      id:path.split('/').pop(), path,
      async get(){ const {data,error}=await sb.from('docs').select('path,data').eq('path',path).maybeSingle(); if(error) fail(error); return snapOf(path,data); },
      async set(v){ const {error}=await sb.from('docs').upsert({path,data:clone(v)}); if(error) fail(error); },
      async update(v){ const {error}=await sb.rpc('merge_doc',{p_path:path,p_data:clone(v)}); if(error) fail(error); },
      async delete(){ const {error}=await sb.from('docs').delete().eq('path',path); if(error) fail(error); },
      async acquire({holder,ttlMs}){ const {data,error}=await sb.rpc('acquire_lease',{p_name:path,p_holder:holder,p_ttl_ms:ttlMs||30000}); if(error) fail(error); return {acquired:data===true}; },
      onSnapshot(next,err){
        let alive=true, cur=undefined;
        const emit=row=>{ if(alive) next(snapOf(path,row)); };
        const load=async()=>{ try{ const {data,error}=await sb.from('docs').select('path,data').eq('path',path).maybeSingle(); if(error) throw error; cur=data; emit(data); }catch(e){ if(err&&alive) err(e); } };
        load();
        const ch=sb.channel('d'+(++chan)+'-'+path).on('postgres_changes',{event:'*',schema:'public',table:'docs',filter:'path=eq.'+path},p=>{
          if(p.eventType==='DELETE'){ emit(null); } else if(p.new&&p.new.data!==undefined){ emit({path,data:p.new.data}); } else load();
        }).subscribe(st=>{ if(st==='SUBSCRIBED') load(); });
        const poll=setInterval(load,30000);
        return ()=>{ alive=false; clearInterval(poll); sb.removeChannel(ch); };
      }
    };
  }
  function collRef(path, filters=[]){
    const c=collOf(path);
    const matches=row=>filters.every(([f,op,val])=>op==='=='?String(row.data[f])===String(val):true);
    const query=()=>{ let q=sb.from('docs').select('path,data').eq('coll',c); filters.forEach(([f,op,v])=>{ if(op==='==') q=q.eq('data->>'+f,String(v)); }); return q; };
    return {
      path, doc:id=>docRef(path+'/'+(id||Math.random().toString(36).slice(2))),
      where(f,op,v){ return collRef(path,filters.concat([[f,op,v]])); },
      async get(){ const {data,error}=await query(); if(error) fail(error); const docs=(data||[]).map(r=>snapOf(r.path,r)); return {docs,size:docs.length,empty:!docs.length}; },
      onSnapshot(next,err){
        let alive=true; const rows=new Map();
        const emit=()=>{ if(alive) next({docs:[...rows.values()].map(r=>snapOf(r.path,r)),metadata:{fromCache:false},docChanges:()=>[]}); };
        const load=async()=>{ try{ const {data,error}=await query(); if(error) throw error; rows.clear(); (data||[]).forEach(r=>rows.set(r.path,r)); emit(); }catch(e){ if(err&&alive) err(e); } };
        load();
        const ch=sb.channel('c'+(++chan)+'-'+path).on('postgres_changes',{event:'*',schema:'public',table:'docs',filter:'coll=eq.'+c},p=>{
          if(p.eventType==='DELETE'){ const old=p.old&&p.old.path; if(old){ rows.delete(old); emit(); } return; }
          if(p.new&&p.new.data!==undefined){ const r={path:p.new.path,data:p.new.data}; if(matches(r)) rows.set(r.path,r); else rows.delete(r.path); emit(); } else load();
        }).subscribe(st=>{ if(st==='SUBSCRIBED') load(); });
        const poll=setInterval(load,30000);
        return ()=>{ alive=false; clearInterval(poll); sb.removeChannel(ch); };
      }
    };
  }
  return { doc:docRef, collection:p=>collRef(p) };
}

Deno.serve(async () => {
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const store = makeStore({ db: makeDb(sb), uid: 'server' });
    await store.ensureInit();
    const r = await store.tick();
    return new Response(JSON.stringify(r), { headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
});
