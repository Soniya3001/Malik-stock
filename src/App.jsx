
import { useState, useEffect, useRef } from "react";

function openDB() {
  return new Promise(function(res, rej) {
    var r = indexedDB.open("NKTradeDB", 3);
    r.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains("settings"))
        db.createObjectStore("settings", { keyPath: "key" });
      if (!db.objectStoreNames.contains("watchlist"))
        db.createObjectStore("watchlist", { keyPath: "symbol" });
      if (!db.objectStoreNames.contains("analyses"))
        db.createObjectStore("analyses", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("cache"))
        db.createObjectStore("cache", { keyPath: "symbol" });
      if (!db.objectStoreNames.contains("customRules"))
        db.createObjectStore("customRules", { keyPath: "id", autoIncrement: true });
    };
    r.onsuccess = function(e) { res(e.target.result); };
    r.onerror   = function(e) { rej(e.target.error); };
  });
}
function dbGet(store, key) {
  return openDB().then(function(db) {
    return new Promise(function(res, rej) {
      var r = db.transaction(store, "readonly").objectStore(store).get(key);
      r.onsuccess = function() { res(r.result); };
      r.onerror   = function() { rej(r.error); };
    });
  });
}
function dbPut(store, val) {
  return openDB().then(function(db) {
    return new Promise(function(res, rej) {
      var r = db.transaction(store, "readwrite").objectStore(store).put(val);
      r.onsuccess = function() { res(r.result); };
      r.onerror   = function() { rej(r.error); };
    });
  });
}
function dbGetAll(store) {
  return openDB().then(function(db) {
    return new Promise(function(res, rej) {
      var r = db.transaction(store, "readonly").objectStore(store).getAll();
      r.onsuccess = function() { res(r.result); };
      r.onerror   = function() { rej(r.error); };
    });
  });
}
function dbDelete(store, key) {
  return openDB().then(function(db) {
    return new Promise(function(res, rej) {
      var r = db.transaction(store, "readwrite").objectStore(store).delete(key);
      r.onsuccess = function() { res(); };
      r.onerror   = function() { rej(r.error); };
    });
  });
}

function getMarketStatus() {
  var now  = new Date();
  var ist  = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  var day  = ist.getDay();
  var mins = ist.getHours() * 60 + ist.getMinutes();
  var OPEN  = 9  * 60 + 15;
  var CLOSE = 15 * 60 + 30;
  if (day === 0 || day === 6)
    return { open: false, label: "Weekend — Market Closed", color: "#ff1744", next: "Monday 9:15 AM IST" };
  if (mins >= OPEN && mins < CLOSE) {
    var left = CLOSE - mins;
    return { open: true, label: "Market LIVE", color: "#00e676", timeLeft: Math.floor(left/60) + "h " + (left%60) + "m left" };
  }
  if (mins < OPEN)
    return { open: false, label: "Pre-Open", color: "#ff9800", next: "Opens at 9:15 AM IST today" };
  return { open: false, label: "Market Closed", color: "#ff1744", next: "Tomorrow 9:15 AM IST" };
}

var TD = "https://api.twelvedata.com";
var SYM_MAP = {
  "RELIANCE":"RELIANCE:NSE","TCS":"TCS:NSE","HDFCBANK":"HDFCBANK:NSE",
  "ICICIBANK":"ICICIBANK:NSE","INFY":"INFY:NSE","INFOSYS":"INFY:NSE",
  "SBIN":"SBIN:NSE","BAJFINANCE":"BAJFINANCE:NSE","TATAMOTORS":"TATAMOTORS:NSE",
  "AXISBANK":"AXISBANK:NSE","WIPRO":"WIPRO:NSE","ITC":"ITC:NSE",
  "BHARTIARTL":"BHARTIARTL:NSE","HCLTECH":"HCLTECH:NSE","MARUTI":"MARUTI:NSE",
  "SUNPHARMA":"SUNPHARMA:NSE","TITAN":"TITAN:NSE","KOTAKBANK":"KOTAKBANK:NSE",
  "HINDUNILVR":"HINDUNILVR:NSE","ADANIENT":"ADANIENT:NSE","TATASTEEL":"TATASTEEL:NSE",
  "DRREDDY":"DRREDDY:NSE","CIPLA":"CIPLA:NSE","NTPC":"NTPC:NSE",
  "ONGC":"ONGC:NSE","COALINDIA":"COALINDIA:NSE","TECHM":"TECHM:NSE",
  "ULTRACEMCO":"ULTRACEMCO:NSE","INDUSINDBK":"INDUSINDBK:NSE",
  "BAJAJ-AUTO":"BAJAJ-AUTO:NSE","EICHERMOT":"EICHERMOT:NSE",
  "HEROMOTOCO":"HEROMOTOCO:NSE","DIVISLAB":"DIVISLAB:NSE",
  "JSWSTEEL":"JSWSTEEL:NSE","HINDALCO":"HINDALCO:NSE",
  "POWERGRID":"POWERGRID:NSE","TATAPOWER":"TATAPOWER:NSE",
  "ZOMATO":"ZOMATO:NSE","PAYTM":"PAYTM:NSE",
  "NIFTY":"NIFTY:NSX","NIFTY 50":"NIFTY:NSX",
  "SENSEX":"SENSEX:BSX","BANKNIFTY":"BANKNIFTY:NSX",
};
function toTD(s) {
  var u = s.trim().toUpperCase();
  return SYM_MAP[u] || (u.includes(":") ? u : u + ":NSE");
}
async function tdCall(endpoint, params, apiKey) {
  var qs  = new URLSearchParams(Object.assign({}, params, { apikey: apiKey }));
  var url = TD + endpoint + "?" + qs.toString();
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " from Twelve Data");
  var d = await res.json();
  if (d.code === 401 || (d.status === "error" && d.message && d.message.includes("apikey")))
    throw new Error("Invalid API key. Get free key at twelvedata.com");
  if (d.code === 429) throw new Error("Rate limit hit. Wait 1 minute.");
  if (d.status === "error") throw new Error("Twelve Data: " + (d.message || "Unknown error"));
  return d;
}
async function fetchQuote(sym, apiKey) {
  var tdSym = toTD(sym);
  var d = await tdCall("/quote", { symbol: tdSym }, apiKey);
  if (!d.close && !d.price) throw new Error("No data for '" + sym + "'. Try: RELIANCE, TCS, HDFCBANK");
  var price = parseFloat(d.close || d.price);
  var prev  = parseFloat(d.previous_close || price);
  return {
    symbol: (d.symbol || tdSym).split(":")[0], symbolInput: sym,
    exchange: d.exchange || "NSE", name: d.name || sym,
    currentPrice: price, previousClose: prev,
    dayChange: parseFloat(d.change) || parseFloat((price-prev).toFixed(2)),
    dayChangePercent: parseFloat(d.percent_change) || parseFloat((((price-prev)/prev)*100).toFixed(2)),
    dayHigh: parseFloat(d.high || price), dayLow: parseFloat(d.low || price),
    volume: parseInt(d.volume || 0),
    weekHigh52: d.fifty_two_week ? parseFloat(d.fifty_two_week.high) : parseFloat((price*1.3).toFixed(2)),
    weekLow52:  d.fifty_two_week ? parseFloat(d.fifty_two_week.low)  : parseFloat((price*0.7).toFixed(2)),
    lastUpdated: d.datetime || new Date().toLocaleDateString("en-IN"),
    isMarketOpen: getMarketStatus().open,
  };
}
async function fetchHistory(sym, apiKey) {
  var d = await tdCall("/time_series", { symbol: toTD(sym), interval: "1day", outputsize: 220, order: "ASC" }, apiKey);
  if (!d.values || d.values.length === 0) return [];
  return d.values.map(function(v) {
    return { date: v.datetime, open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close), volume: parseInt(v.volume || 0) };
  });
}
function calcSMA(closes, n) {
  if (!closes || closes.length < n) return null;
  return closes.slice(-n).reduce(function(a,b){return a+b;},0) / n;
}
function calcEMA(closes, n) {
  if (!closes || closes.length < n) return null;
  var k = 2/(n+1);
  var e = closes.slice(0,n).reduce(function(a,b){return a+b;},0)/n;
  for (var i=n;i<closes.length;i++) e = closes[i]*k + e*(1-k);
  return e;
}
function calcRSI(closes, n) {
  n = n || 14;
  if (!closes || closes.length < n+1) return null;
  var sl = closes.slice(-(n+1)); var g=0, l=0;
  for (var i=1;i<sl.length;i++) { var d=sl[i]-sl[i-1]; if(d>0) g+=d; else l-=d; }
  if (l===0) return 100;
  return 100 - 100/(1+g/n/(l/n));
}
function calcBB(closes, n) {
  n = n || 20;
  if (!closes || closes.length < n) return null;
  var sl = closes.slice(-n);
  var mean = sl.reduce(function(a,b){return a+b;},0)/n;
  var std = Math.sqrt(sl.reduce(function(a,b){return a+(b-mean)*(b-mean);},0)/n);
  return { upper: mean+2*std, lower: mean-2*std, mid: mean };
}
function calcOBV(bars) {
  if (!bars || bars.length < 2) return { trend:"FLAT" };
  var o = 0, vals = [0];
  for (var i=1;i<bars.length;i++) {
    if (bars[i].close > bars[i-1].close) o += bars[i].volume;
    else if (bars[i].close < bars[i-1].close) o -= bars[i].volume;
    vals.push(o);
  }
  var last = vals.slice(-5);
  return { value: o, trend: last[last.length-1]>last[0]?"RISING":last[last.length-1]<last[0]?"FALLING":"FLAT" };
}
function calcMFI(bars, n) {
  n = n || 14;
  if (!bars || bars.length < n+1) return null;
  var sl = bars.slice(-(n+1)); var pos=0, neg=0;
  for (var i=1;i<sl.length;i++) {
    var tp=(sl[i].high+sl[i].low+sl[i].close)/3;
    var tp0=(sl[i-1].high+sl[i-1].low+sl[i-1].close)/3;
    var mf=tp*sl[i].volume;
    if(tp>tp0) pos+=mf; else neg+=mf;
  }
  if (neg===0) return 100;
  return 100 - 100/(1+pos/neg);
}
function calcAD(bars) {
  if (!bars || bars.length < 2) return { trend:"FLAT" };
  var ad=0, vals=[];
  for (var i=0;i<bars.length;i++) {
    var b=bars[i], rng=b.high-b.low;
    if (rng>0) ad += ((b.close-b.low)-(b.high-b.close))/rng*b.volume;
    vals.push(ad);
  }
  var last = vals.slice(-5);
  return { trend: last[last.length-1]>last[0]?"RISING":last[last.length-1]<last[0]?"FALLING":"FLAT" };
}
function calcVolRatio(bars, n) {
  n = n || 20;
  if (!bars || bars.length < n) return 1;
  var avg = bars.slice(-n).reduce(function(a,b){return a+b.volume;},0)/n;
  return avg===0 ? 1 : bars[bars.length-1].volume/avg;
}
function calcVSA(bars) {
  if (!bars || bars.length < 11) return "NORMAL";
  var last=bars[bars.length-1];
  var avgRng=bars.slice(-10).reduce(function(a,b){return a+(b.high-b.low);},0)/10;
  var avgVol=bars.slice(-20).reduce(function(a,b){return a+b.volume;},0)/20;
  var narrow=(last.high-last.low)<avgRng*0.6;
  var lowVol=last.volume<avgVol*0.7;
  var highVol=last.volume>avgVol*1.5;
  var isUp=last.close>last.open;
  if(last.volume>avgVol*3) return "CLIMAX";
  if(calcVolRatio(bars)<0.4) return "DRY_UP";
  if(narrow&&lowVol&&isUp) return "NO_DEMAND";
  if(narrow&&lowVol&&!isUp) return "NO_SUPPLY";
  if(highVol&&!isUp&&last.close>(last.high+last.low)/2) return "STOPPING";
  return "NORMAL";
}
function calcPivots(bars) {
  if (!bars || bars.length < 20) return {};
  var h20=Math.max.apply(null,bars.slice(-20).map(function(b){return b.high;}));
  var l20=Math.min.apply(null,bars.slice(-20).map(function(b){return b.low;}));
  var last=bars[bars.length-1].close; var P=(h20+l20+last)/3;
  return { R1:Math.round(2*P-l20), R2:Math.round(P+(h20-l20)), R3:Math.round(h20+2*(P-l20)), S1:Math.round(2*P-h20), S2:Math.round(P-(h20-l20)), S3:Math.round(l20-2*(h20-P)) };
}
function buildIndicators(bars, price) {
  var closes=bars.map(function(b){return b.close;});
  var bb=calcBB(closes,20); var obv=calcOBV(bars); var ad=calcAD(bars);
  var mfi=calcMFI(bars,14); var vr=calcVolRatio(bars,20); var vsa=calcVSA(bars);
  var pvt=calcPivots(bars); var vwap=(bars[bars.length-1].high+bars[bars.length-1].low+price)/3;
  return {
    sma5:Math.round(calcSMA(closes,5)||price*0.992), sma9:Math.round(calcSMA(closes,9)||price*0.985),
    sma20:Math.round(calcSMA(closes,20)||price*0.972), ema200:Math.round(calcEMA(closes,200)||price*0.88),
    vwap:Math.round(vwap), bbUpper:bb?Math.round(bb.upper):Math.round(price*1.028),
    bbLower:bb?Math.round(bb.lower):Math.round(price*0.965), bbMid:bb?Math.round(bb.mid):Math.round(price*0.998),
    rsi:calcRSI(closes,14)?parseFloat(calcRSI(closes,14).toFixed(1)):null,
    obvTrend:obv.trend, adTrend:ad.trend, mfi:mfi?parseFloat(mfi.toFixed(1)):null,
    volRatio:parseFloat(vr.toFixed(2)), vsa:vsa, ...pvt,
  };
}
export default function App() {
  var [tdKey,setTdKey]=useState("");
  var [aiKey,setAiKey]=useState("");
  var [aiProvider,setAiProvider]=useState("gemini");
  var [tdSaved,setTdSaved]=useState(false);
  var [aiSaved,setAiSaved]=useState(false);
  var [editTd,setEditTd]=useState(false);
  var [editAi,setEditAi]=useState(false);
  var [symbol,setSymbol]=useState("");
  var [alreadyIn,setAlreadyIn]=useState("no");
  var [myEntry,setMyEntry]=useState("");
  var [loading,setLoading]=useState(false);
  var [loadMsg,setLoadMsg]=useState("");
  var [stockData,setStockData]=useState(null);
  var [result,setResult]=useState(null);
  var [error,setError]=useState("");
  var [tab,setTab]=useState("analyze");
  var [watchlist,setWatchlist]=useState([]);
  var [history,setHistory]=useState([]);
  var [cache,setCache]=useState({});
  var [mkt,setMkt]=useState(getMarketStatus());
  var [autoRef,setAutoRef]=useState(false);
  var [refCount,setRefCount]=useState(60);
  var [customRules,setCustomRules]=useState([]);
  var [newRule,setNewRule]=useState({name:"",icon:"📌",description:"",bullish:"",bearish:""});
  var [editRuleId,setEditRuleId]=useState(null);
  var autoRefRef=useRef(autoRef);
  autoRefRef.current=autoRef;

  useEffect(function(){
    (async function(){
      try{
        var k1=await dbGet("settings","tdKey"); if(k1&&k1.value){setTdKey(k1.value);setTdSaved(true);}
        var k2=await dbGet("settings","aiKey"); if(k2&&k2.value){setAiKey(k2.value);setAiSaved(true);}
        var k3=await dbGet("settings","aiProvider"); if(k3&&k3.value){setAiProvider(k3.value);}
        var wl=await dbGetAll("watchlist"); setWatchlist(wl||[]);
        var hi=await dbGetAll("analyses"); setHistory((hi||[]).reverse().slice(0,20));
        var cr=await dbGetAll("customRules"); setCustomRules(cr||[]);
        var pc=await dbGetAll("cache"); var m={};
        (pc||[]).forEach(function(x){m[x.symbol]=x;}); setCache(m);
      }catch(e){console.warn(e);}
    })();
    var t=setInterval(function(){setMkt(getMarketStatus());},30000);
    return function(){clearInterval(t);};
  },[]);

  useEffect(function(){
    if(!autoRef||!mkt.open||!symbol||loading) return;
    setRefCount(60);
    var id=setInterval(function(){
      setRefCount(function(n){
        if(n<=1){clearInterval(id);if(autoRefRef.current)doAnalyze(symbol);return 60;}
        return n-1;
      });
    },1000);
    return function(){clearInterval(id);};
  },[autoRef,mkt.open,stockData]);

  async function saveTdKey(){
    if(!tdKey.trim())return;
    await dbPut("settings",{key:"tdKey",value:tdKey.trim()});
    setTdSaved(true);setEditTd(false);setError("");
  }
  async function saveAiKey(){
    if(!aiKey.trim())return;
    await dbPut("settings",{key:"aiKey",value:aiKey.trim()});
    await dbPut("settings",{key:"aiProvider",value:aiProvider});
    setAiSaved(true);setEditAi(false);setError("");
  }

  async function doAnalyze(sym){
    var s=(sym||symbol).trim();
    if(!s){setError("Stock symbol daalo");return;}
    if(!tdKey){setError("Twelve Data API key save karo");return;}
    if(!aiKey){setError("AI API key save karo");return;}
    setError("");setStockData(null);setResult(null);setLoading(true);
    try{
      setLoadMsg("📡 Live price fetch ho raha hai...");
      var quote=await fetchQuote(s,tdKey);
      await dbPut("cache",Object.assign({symbol:s.toUpperCase(),cachedAt:Date.now()},quote));
      setCache(function(prev){var n=Object.assign({},prev);n[s.toUpperCase()]=Object.assign({cachedAt:Date.now()},quote);return n;});
      setLoadMsg("📊 200 din ka data le raha hai...");
      var bars=await fetchHistory(s,tdKey);
      setLoadMsg("🔢 Indicators calculate ho rahe hain...");
      var ind=bars.length>0?buildIndicators(bars,quote.currentPrice):{};
      var full=Object.assign({},quote,{indicators:ind});
      setStockData(full);
      var provName=(AI_PROVIDERS.find(function(x){return x.id===aiProvider;})||AI_PROVIDERS[0]).name;
      setLoadMsg("🔱 "+provName+" se 28 rules apply ho rahe hain...");
      var analysis=await runAnalysis(full,alreadyIn,myEntry,aiProvider,aiKey,customRules);
      setResult(analysis);
      await dbPut("analyses",{symbol:s.toUpperCase(),timestamp:Date.now(),date:new Date().toLocaleDateString("en-IN"),currentPrice:quote.currentPrice,overallBias:analysis.overallBias,confidence:analysis.confidence,targets:analysis.targets,stopLoss:analysis.stopLoss,summary:analysis.summary,indicators:ind});
      var hi=await dbGetAll("analyses"); setHistory((hi||[]).reverse().slice(0,20));
    }catch(e){setError(e.message||"Analysis fail hui. Dobara try karo.");}
    setLoading(false);setLoadMsg("");
  }

  async function addWatch(){
    if(!symbol.trim())return;
    await dbPut("watchlist",{symbol:symbol.toUpperCase(),addedAt:Date.now()});
    setWatchlist(await dbGetAll("watchlist")||[]);
  }
  async function removeWatch(sym){
    await dbDelete("watchlist",sym);
    setWatchlist(await dbGetAll("watchlist")||[]);
  }

  var bias=result?gb(result.overallBias):null;
  var p=stockData?stockData.currentPrice:0;
  var myNum=Number(myEntry)||0;
  var inPro=myNum>0&&p>=myNum;
  function tabSt(a){return{flex:1,padding:"9px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:"bold",letterSpacing:1,border:a?"1px solid #4a9eff":"1px solid #0a1c2c",background:a?"#4a9eff18":"#060e1a",color:a?"#4a9eff":"#234a66"};}
  function keyBox(label,val,setVal,saved,setSaved,edit,setEdit,storeKey,saveFn){
    return(<div style={{background:saved&&!edit?"#001e10":"#060e1a",border:"1px solid "+(saved&&!edit?"#00e67630":"#1a2e42"),borderRadius:9,padding:"11px 13px",marginBottom:10}}><div style={{fontSize:8,color:saved&&!edit?"#00e676":"#4a7a9a",letterSpacing:2,marginBottom:7}}>{"🔑 "+label+(saved&&!edit?" ✅ SAVED":"")}</div><div style={{display:"flex",gap:8}}><input type={saved&&!edit?"password":"text"} value={val} onChange={function(e){setVal(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")saveFn();}} placeholder={"Enter "+label+"..."} style={{flex:1,padding:"8px 10px",background:"#04090f",border:"1px solid "+(edit?"#ffd74040":"#0c1e2e"),borderRadius:6,color:"#b0c8d8",fontFamily:"inherit",fontSize:11}}/><button onClick={saveFn} className="hov" style={{padding:"8px 14px",background:saved&&!edit?"#001e10":"#0d2035",border:"1px solid "+(saved&&!edit?"#00e67640":"#4a9eff40"),borderRadius:6,color:saved&&!edit?"#00e676":"#4a9eff",fontFamily:"inherit",fontSize:10,fontWeight:"bold",cursor:"pointer",whiteSpace:"nowrap"}}>{saved&&!edit?"✅":"💾 SAVE"}</button>{saved&&(<button onClick={function(){setEdit(!edit);}} className="hov" style={{padding:"8px 11px",background:"#1a1000",border:"1px solid #ffd74035",borderRadius:6,color:"#ffd740",fontFamily:"inherit",fontSize:10,fontWeight:"bold",cursor:"pointer"}}>{edit?"❌":"✏️"}</button>)}</div></div>);
  }

  return (
    <div style={{minHeight:"100vh",background:"#030810",fontFamily:"'Courier New',monospace",color:"#a0bcd0"}}>
      <style>{`
        @keyframes spin0{to{transform:rotate(360deg)}}
        @keyframes spin1{to{transform:rotate(-360deg)}}
        @keyframes spin2{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes scan{0%{top:-1px}100%{top:101%}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 #00e67644}50%{box-shadow:0 0 0 8px #00e67600}}
        .hov:hover{opacity:.8;cursor:pointer;transition:opacity .15s}
        input:focus{outline:none!important;border-color:#4a9eff!important}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#1a2e42;border-radius:2px}
      `}</style>

      <div style={{background:"linear-gradient(180deg,#060f18,#030810)",borderBottom:"1px solid #0a1c2c",padding:"14px 14px 10px",textAlign:"center",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,#00e676,#4a9eff 50%,#ff9800)"}}/>
        <div style={{position:"absolute",left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,#4a9eff10,transparent)",animation:"scan 4s linear infinite",pointerEvents:"none"}}/>
        <div style={{fontSize:8,letterSpacing:6,color:"#164060",marginBottom:3}}>NK STOCK TALK · AMRITWANI LIVE TRADE ADVISOR</div>
        <h1 style={{margin:"0 0 5px",fontSize:22,fontWeight:900,letterSpacing:3,background:"linear-gradient(135deg,#00e676,#4a9eff 50%,#ff9800)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>LIVE TRADE ANALYZER</h1>
        <div style={{display:"flex",justifyContent:"center",gap:7,flexWrap:"wrap"}}>
          {[["TWELVE DATA LIVE","#00e676"],["20 NK AMRITWANI","#4a9eff"],["8 VOLUME SIGNALS","#ff9800"],["INDEXEDDB","#e040fb"]].map(function(x){return <span key={x[0]} style={{fontSize:8,color:x[1],background:x[1]+"12",padding:"2px 9px",borderRadius:10,border:"1px solid "+x[1]+"22",letterSpacing:1}}>{x[0]}</span>;})}
        </div>
      </div>

      <div style={{maxWidth:980,margin:"0 auto",padding:"13px 12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,padding:"9px 14px",background:"#060e1a",border:"1px solid "+mkt.color+"30",borderRadius:9}}>
          <div style={{width:9,height:9,borderRadius:"50%",background:mkt.color,flexShrink:0,animation:mkt.open?"pulse 2s ease infinite":"none"}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:10,fontWeight:"bold",color:mkt.color}}>{mkt.label}</div>
            <div style={{fontSize:8,color:mkt.color+"77",marginTop:1}}>{mkt.open?"NSE · 9:15 AM - 3:30 PM IST · "+mkt.timeLeft:"Next: "+mkt.next}</div>
          </div>
          {!mkt.open&&<div style={{fontSize:8,color:"#4a9eff",padding:"4px 10px",background:"#4a9eff12",borderRadius:6,border:"1px solid #4a9eff25",textAlign:"center"}}><div style={{fontWeight:"bold"}}>Closed</div><div style={{color:"#1a4060",marginTop:1}}>Last price show hogi</div></div>}
          {mkt.open&&stockData&&!loading&&(
            <div style={{display:"flex",gap:8}}>
              <button onClick={function(){setAutoRef(!autoRef);}} className="hov" style={{padding:"5px 10px",background:autoRef?"#001e10":"#060e1a",border:"1px solid "+(autoRef?"#00e67640":"#1a2e42"),borderRadius:6,color:autoRef?"#00e676":"#1a4060",fontFamily:"inherit",fontSize:9,fontWeight:"bold",cursor:"pointer"}}>{autoRef?"🔄 "+refCount+"s":"⏸ AUTO"}</button>
              <button onClick={function(){doAnalyze(symbol);}} className="hov" style={{padding:"5px 10px",background:"#001e10",border:"1px solid #00e67640",borderRadius:6,color:"#00e676",fontFamily:"inherit",fontSize:9,fontWeight:"bold",cursor:"pointer"}}>🔄 REFRESH</button>
            </div>
          )}
        </div>

        {keyBox("TWELVE DATA API KEY (twelvedata.com)",tdKey,setTdKey,tdSaved,setTdSaved,editTd,setEditTd,"tdKey",saveTdKey)}

        <div style={{background:"#060e1a",border:"1px solid #4a9eff25",borderRadius:10,padding:14,marginBottom:10}}>
          <div style={{fontSize:8,color:"#4a9eff",letterSpacing:3,marginBottom:12}}>🤖 AI PROVIDER CHOOSE KARO</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
            {AI_PROVIDERS.map(function(prov){
              var active=aiProvider===prov.id;
              return(<button key={prov.id} className="hov" onClick={function(){setAiProvider(prov.id);setAiSaved(false);setAiKey("");setEditAi(false);}} style={{padding:"10px 8px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",border:active?"2px solid "+prov.color:"1px solid #0a1c2c",background:active?prov.color+"15":"#030810",transition:"all .2s"}}>
                <div style={{fontSize:18,marginBottom:4}}>{prov.icon}</div>
                <div style={{fontSize:9,fontWeight:"bold",color:active?prov.color:"#4a6a7a",marginBottom:2}}>{prov.name}</div>
                <div style={{fontSize:8,color:active?prov.color+"88":"#1a4060"}}>{"✅ "+prov.free}</div>
              </button>);
            })}
          </div>
          {(function(){
            var prov=AI_PROVIDERS.find(function(x){return x.id===aiProvider;})||AI_PROVIDERS[0];
            return(<div>
              <div style={{fontSize:8,color:"#1a4060",marginBottom:8,padding:"6px 9px",background:"#030810",borderRadius:6,border:"1px solid #0a1c2c"}}>{"🔗 "+prov.keyLink+" → Sign Up → Get API Key · "}<span style={{color:"#00e676"}}>{prov.free+" FREE"}</span></div>
              <div style={{display:"flex",gap:8}}>
                <input type={aiSaved&&!editAi?"password":"text"} value={aiKey} onChange={function(e){setAiKey(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")saveAiKey();}} placeholder={prov.keyPlaceholder} style={{flex:1,padding:"8px 10px",background:"#04090f",border:"1px solid "+(editAi?"#ffd74040":"#0c1e2e"),borderRadius:6,color:"#b0c8d8",fontFamily:"inherit",fontSize:11}}/>
                <button onClick={saveAiKey} className="hov" style={{padding:"8px 14px",background:aiSaved&&!editAi?"#001e10":"#0d2035",border:"1px solid "+(aiSaved&&!editAi?"#00e67640":"#4a9eff40"),borderRadius:6,color:aiSaved&&!editAi?"#00e676":"#4a9eff",fontFamily:"inherit",fontSize:10,fontWeight:"bold",cursor:"pointer",whiteSpace:"nowrap"}}>{aiSaved&&!editAi?"✅ SAVED":"💾 SAVE"}</button>
                {aiSaved&&(<button onClick={function(){setEditAi(!editAi);}} className="hov" style={{padding:"8px 11px",background:"#1a1000",border:"1px solid #ffd74035",borderRadius:6,color:"#ffd740",fontFamily:"inherit",fontSize:10,fontWeight:"bold",cursor:"pointer"}}>{editAi?"❌":"✏️"}</button>)}
              </div>
              {aiSaved&&!editAi&&(<div style={{marginTop:7,display:"flex",alignItems:"center",gap:7}}><div style={{width:7,height:7,background:prov.color,borderRadius:"50%"}}/><span style={{fontSize:9,color:prov.color}}>{prov.label+" · "+prov.free}</span></div>)}
            </div>);
          })()}
        </div>

        <div style={{fontSize:8,color:"#1a4060",marginBottom:12,padding:"7px 10px",background:"#060e1a",borderRadius:7,border:"1px solid #0a1c2c"}}>
          💡 <span style={{color:"#4a9eff"}}>Twelve Data</span>: twelvedata.com (800 calls/day) · Switch AI kabhi bhi — sab free! 🎉
        </div>

        <div style={{display:"flex",gap:6,marginBottom:12}}>
          <button className="hov" onClick={function(){setTab("analyze");}} style={tabSt(tab==="analyze")}>🔍 ANALYZE</button>
          <button className="hov" onClick={function(){setTab("watchlist");}} style={tabSt(tab==="watchlist")}>⭐ WATCHLIST</button>
          <button className="hov" onClick={function(){setTab("history");}} style={tabSt(tab==="history")}>📋 HISTORY</button>
          <button className="hov" onClick={function(){setTab("rules");}} style={tabSt(tab==="rules")}>➕ RULES</button>
        </div>
