
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
