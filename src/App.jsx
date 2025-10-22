import React, { useEffect, useMemo, useState } from "react";

// Ultimate BUY/SELL Not Adviser — Centered, full-screen, responsive Web3 dark UI

const API =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&price_change_percentage=1h,24h,7d";

function fmtUSD(n){ if(!n&&n!==0)return"-"; return n<1?"$"+Number(n).toLocaleString(undefined,{minimumFractionDigits:4,maximumFractionDigits:6}):"$"+Number(n).toLocaleString(undefined,{maximumFractionDigits:2}); }
function pct(n){ if(!n&&n!==0)return"-"; const s=n>0?"+":""; return s+Number(n).toFixed(2)+"%"; }

export default function CryptoBuySellDashboard(){
  const [data,setData]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);
  const [decidedAt,setDecidedAt]=useState(null);
  const [copied,setCopied]=useState(false);
  const [pnl,setPnl]=useState({buy:null,sell:null}); // store 3h/6h/1d pnl

  // Fetch main market data
  async function load(){
    try{
      setLoading(true);setError(null);
      const res=await fetch(API,{cache:'no-store'});
      if(!res.ok)throw new Error('CoinGecko error '+res.status);
      const json=await res.json();
      setData(Array.isArray(json)?json:[]);
      setDecidedAt(new Date().toLocaleString());
    }catch(e){setError(String(e));}finally{setLoading(false);}
  }
  useEffect(()=>{load()},[]);

  const universe=useMemo(()=>{
    const stables=new Set(['usdt','usdc','busd','dai','tusd','usdp','frax']);
    return data.filter(c=>c.total_volume>10_000_000&&!stables.has((c.symbol||'').toLowerCase()));
  },[data]);

  const buySell=useMemo(()=>{
    if(!universe.length)return{buy:null,sell:null};
    const fresh=universe.filter(c=>(c.market_cap_rank&&c.market_cap_rank>200)||(c.market_cap<50_000_000&&Math.abs(c.price_change_percentage_24h||0)>20));
    const pool=universe.concat(fresh);
    const buy=[...pool].sort((a,b)=>(b.price_change_percentage_24h||0)-(a.price_change_percentage_24h||0))[0]||null;
    const sell=[...pool].sort((a,b)=>(a.price_change_percentage_24h||0)-(b.price_change_percentage_24h||0))[0]||null;
    return{buy,sell};
  },[universe]);

  // Fetch short-term market chart data for precise 3h / 6h PnL
  async function fetchPnL(coin, side){
    try{
      const id = coin.id;
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=1`);
      if(!res.ok) throw new Error('Market chart error');
      const json = await res.json();
      const prices = json.prices;
      const current = prices[prices.length-1][1];
      const threeHrsAgo = prices[Math.max(prices.length-4,0)][1];
      const sixHrsAgo = prices[Math.max(prices.length-7,0)][1];
      const pnl3h = ((current/threeHrsAgo)-1)*100;
      const pnl6h = ((current/sixHrsAgo)-1)*100;
      const pnl1d = coin.price_change_percentage_24h_in_currency;
      setPnl(prev=>({...prev,[side]:{pnl3h,pnl6h,pnl1d}}));
    }catch(e){console.error(e);}
  }

  // Whenever buy/sell changes, fetch their pnl
  useEffect(()=>{
    if(buySell.buy) fetchPnL(buySell.buy,'buy');
    if(buySell.sell) fetchPnL(buySell.sell,'sell');
  },[buySell.buy,buySell.sell]);

  function copy(text){
    navigator.clipboard?.writeText(text).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),1500); }).catch(()=>{});
  }

  const styles={
page:{
  fontFamily:'Inter,system-ui',
  background:'#0a0a0a',
  color:'#f9fafb',
  minHeight:'100vh',
  width:'100vw',
  display:'flex',
  justifyContent:'center',
  alignItems:'flex-start',
  padding:'4rem 1rem',
  overflowX:'hidden'
},

    container:{
      width:'100%',
      maxWidth:1200,
      display:'flex',
      flexDirection:'column',
      alignItems:'center',
      gap:'2.5rem',
    },
    card:{background:'#111',border:'1px solid #222',borderRadius:16,padding:'2rem',boxShadow:'0 0 25px rgba(255,255,255,0.03)',display:'flex',flexDirection:'column',gap:'1.25rem',alignItems:'flex-start',width:'100%'},
    header:{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%'},
    btn:{background:'#1f1f1f',color:'#fff',border:'1px solid #333',borderRadius:14,padding:'0.8rem 1.2rem',cursor:'pointer',fontWeight:700,letterSpacing:'.2px',transition:'all .2s ease',whiteSpace:'nowrap'},
    title:{fontSize:30,fontWeight:800,letterSpacing:'-0.02em',textAlign:'left'},
    sectionTitle:{fontSize:18,fontWeight:700,marginBottom:'0.25rem',textAlign:'left'},
    subtext:{fontSize:14,color:'#9ca3af',textAlign:'left',lineHeight:1.65},
    coinTitle:{fontWeight:700,fontSize:18,textAlign:'left'},
    coinPrice:{fontSize:24,fontWeight:800,textAlign:'left'},
    donation:{display:'flex',alignItems:'center',gap:10,marginTop:'0.5rem',width:'100%'},
    loveBtn:{background:'none',color:'#fff',padding:'0.6rem',border:'1px solid #333',borderRadius:10,cursor:'pointer',transition:'transform .1s ease'},
  };

  return(
  <div style={styles.page}>
    <style>{`
      *{box-sizing:border-box}
      html,body,#root{height:100%;margin:0;background:#0a0a0a;color:#f9fafb}
      .grid{display:grid;gap:2rem;width:100%}
      @media (max-width: 900px){.grid{grid-template-columns:1fr}}
      @media (min-width:901px){.grid{grid-template-columns:1fr 1fr}}
      button:focus{outline:2px solid #3b82f6;outline-offset:2px}
      .btn-dark:hover{background:#fff!important;color:#000!important}
    `}</style>

    <div style={styles.container}>
      <header style={styles.header}>
        <div style={{minWidth:0}}>
          <div style={styles.title}>Ultimate BUY/SELL Not Adviser</div>
        </div>
        <button className="btn-dark" onClick={load} style={styles.btn}>Update</button>
      </header>

      {decidedAt && (
  <div style={{ ...styles.subtext, width: "100%", textAlign: "left" }}>
    Last update: {decidedAt}
  </div>
)}

      {loading && <div style={styles.subtext}>Loading...</div>}
      {error && <div style={{color:'#f87171'}}>{error}</div>}

      {!loading&&!error&&(
        <div className="grid">
          <div style={styles.card}>
            <div style={styles.sectionTitle}>BUY</div>
            {buySell.buy?(
              <>
               <div style={{display:'flex',alignItems:'flex-start',gap:'1rem',width:'100%'}}>

                  <img src={buySell.buy.image} alt="coin" style={{width:48,height:48,borderRadius:999,flexShrink:0}}/>
                  <div style={{minWidth:0}}>
                    <div style={styles.coinTitle}>{buySell.buy.name} <span style={{color:'#9ca3af'}}>({(buySell.buy.symbol||'').toUpperCase()})</span></div>
                    <div style={styles.coinPrice}>{fmtUSD(buySell.buy.current_price)}</div>
                    {pnl.buy && (
                      <p style={styles.subtext}>
                        3h PnL {pct(pnl.buy.pnl3h)} | 6h PnL {pct(pnl.buy.pnl6h)} | 1d PnL {pct(pnl.buy.pnl1d)}
                      </p>
                    )}
                  </div>
                </div>
                <p style={styles.subtext}>Strong 24h momentum ({pct(buySell.buy.price_change_percentage_24h)}), solid liquidity ({fmtUSD(buySell.buy.total_volume)}). Accessible across networks like {Object.keys(buySell.buy.platforms||{}).join(', ')||'multiple chains'}. Buy on Binance, Coinbase, Kraken, or KuCoin. Momentum driven by social traction and growing trading demand.</p>
              </>
            ):<div style={styles.subtext}>No BUY candidate found.</div>}
          </div>

          <div style={styles.card}>
            <div style={styles.sectionTitle}>SELL</div>
            {buySell.sell?(
              <>
                <div style={{display:'flex',alignItems:'flex-start',gap:'1rem',width:'100%'}}>

                  <img src={buySell.sell.image} alt="coin" style={{width:48,height:48,borderRadius:999,flexShrink:0}}/>
                  <div style={{minWidth:0}}>
                    <div style={styles.coinTitle}>{buySell.sell.name} <span style={{color:'#9ca3af'}}>({(buySell.sell.symbol||'').toUpperCase()})</span></div>
                    <div style={styles.coinPrice}>{fmtUSD(buySell.sell.current_price)}</div>
                    {pnl.sell && (
                      <p style={styles.subtext}>
                        3h PnL {pct(pnl.sell.pnl3h)} | 6h PnL {pct(pnl.sell.pnl6h)} | 1d PnL {pct(pnl.sell.pnl1d)}
                      </p>
                    )}
                  </div>
                </div>
                <p style={styles.subtext}>Largest 24h decline ({pct(buySell.sell.price_change_percentage_24h)}), high volume ({fmtUSD(buySell.sell.total_volume)}) suggesting profit-taking or bearish shift. Commonly sold on Binance or Bybit. Good candidate to exit or short if leveraged markets available.</p>
              </>
            ):<div style={styles.subtext}>No SELL candidate found.</div>}
          </div>
        </div>
      )}

      <div style={{...styles.card,width:'100%'}}>
        <div style={styles.sectionTitle}>❤️ Support</div>
        <div style={styles.subtext}>If I helped you make money, show some love ❤️</div>
        <div style={styles.donation}>
          <input readOnly value={'0x6575048c1b1f8dB65D7B0a10430146aA59D84D58'} style={{flex:1,padding:'0.8rem',borderRadius:12,border:'1px solid #333',background:'#000',color:'#fff'}}/>
          <button onClick={()=>copy('0x6575048c1b1f8dB65D7B0a10430146aA59D84D58')} style={styles.loveBtn} title="Copy">{copied?'✅':'📋'}</button>
        </div>
      </div>

      <footer style={{fontSize:12,color:'#6b7280',marginTop:'1.5rem',textAlign:'center'}}>Data: CoinGecko API — Informational only, not financial advice.</footer>
    </div>
  </div>);
}
