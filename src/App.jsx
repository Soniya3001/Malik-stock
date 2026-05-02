
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
{tab==="analyze"&&(
          <div>
            <div style={{background:"#060e1a",border:"1px solid #0a1c2c",borderRadius:10,padding:14,marginBottom:12}}>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <input value={symbol} onChange={function(e){setSymbol(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")doAnalyze();}}
                  placeholder="NSE symbol... (RELIANCE, TCS, HDFCBANK, INFY, SBIN)"
                  style={{flex:1,padding:"10px 13px",background:"#04090f",border:"1px solid #0c1e2e",borderRadius:7,color:"#b0c8d8",fontFamily:"inherit",fontSize:12}}/>
                <button onClick={function(){doAnalyze();}} disabled={loading} className="hov"
                  style={{padding:"10px 18px",background:loading?"#04090f":"#001e10",border:"1px solid "+(loading?"#0a1c2c":"#00e67640"),borderRadius:7,color:loading?"#1a4060":"#00e676",fontFamily:"inherit",fontSize:11,fontWeight:"bold",letterSpacing:2,cursor:loading?"not-allowed":"pointer",whiteSpace:"nowrap"}}>
                  {loading?"…":"▶ SCAN"}
                </button>
                <button onClick={addWatch} className="hov" style={{padding:"10px 13px",background:"#04090f",border:"1px solid #ff980030",borderRadius:7,color:"#ff9800",cursor:"pointer",fontSize:16}}>⭐</button>
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
                {["RELIANCE","TCS","HDFCBANK","SBIN","INFY","BAJFINANCE","TATAMOTORS","ITC","AXISBANK","WIPRO","BHARTIARTL","KOTAKBANK"].map(function(s){
                  return <button key={s} className="hov" onClick={function(){setSymbol(s);doAnalyze(s);}} style={{padding:"4px 9px",background:"#04090f",border:"1px solid #0c1e2e",borderRadius:20,color:"#234a66",fontSize:9,fontFamily:"inherit",letterSpacing:1}}>{s}</button>;
                })}
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <span style={{fontSize:9,color:"#4a7a9a"}}>STATUS:</span>
                <button className="hov" onClick={function(){setAlreadyIn("no");}} style={Object.assign({flex:1,padding:"8px",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:9,fontWeight:"bold",letterSpacing:1},alreadyIn==="no"?{border:"1px solid #4a9eff",background:"#4a9eff15",color:"#4a9eff"}:{border:"1px solid #0a1c2c",background:"#04090f",color:"#234a66"})}>📋 FRESH ENTRY</button>
                <button className="hov" onClick={function(){setAlreadyIn("yes");}} style={Object.assign({flex:1,padding:"8px",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:9,fontWeight:"bold",letterSpacing:1},alreadyIn==="yes"?{border:"1px solid #4a9eff",background:"#4a9eff15",color:"#4a9eff"}:{border:"1px solid #0a1c2c",background:"#04090f",color:"#234a66"})}>📌 ALREADY IN</button>
              </div>
              {alreadyIn==="yes"&&(
                <div style={{marginTop:8}}>
                  <input type="number" value={myEntry} onChange={function(e){setMyEntry(e.target.value);}} placeholder="Tumhara entry price e.g. 1195.00"
                    style={{width:"100%",padding:"8px 11px",background:"#04090f",border:"1px solid #ffd74030",borderRadius:6,color:"#ffd740",fontFamily:"inherit",fontSize:11,boxSizing:"border-box"}}/>
                  {myEntry&&stockData&&(
                    <div style={{marginTop:5,padding:"6px 10px",borderRadius:6,background:inPro?"#00e67612":"#ff174412",border:"1px solid "+(inPro?"#00e67630":"#ff174430")}}>
                      <span style={{fontSize:11,fontWeight:"bold",color:inPro?"#00e676":"#ff1744"}}>{(inPro?"✅ PROFIT":"⚠️ LOSS")+" ₹"+Math.abs(p-myNum).toFixed(2)+" ("+Math.abs(((p-myNum)/myNum)*100).toFixed(2)+"%)"}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {error&&(<div style={{padding:"11px 14px",background:"#ff174410",border:"1px solid #ff174428",borderRadius:8,color:"#ff7043",fontSize:11,marginBottom:12,lineHeight:1.7}}>⚠️ {error}<div style={{fontSize:9,color:"#ff704355",marginTop:4}}>💡 Try: RELIANCE · TCS · HDFCBANK · SBIN · INFY</div></div>)}

            {loading&&(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14,padding:"40px 0"}}><Spinner/><div style={{fontSize:10,color:"#4a9eff",letterSpacing:3,animation:"blink 1.2s ease infinite",textAlign:"center"}}>{loadMsg}</div></div>)}

            {stockData&&!loading&&(
              <div style={{background:"#060e1a",border:"1px solid #00e67628",borderRadius:10,padding:14,marginBottom:12,animation:"fadeUp .3s ease"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:12}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:9}}>
                      <span style={{fontSize:20,fontWeight:900,color:"#00e676"}}>{(stockData.symbolInput||"").toUpperCase()}</span>
                      <div style={{width:8,height:8,background:"#00e676",borderRadius:"50%",animation:stockData.isMarketOpen?"pulse 2s ease infinite":"none"}}/>
                      <span style={{fontSize:8,color:"#00e67688"}}>{stockData.isMarketOpen?"LIVE · TWELVE DATA":"LAST PRICE · TWELVE DATA"}</span>
                    </div>
                    <div style={{fontSize:9,color:"#1a5a3a",marginTop:2}}>{stockData.lastUpdated+" · "+stockData.exchange}</div>
                    <div style={{fontSize:8,color:stockData.isMarketOpen?"#00e676":"#ff9800",marginTop:2,fontWeight:"bold"}}>{stockData.isMarketOpen?"● Market Live":"● Market Closed — Last traded price"}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:30,fontWeight:900,color:"#d0e8e0",letterSpacing:-1}}>{"₹"+stockData.currentPrice.toLocaleString("en-IN")}</div>
                    <div style={{fontSize:13,color:stockData.dayChange>=0?"#00e676":"#ff1744",fontWeight:"bold"}}>{(stockData.dayChange>=0?"▲":"▼")+" ₹"+Math.abs(stockData.dayChange).toFixed(2)+" ("+Math.abs(stockData.dayChangePercent).toFixed(2)+"%)"}</div>
                    <div style={{fontSize:9,color:"#1a3a56",marginTop:2}}>{"H:₹"+stockData.dayHigh.toLocaleString("en-IN")+" · L:₹"+stockData.dayLow.toLocaleString("en-IN")}</div>
                  </div>
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#1a4060",marginBottom:3}}><span>52W Low: ₹{stockData.weekLow52.toLocaleString("en-IN")}</span><span>52W High: ₹{stockData.weekHigh52.toLocaleString("en-IN")}</span></div>
                  <div style={{height:5,background:"#0a1525",borderRadius:3,overflow:"hidden"}}><div style={{width:Math.max(3,Math.min(97,((stockData.currentPrice-stockData.weekLow52)/(stockData.weekHigh52-stockData.weekLow52))*100))+"%",height:"100%",background:"linear-gradient(90deg,#ff1744,#ffd740,#00e676)",borderRadius:3}}/></div>
                </div>
                {stockData.indicators&&(
                  <div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:6,marginBottom:10}}>
                      {[{label:"5 SMA",v:stockData.indicators.sma5,above:p>stockData.indicators.sma5},{label:"9 SMA",v:stockData.indicators.sma9,above:p>stockData.indicators.sma9},{label:"20 SMA",v:stockData.indicators.sma20,above:p>stockData.indicators.sma20},{label:"200 EMA",v:stockData.indicators.ema200,above:p>stockData.indicators.ema200},{label:"VWAP",v:stockData.indicators.vwap,above:p>stockData.indicators.vwap},{label:"BB UPPER",v:stockData.indicators.bbUpper,above:false},{label:"BB LOWER",v:stockData.indicators.bbLower,above:true},{label:"RSI(14)",v:stockData.indicators.rsi,above:(stockData.indicators.rsi||50)>50,raw:true}].filter(function(x){return x.v!=null;}).map(function(x){return <IndBox key={x.label} label={x.label} value={x.v} above={x.above} raw={x.raw}/>;})}</div>
                    <div style={{background:"#030810",borderRadius:8,padding:"10px 12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                        <span style={{fontSize:9,color:"#1a4060"}}>Volume vs 20-day Avg</span>
                        <span style={{fontSize:10,fontWeight:"bold",color:(stockData.indicators.volRatio||1)>=1.5?"#00e676":(stockData.indicators.volRatio||1)<0.4?"#4a9eff":"#ffd740"}}>{(stockData.indicators.volRatio||1).toFixed(2)}x — {(stockData.indicators.volRatio||1)>=3?"CLIMAX 🌋":(stockData.indicators.volRatio||1)>=1.5?"HIGH 🔥":(stockData.indicators.volRatio||1)<0.4?"DRY UP 🏜️":"NORMAL 📦"}</span>
                      </div>
                      <div style={{height:6,background:"#0a1525",borderRadius:3,overflow:"hidden",marginBottom:10}}><div style={{width:Math.min((stockData.indicators.volRatio||1)*33,100)+"%",height:"100%",background:"linear-gradient(90deg,#4a9eff,#00e676)",borderRadius:3,transition:"width 1s ease"}}/></div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                        {[{l:"OBV",c:stockData.indicators.obvTrend==="RISING"?"#00e676":stockData.indicators.obvTrend==="FALLING"?"#ff1744":"#ffd740",v:stockData.indicators.obvTrend||"—"},{l:"MFI",c:(stockData.indicators.mfi||50)>80?"#ff1744":(stockData.indicators.mfi||50)<20?"#00e676":"#ffd740",v:stockData.indicators.mfi?stockData.indicators.mfi.toFixed(0):"—"},{l:"AD Line",c:stockData.indicators.adTrend==="RISING"?"#00e676":stockData.indicators.adTrend==="FALLING"?"#ff1744":"#ffd740",v:stockData.indicators.adTrend||"—"},{l:"VSA",c:["NO_SUPPLY","STOPPING","DRY_UP"].includes(stockData.indicators.vsa)?"#00e676":["NO_DEMAND","CLIMAX"].includes(stockData.indicators.vsa)?"#ff1744":"#ffd740",v:stockData.indicators.vsa||"NORMAL"}].map(function(x){return <div key={x.l} style={{textAlign:"center",background:"#060e1a",borderRadius:6,padding:"6px 4px"}}><div style={{fontSize:7,color:"#1a4060"}}>{x.l}</div><div style={{fontSize:9,fontWeight:"bold",color:x.c,marginTop:2}}>{x.v}</div></div>;})}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {result&&!loading&&(
              <div style={{animation:"fadeUp .4s ease"}}>
                <div style={{background:"linear-gradient(150deg,#06141e,#030810)",border:"2px solid "+bias.bd,borderRadius:12,padding:16,marginBottom:10,position:"relative",overflow:"hidden"}}>
                  <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:"linear-gradient(90deg,"+bias.c+",transparent)"}}/>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:8}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
                        <span style={{fontSize:22,fontWeight:900,color:bias.c}}>{symbol.toUpperCase()}</span>
                        <span style={{fontSize:9,background:bias.bg,color:bias.c,padding:"3px 10px",borderRadius:20,border:"1px solid "+bias.bd,letterSpacing:2}}>{bias.e+" "+result.overallBias}</span>
                        <span style={{fontSize:9,color:"#2a5a7a",background:"#4a9eff12",padding:"2px 8px",borderRadius:10}}>{result.biasStrength}</span>
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{(result.rulesTriggered||[]).map(function(r,i){return <span key={i} style={{fontSize:8,color:"#00e676",background:"#00e67610",padding:"2px 7px",borderRadius:10,border:"1px solid #00e67620"}}>{r}</span>;})}</div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                      <span style={{fontSize:9,color:bias.c,fontWeight:"bold"}}>{result.trend+" · "+result.confidence+"% confidence"}</span>
                      <span style={{fontSize:8,color:"#1a4060",background:"#060e1a",padding:"2px 8px",borderRadius:10,border:"1px solid #0a1c2c"}}>{(AI_PROVIDERS.find(function(x){return x.id===aiProvider;})||AI_PROVIDERS[0]).icon+" "+(AI_PROVIDERS.find(function(x){return x.id===aiProvider;})||AI_PROVIDERS[0]).name}</span>
                    </div>
                  </div>
                  {result.summary&&(<div style={{padding:"10px 13px",background:"#ffffff06",borderRadius:8,fontSize:12,color:"#7aaabb",lineHeight:1.7,borderLeft:"3px solid "+bias.c}}>{result.summary}</div>)}
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  {alreadyIn==="no"?(
                    <div style={{background:"#060e1a",border:"1px solid "+bias.bd,borderRadius:10,padding:14}}>
                      <div style={{fontSize:8,color:bias.c,letterSpacing:3,marginBottom:8}}>{result.freshEntry&&result.freshEntry.action==="BUY"?"🟢 BUY SIGNAL":result.freshEntry&&result.freshEntry.action==="SELL"?"🔴 SHORT":"⛔ AVOID"}</div>
                      <div style={{fontSize:15,fontWeight:900,color:bias.c,marginBottom:8}}>{result.freshEntry?result.freshEntry.action:"WAIT"}</div>
                      <div style={{marginBottom:8}}><div style={{fontSize:8,color:"#1a4060",marginBottom:3}}>ENTRY ZONE</div><div style={{fontSize:16,fontWeight:900,color:"#ffd740"}}>{result.freshEntry?"₹"+Number(result.freshEntry.entryZone.from).toLocaleString("en-IN")+" — ₹"+Number(result.freshEntry.entryZone.to).toLocaleString("en-IN"):"—"}</div></div>
                      <div style={{fontSize:9,color:"#3a7a8a",lineHeight:1.6,marginBottom:6}}><span style={{color:"#ffd74088"}}>✅ Condition: </span>{result.freshEntry?result.freshEntry.entryCondition:""}</div>
                      <div style={{fontSize:9,color:"#3a7a8a",lineHeight:1.6,marginBottom:8}}>{result.freshEntry?result.freshEntry.entryReason:""}</div>
                      {result.freshEntry&&result.freshEntry.riskRewardRatio&&(<div style={{padding:"5px 9px",background:"#4a9eff12",borderRadius:6,border:"1px solid #4a9eff25",display:"inline-block"}}><span style={{fontSize:9,color:"#4a9eff"}}>R:R = {result.freshEntry.riskRewardRatio}</span></div>)}
                    </div>
                  ):(
                    <div style={{background:"#060e1a",border:"1px solid "+(result.alreadyIn&&result.alreadyIn.holdOrExit==="HOLD"?"#00e67635":"#ff174435"),borderRadius:10,padding:14}}>
                      <div style={{fontSize:8,color:result.alreadyIn&&result.alreadyIn.holdOrExit==="HOLD"?"#00e676":"#ff1744",letterSpacing:3,marginBottom:8}}>📌 TUMHARA TRADE</div>
                      <div style={{fontSize:14,fontWeight:900,color:result.alreadyIn&&result.alreadyIn.holdOrExit==="HOLD"?"#00e676":"#ff1744",marginBottom:8}}>{result.alreadyIn?result.alreadyIn.status:""}</div>
                      <div style={{fontSize:10,color:"#5a8a9a",lineHeight:1.7,marginBottom:10}}>{result.alreadyIn?result.alreadyIn.advice:""}</div>
                      <div style={{padding:"9px 11px",background:result.alreadyIn&&result.alreadyIn.holdOrExit==="HOLD"?"#00e67610":"#ff174410",borderRadius:7,border:"1px solid "+(result.alreadyIn&&result.alreadyIn.holdOrExit==="HOLD"?"#00e67630":"#ff174430")}}>
                        <div style={{fontSize:13,fontWeight:900,color:result.alreadyIn&&result.alreadyIn.holdOrExit==="HOLD"?"#00e676":"#ff1744"}}>{result.alreadyIn&&result.alreadyIn.holdOrExit==="HOLD"?"✅ HOLD KARO":"🚨 ABHI EXIT KAR"}</div>
                      </div>
                    </div>
                  )}
                  <div style={{background:"#060e1a",border:"1px solid #ff174430",borderRadius:10,padding:14}}>
                    <div style={{fontSize:8,color:"#ff1744",letterSpacing:3,marginBottom:8}}>🛑 STOP LOSS</div>
                    <div style={{fontSize:24,fontWeight:900,color:"#ff1744",marginBottom:4}}>{result.stopLoss&&result.stopLoss.price?"₹"+Number(result.stopLoss.price).toLocaleString("en-IN"):"—"}</div>
                    <div style={{fontSize:9,color:"#5a3a3a",marginBottom:8,lineHeight:1.5}}>{result.stopLoss?result.stopLoss.basis:""}</div>
                    <div style={{padding:"6px 9px",background:"#ff174412",borderRadius:6,fontSize:9,color:"#ff7043",marginBottom:6}}>{"🔴 "+(result.stopLoss?result.stopLoss.rule13:"")}</div>
                    {result.stopLoss&&result.stopLoss.atrSL&&(<div style={{padding:"5px 9px",background:"#ff980012",borderRadius:6,fontSize:9,color:"#ff9800"}}>{"📏 ATR SL: ₹"+Number(result.stopLoss.atrSL).toLocaleString("en-IN")+" · "+result.stopLoss.atrBasis}</div>)}
                    {alreadyIn==="yes"&&result.alreadyIn&&result.alreadyIn.exitToSaveLoss&&(
                      <div style={{marginTop:8,padding:"9px 11px",background:"#ff174418",borderRadius:7,border:"1px solid #ff174440"}}>
                        <div style={{fontSize:10,fontWeight:900,color:"#ff1744",marginBottom:3}}>🚨 LOSS BACHANE KE LIYE EXIT</div>
                        <div style={{fontSize:15,fontWeight:"bold",color:"#ff5252"}}>{result.alreadyIn.exitToSaveLoss.price?"₹"+Number(result.alreadyIn.exitToSaveLoss.price).toLocaleString("en-IN"):"—"}</div>
                        <div style={{fontSize:9,color:"#7a3a3a",marginTop:3,lineHeight:1.5}}>{result.alreadyIn.exitToSaveLoss.basis}</div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{background:"#060e1a",border:"1px solid #00e67625",borderRadius:10,padding:14,marginBottom:10}}>
                  <div style={{fontSize:8,color:"#00e676",letterSpacing:3,marginBottom:10}}>🎯 PROFIT TARGETS</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    {(result.targets||[]).map(function(t,i){
                      var tc=["#00e676","#4a9eff","#ff9800"][i]||"#00e676";
                      var pct=p>0?(((t.price-p)/p)*100).toFixed(1):"0";
                      return(<div key={i} style={{background:"#030810",borderRadius:9,padding:13,border:"1px solid "+tc+"25",position:"relative",overflow:"hidden"}}>
                        <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:tc}}/>
                        <div style={{fontSize:8,color:tc+"88",letterSpacing:1,marginBottom:4}}>{t.label}</div>
                        <div style={{fontSize:20,fontWeight:900,color:tc}}>{"₹"+Number(t.price).toLocaleString("en-IN")}</div>
                        <div style={{fontSize:10,color:tc+"88",marginTop:2}}>{"+"+pct+"%"}</div>
                        <div style={{fontSize:8,color:"#1a4060",marginTop:6,lineHeight:1.5}}>{t.basis}</div>
                        <div style={{marginTop:7,padding:"5px 8px",background:tc+"10",borderRadius:5}}><div style={{fontSize:8,color:tc}}>{t.action}</div></div>
                      </div>);
                    })}
                  </div>
                </div>

                {result.keyLevels&&(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:10}}>
                    {[{l:"S2",v:result.keyLevels.S2,c:"#00796b"},{l:"S1",v:result.keyLevels.S1,c:"#00e676"},{l:"R1",v:result.keyLevels.R1,c:"#ff5252"},{l:"R2",v:result.keyLevels.R2,c:"#b71c1c"}].map(function(x){
                      return(<div key={x.l} style={{background:"#060e1a",border:"1px solid "+x.c+"20",borderRadius:8,padding:"9px 10px",textAlign:"center"}}><div style={{fontSize:8,color:"#1a4060",letterSpacing:1}}>{x.l}</div><div style={{fontSize:14,fontWeight:900,color:x.c,marginTop:2}}>{x.v?"₹"+Number(x.v).toLocaleString("en-IN"):"—"}</div></div>);
                    })}
                  </div>
                )}

                {alreadyIn==="yes"&&result.alreadyIn&&result.alreadyIn.trailingSL&&(
                  <div style={{background:"#060e1a",border:"1px solid #ffd74030",borderRadius:10,padding:14,marginBottom:10}}>
                    <div style={{fontSize:8,color:"#ffd740",letterSpacing:3,marginBottom:10}}>📌 TRAILING SL — PROFIT PROTECT KARO</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:8}}>
                      <div style={{background:"#030810",borderRadius:8,padding:12}}>
                        <div style={{fontSize:8,color:"#ffd74088",marginBottom:3}}>TRAIL SL TO</div>
                        <div style={{fontSize:20,fontWeight:900,color:"#ffd740"}}>{result.alreadyIn.trailingSL.price?"₹"+Number(result.alreadyIn.trailingSL.price).toLocaleString("en-IN"):"—"}</div>
                        <div style={{fontSize:9,color:"#5a5030",marginTop:4,lineHeight:1.4}}>{result.alreadyIn.trailingSL.basis}</div>
                      </div>
                      <div style={{background:"#030810",borderRadius:8,padding:12}}>
                        <div style={{fontSize:8,color:"#ffd74088",marginBottom:3}}>KAISE TRAIL KARO</div>
                        <div style={{fontSize:10,color:"#9a8848",lineHeight:1.6}}>{result.alreadyIn.trailingSL.action}</div>
                        {result.alreadyIn.profitProtection&&(<div style={{marginTop:7,padding:"5px 8px",background:"#ffd74010",borderRadius:5,fontSize:9,color:"#ffd740"}}>{"🔒 "+result.alreadyIn.profitProtection.action}</div>)}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{background:"#060e1a",border:"1px solid #0a1c2c",borderRadius:10,padding:14}}>
                  <div style={{fontSize:8,color:"#4a9eff",letterSpacing:3,marginBottom:10}}>{"🔱 SAARE "+(result.signals||[]).length+" SIGNALS — 20 NK AMRITWANI + 8 VOLUME"}</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:7}}>
                    {(result.signals||[]).map(function(sig,i){
                      var sc=gs(sig.signal);
                      return(<div key={i} style={{background:sc.c+"0a",border:"1px solid "+sc.c+"25",borderRadius:8,padding:11}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                          <span style={{fontSize:10,fontWeight:"bold",color:"#8ab0c4"}}>{sig.icon||""} {sig.rule}</span>
                          <span style={{fontSize:9,color:sc.c,fontWeight:"bold",flexShrink:0,marginLeft:6}}>{sc.e+" "+sig.signal}</span>
                        </div>
                        <div style={{fontSize:9,color:"#3a6a7a",lineHeight:1.5,marginBottom:6}}>{sig.detail}</div>
                        <Bar v={sig.conf||60} color={sc.c}/>
                      </div>);
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
{tab==="watchlist"&&(
          <div>
            <div style={{fontSize:8,color:"#ff9800",letterSpacing:3,marginBottom:10}}>⭐ WATCHLIST — TAP KARKE ANALYZE KAR</div>
            {watchlist.length===0?(
              <div style={{textAlign:"center",padding:"50px 0",color:"#1a4060",fontSize:12}}>Koi stock nahi hai.<br/>Koi symbol search karo aur ⭐ dabao.</div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))",gap:9}}>
                {watchlist.map(function(item){
                  var c=cache[item.symbol]; var up=c&&c.dayChange>=0;
                  return(
                    <div key={item.symbol} onClick={function(){setTab("analyze");setSymbol(item.symbol);doAnalyze(item.symbol);}} onMouseEnter={function(e){e.currentTarget.style.borderColor="#4a9eff44";}} onMouseLeave={function(e){e.currentTarget.style.borderColor="#0a1c2c";}} style={{background:"#060e1a",border:"1px solid #0a1c2c",borderRadius:10,padding:13,cursor:"pointer",transition:"border-color .2s"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                        <div>
                          <div style={{fontSize:15,fontWeight:900,color:"#4a9eff"}}>{item.symbol}</div>
                          {c?(<div><div style={{fontSize:14,fontWeight:"bold",color:"#d0e8e0",marginTop:2}}>{"₹"+c.currentPrice.toLocaleString("en-IN")}</div><div style={{fontSize:10,color:up?"#00e676":"#ff1744"}}>{(up?"▲":"▼")+" "+Math.abs(c.dayChangePercent||0).toFixed(2)+"%"}</div></div>):<div style={{fontSize:9,color:"#1a4060",marginTop:4}}>Tap to load</div>}
                        </div>
                        <button className="hov" onClick={function(e){e.stopPropagation();removeWatch(item.symbol);}} style={{background:"none",border:"none",color:"#ff174466",fontSize:18,cursor:"pointer",padding:"0 4px"}}>✕</button>
                      </div>
                      <div style={{fontSize:8,color:"#4a9eff",letterSpacing:1}}>TAP TO ANALYZE →</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab==="history"&&(
          <div>
            <div style={{fontSize:8,color:"#4a9eff",letterSpacing:3,marginBottom:10}}>📋 ANALYSIS HISTORY — INDEXEDDB</div>
            {history.length===0?(
              <div style={{textAlign:"center",padding:"50px 0",color:"#1a4060",fontSize:12}}>Koi analysis nahi hui abhi.</div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {history.map(function(h,i){
                  var bc=gb(h.overallBias);
                  return(
                    <div key={i} onClick={function(){setTab("analyze");setSymbol(h.symbol);}} style={{background:"#060e1a",border:"1px solid "+bc.bd,borderRadius:10,padding:13,cursor:"pointer"}}>
                      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                            <span style={{fontSize:14,fontWeight:900,color:bc.c}}>{h.symbol}</span>
                            <span style={{fontSize:9,background:bc.bg,color:bc.c,padding:"2px 9px",borderRadius:10,border:"1px solid "+bc.bd}}>{bc.e+" "+h.overallBias}</span>
                          </div>
                          <div style={{fontSize:9,color:"#2a5a7a",marginBottom:4}}>{h.date+" · ₹"+Number(h.currentPrice).toLocaleString("en-IN")+" · "+h.confidence+"% conf"}</div>
                          {h.summary&&<div style={{fontSize:9,color:"#1a4060",lineHeight:1.5}}>{h.summary.slice(0,110)+"..."}</div>}
                        </div>
                        <div style={{textAlign:"right"}}>
                          {h.targets&&h.targets[0]&&<div style={{fontSize:11,color:"#00e676",fontWeight:"bold"}}>{"T1: ₹"+Number(h.targets[0].price).toLocaleString("en-IN")}</div>}
                          {h.stopLoss&&<div style={{fontSize:11,color:"#ff1744",fontWeight:"bold"}}>{"SL: ₹"+Number(h.stopLoss.price).toLocaleString("en-IN")}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab==="rules"&&(
          <div>
            <div style={{fontSize:8,color:"#e040fb",letterSpacing:3,marginBottom:10}}>➕ CUSTOM TECHNICAL RULES — APNE RULES ADD KARO</div>
            <div style={{fontSize:9,color:"#1a4060",marginBottom:12,padding:"8px 11px",background:"#060e1a",borderRadius:7,border:"1px solid #0a1c2c",lineHeight:1.7}}>
              Yahan apne khud ke technical rules add karo. Ye rules automatically analysis mein include honge.
            </div>
            <div id="custom-rule-form" style={{background:"#060e1a",border:"1px solid #e040fb30",borderRadius:10,padding:14,marginBottom:14}}>
              <div style={{fontSize:8,color:"#e040fb",letterSpacing:3,marginBottom:12}}>{editRuleId?"✏️ RULE EDIT KARO":"➕ NAYA RULE ADD KARO"}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <div style={{fontSize:8,color:"#1a4060",marginBottom:4}}>RULE NAME *</div>
                  <input value={newRule.name} onChange={function(e){setNewRule(function(r){return Object.assign({},r,{name:e.target.value});});}} placeholder="e.g. MACD Crossover, Supertrend..." style={{width:"100%",padding:"8px 10px",background:"#04090f",border:"1px solid #0c1e2e",borderRadius:6,color:"#b0c8d8",fontFamily:"inherit",fontSize:11,boxSizing:"border-box"}}/>
                </div>
                <div>
                  <div style={{fontSize:8,color:"#1a4060",marginBottom:4}}>ICON (emoji)</div>
                  <input value={newRule.icon} onChange={function(e){setNewRule(function(r){return Object.assign({},r,{icon:e.target.value});});}} placeholder="📌 🔥 ⭐ 💎 🎯" style={{width:"100%",padding:"8px 10px",background:"#04090f",border:"1px solid #0c1e2e",borderRadius:6,color:"#b0c8d8",fontFamily:"inherit",fontSize:16,boxSizing:"border-box"}}/>
                </div>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:8,color:"#1a4060",marginBottom:4}}>RULE DESCRIPTION *</div>
                <textarea value={newRule.description} onChange={function(e){setNewRule(function(r){return Object.assign({},r,{description:e.target.value});});}} placeholder="e.g. MACD line crosses above signal line on daily chart..." rows={2} style={{width:"100%",padding:"8px 10px",background:"#04090f",border:"1px solid #0c1e2e",borderRadius:6,color:"#b0c8d8",fontFamily:"inherit",fontSize:11,boxSizing:"border-box",resize:"vertical"}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                <div>
                  <div style={{fontSize:8,color:"#00e676",marginBottom:4}}>🟢 BULLISH CONDITION</div>
                  <textarea value={newRule.bullish} onChange={function(e){setNewRule(function(r){return Object.assign({},r,{bullish:e.target.value});});}} placeholder="e.g. MACD above signal + histogram positive" rows={2} style={{width:"100%",padding:"8px 10px",background:"#04090f",border:"1px solid #00e67620",borderRadius:6,color:"#b0c8d8",fontFamily:"inherit",fontSize:11,boxSizing:"border-box",resize:"vertical"}}/>
                </div>
                <div>
                  <div style={{fontSize:8,color:"#ff1744",marginBottom:4}}>🔴 BEARISH CONDITION</div>
                  <textarea value={newRule.bearish} onChange={function(e){setNewRule(function(r){return Object.assign({},r,{bearish:e.target.value});});}} placeholder="e.g. MACD below signal + histogram negative" rows={2} style={{width:"100%",padding:"8px 10px",background:"#04090f",border:"1px solid #ff174420",borderRadius:6,color:"#b0c8d8",fontFamily:"inherit",fontSize:11,boxSizing:"border-box",resize:"vertical"}}/>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="hov" onClick={async function(){
                  if(!newRule.name.trim()||!newRule.description.trim()){alert("Rule name aur description zaroori hai!");return;}
                  if(editRuleId){await dbPut("customRules",Object.assign({},newRule,{id:editRuleId}));}
                  else{await dbPut("customRules",Object.assign({},newRule,{createdAt:Date.now()}));}
                  var cr=await dbGetAll("customRules"); setCustomRules(cr||[]);
                  setNewRule({name:"",icon:"📌",description:"",bullish:"",bearish:""});
                  setEditRuleId(null);
                }} style={{flex:1,padding:"9px",background:editRuleId?"#1a1000":"#001e10",border:"1px solid "+(editRuleId?"#ffd74040":"#00e67640"),borderRadius:7,color:editRuleId?"#ffd740":"#00e676",fontFamily:"inherit",fontSize:10,fontWeight:"bold",cursor:"pointer"}}>
                  {editRuleId?"✏️ UPDATE RULE":"➕ RULE ADD KARO"}
                </button>
                {editRuleId&&(<button className="hov" onClick={function(){setNewRule({name:"",icon:"📌",description:"",bullish:"",bearish:""});setEditRuleId(null);}} style={{padding:"9px 14px",background:"#1a0808",border:"1px solid #ff174430",borderRadius:7,color:"#ff7043",fontFamily:"inherit",fontSize:10,fontWeight:"bold",cursor:"pointer"}}>❌ CANCEL</button>)}
              </div>
            </div>

            {customRules.length===0?(
              <div style={{textAlign:"center",padding:"30px 0",color:"#1a4060",fontSize:11}}>Koi custom rule nahi hai abhi.<br/>Upar form se apna pehla rule add karo!</div>
            ):(
              <div>
                <div style={{fontSize:8,color:"#4a9eff",letterSpacing:3,marginBottom:8}}>{"SAVED RULES ("+customRules.length+") — YE SAARE ANALYSIS MEIN APPLY HONGE"}</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {customRules.map(function(rule){
                    return(
                      <div key={rule.id} style={{background:"#060e1a",border:"1px solid #e040fb25",borderRadius:9,padding:13}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:20}}>{rule.icon||"📌"}</span>
                            <div>
                              <div style={{fontSize:12,fontWeight:900,color:"#e040fb"}}>{rule.name}</div>
                              <div style={{fontSize:9,color:"#1a4060",marginTop:1}}>Custom Rule · IndexedDB</div>
                            </div>
                          </div>
                          <div style={{display:"flex",gap:6}}>
                            <button className="hov" onClick={function(){setNewRule({name:rule.name,icon:rule.icon||"📌",description:rule.description,bullish:rule.bullish,bearish:rule.bearish});setEditRuleId(rule.id);window.scrollTo(0,0);}} style={{padding:"5px 10px",background:"#1a1000",border:"1px solid #ffd74030",borderRadius:6,color:"#ffd740",fontFamily:"inherit",fontSize:9,cursor:"pointer"}}>✏️ EDIT</button>
                            <button className="hov" onClick={async function(){if(window.confirm(rule.name+" delete karna chahte ho?")){await dbDelete("customRules",rule.id);var cr=await dbGetAll("customRules");setCustomRules(cr||[]);}}} style={{padding:"5px 10px",background:"#1a0808",border:"1px solid #ff174030",borderRadius:6,color:"#ff7043",fontFamily:"inherit",fontSize:9,cursor:"pointer"}}>🗑️ DELETE</button>
                          </div>
                        </div>
                        <div style={{fontSize:9,color:"#5a7a8a",lineHeight:1.6,marginBottom:6}}>{rule.description}</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                          <div style={{padding:"6px 9px",background:"#00e67608",borderRadius:6,border:"1px solid #00e67618"}}><div style={{fontSize:7,color:"#00e67688",marginBottom:2}}>🟢 BULLISH</div><div style={{fontSize:9,color:"#3a7a4a",lineHeight:1.4}}>{rule.bullish||"—"}</div></div>
                          <div style={{padding:"6px 9px",background:"#ff174408",borderRadius:6,border:"1px solid #ff174418"}}><div style={{fontSize:7,color:"#ff174488",marginBottom:2}}>🔴 BEARISH</div><div style={{fontSize:9,color:"#7a3a3a",lineHeight:1.4}}>{rule.bearish||"—"}</div></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{marginTop:10,padding:"8px 11px",background:"#4a9eff08",borderRadius:7,border:"1px solid #4a9eff20",fontSize:9,color:"#2a5a7a",lineHeight:1.6}}>
                  💡 Ye sab {customRules.length} custom rule(s) automatically har analysis mein apply honge.
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{marginTop:16,padding:"8px 11px",background:"#ff980008",border:"1px solid #ff980018",borderRadius:6,fontSize:8,color:"#5a3814",textAlign:"center",letterSpacing:1}}>
          ⚠️ TWELVE DATA FREE: 800 CALLS/DAY · 20 NK AMRITWANI + 8 VOLUME + CUSTOM RULES · EDUCATIONAL ONLY · NOT FINANCIAL ADVICE
        </div>
      </div>
    </div>
  );
}
