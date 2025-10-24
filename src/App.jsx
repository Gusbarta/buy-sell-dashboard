import React, { useEffect, useMemo, useState } from "react";

/**
 * NOT A FINANCIAL ADVISOR — Dark, minimal, LayerZero-green accent
 * - Sixtyfour Convergence font for logo (Google Fonts)
 * - LEFT: Battle stack (Explainer + Early + Explosive) with visible SCORE
 * - RIGHT: Winner card (single)
 * - BELOW: SELL + Donation
 */

const API =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&price_change_percentage=1h,24h,7d";

function fmtUSD(n){ if(!n&&n!==0)return"-"; return n<1?"$"+Number(n).toLocaleString(undefined,{minimumFractionDigits:4,maximumFractionDigits:6}):"$"+Number(n).toLocaleString(undefined,{maximumFractionDigits:2}); }
function pct(n){ if(!n&&n!==0)return"-"; const s=n>0?"+":""; return s+Number(n).toFixed(2)+"%"; }
function safe(n){ return (n===null||n===undefined)?0:Number(n); }

export default function CryptoBuySellDashboard(){
  const [data,setData]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);
  const [decidedAt,setDecidedAt]=useState(null);
  const [copied,setCopied]=useState(false);

  const [pnl,setPnl]=useState({winner:null,sell:null});
  const [coinDetails, setCoinDetails] = useState({ winner: null, sell: null });

  const [battle,setBattle]=useState({
    early:null, explosive:null, winner:null, reason:""
  });

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
    return data.filter(c=>
      c.total_volume>10_000_000 &&
      !stables.has((c.symbol||'').toLowerCase())
    );
  },[data]);

  // Build Battle: Early vs Explosive + winner
  useEffect(()=>{
    if(!universe.length){ setBattle({early:null,explosive:null,winner:null,reason:""}); return; }

    const withPct=(c)=>({
      ...c,
      p1h: c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? 0,
      p24h: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0,
    });

    const U = universe.map(withPct);

    const earlyPool = U.filter(c => c.p24h >= 3 && c.p24h <= 10);
    const explosivePool = U.filter(c => c.p24h > 10 && c.p24h <= 60 && c.total_volume > 20_000_000);

    const score = (c) => (safe(c.p1h)*3) + safe(c.p24h) + Math.log10(Math.max(1, safe(c.total_volume)));

    const early = earlyPool.sort((a,b)=>score(b)-score(a))[0] || null;
    const explosive = explosivePool.sort((a,b)=>score(b)-score(a))[0] || null;

    let winner = null;
    let reason = "";
    if (early && explosive){
      const se = score(early), sx = score(explosive);
      if (sx >= se){
        winner = {...explosive, _score:sx, _tag:"Explosive"};
        reason = "Explosive wins: stronger 1h momentum + higher liquidity suggest continuation (but watch retrace risk).";
      } else {
        winner = {...early, _score:se, _tag:"Early"};
        reason = "Early wins: controlled 24h rise with positive 1h impulse; better risk/reward for a +10% target.";
      }
    } else if (explosive){
      const sx = score(explosive);
      winner = {...explosive, _score: sx, _tag:"Explosive"};
      reason = "Explosive wins by default: early candidate not strong enough today.";
    } else if (early){
      const se = score(early);
      winner = {...early, _score: se, _tag:"Early"};
      reason = "Early wins by default: no credible explosive runner in range.";
    }

    setBattle({early, explosive, winner, reason});
  },[universe]);

  // SELL = worst 24h from universe
  const sellPick=useMemo(()=>{
    if(!universe.length) return null;
    const get24 = (c)=> c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0;
    return [...universe].sort((a,b)=>get24(a)-get24(b))[0] || null;
  },[universe]);

  // PnL calc for winner/sell
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
      const p24 = coin.price_change_percentage_24h_in_currency ?? coin.price_change_percentage_24h ?? 0;
      setPnl(prev=>({...prev,[side]:{pnl3h,pnl6h,pnl1d:p24}}));
    }catch(e){console.error(e);}
  }

  async function fetchCoinPlatforms(id) {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/${id}`);
    if (!res.ok) throw new Error('Coin details error');
    const json = await res.json();
    return json.platforms || {};
  }

  useEffect(()=>{
    if(battle.winner) fetchPnL(battle.winner,'winner');
    if(sellPick)      fetchPnL(sellPick,'sell');
  },[battle.winner, sellPick]);

  useEffect(() => {
    let cancelled = false;
    async function loadPlatforms() {
      try {
        const [wPlatforms, sPlatforms] = await Promise.all([
          battle.winner ? fetchCoinPlatforms(battle.winner.id) : Promise.resolve(null),
          sellPick ? fetchCoinPlatforms(sellPick.id) : Promise.resolve(null),
        ]);
        if (!cancelled) setCoinDetails({ winner: wPlatforms, sell: sPlatforms });
      } catch (e) {
        console.error('Error fetching coin platform data:', e);
        if (!cancelled) setCoinDetails({ winner: null, sell: null });
      }
    }
    if (battle.winner || sellPick) loadPlatforms();
    return () => { cancelled = true; };
  }, [battle.winner, sellPick]);

  function copy(text){
    navigator.clipboard?.writeText(text).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),1500); }).catch(()=>{});
  }

  // ===== Styles =====
  const styles={
    page:{
      fontFamily:'Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial',
      background:'#0a0a0a',
      color:'#eef2f5',
      minHeight:'100vh',
      width:'100vw',
      display:'flex',
      justifyContent:'center',
      alignItems:'flex-start',
      padding:'4.5rem 1.25rem',
      overflowX:'hidden'
    },
    container:{ width:'100%', maxWidth:1200, display:'flex', flexDirection:'column', gap:'2.75rem' },

    header:{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%'},
    logo:{
      // Sixtyfour Convergence applied via class below
      fontFamily:'"Sixtyfour Convergence", Inter, system-ui, Arial, sans-serif',
      fontSize:28,
      fontWeight:900,
      letterSpacing:'0.08em',
      textTransform:'uppercase',
      color:'#00FFB2'
    },

    btn:{background:'#0a0a0a',color:'#fff',border:'1px solid #2a2a2a',borderRadius:999,padding:'0.9rem 1.4rem',cursor:'pointer',fontWeight:700,letterSpacing:'.2px',transition:'all .2s ease'},
    subtext:{fontSize:14,color:'#9ca3af',lineHeight:1.65},

    twoCol:{display:'grid',gap:'2rem',width:'100%'},

    sectionTitle:{fontSize:14,letterSpacing:'0.12em',textTransform:'uppercase',color:'#9da3ae'},
    card:{background:'#0c0c0c',border:'1px solid #171717',borderRadius:18,padding:'2rem',boxShadow:'0 0 0 1px rgba(255,255,255,0.02) inset',display:'flex',flexDirection:'column',gap:'1.25rem'},
    subcard:{background:'#0c0c0c',border:'1px solid #141414',borderRadius:14,padding:'1.25rem',display:'flex',flexDirection:'column',gap:'0.75rem'},

    explainerTitle:{fontSize:13,letterSpacing:'0.18em',textTransform:'uppercase',color:'#9da3ae'},
    explainerBox:{background:'#0c0c0c',border:'1px solid #141414',borderRadius:14,padding:'1rem',color:'#c7d0da'},

    coinRow:{display:'flex',alignItems:'flex-start',gap:'1rem',width:'100%'},
    coinTitle:{fontWeight:700,fontSize:18},
    coinPrice:{fontSize:26,fontWeight:800},

    tag:{border:'1px solid #2a2a2a',borderRadius:999,padding:'0.25rem 0.7rem',fontSize:12,color:'#cbd5e1'},
    scoreWrap:{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4},
    scoreLabel:{fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',color:'#9da3ae'},
    scoreValue:{fontWeight:900,fontSize:30,letterSpacing:'-0.02em',color:'#00FFB2'},

    verdict:{background:'#0e0e0e',border:'1px dashed #222',borderRadius:14,padding:'1rem',color:'#c7d0da'},

    donation:{display:'flex',alignItems:'center',gap:10,marginTop:'0.5rem',width:'100%'},
    copyBtnBase:{background:'none',border:'1px solid #333',borderRadius:8,padding:'4px 8px',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'filter .15s ease'},
  };

  return(
    <div style={styles.page}>
      <style>{`
        /* Import Google Font */
        @import url('https://fonts.googleapis.com/css2?family=Sixtyfour+Convergence&display=swap');

        :root { --accent: #00FFB2; }
        *{box-sizing:border-box}
        html,body,#root{height:100%;margin:0;background:#0a0a0a;color:#eef2f5}
        button:focus{outline:2px solid #3b82f6;outline-offset:2px}
        .btn-dark:hover{background:#fff!important;color:#000!important}
        /* Two-column at desktop; stacked on mobile */
        .two-col { grid-template-columns: 1fr; }
        @media (min-width: 901px){
          .two-col { grid-template-columns: 1.2fr 0.8fr; }
        }
        code { background:#0f0f0f; border:1px solid #161616; padding:2px 6px; border-radius:6px; }
      `}</style>

      <div style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.logo}>NOT A FINANCIAL ADVISOR</div>
          <button
            className="btn-dark"
            onClick={load}
            style={styles.btn}
            onMouseEnter={(e)=>{e.currentTarget.style.background='#fff';e.currentTarget.style.color='#000'}}
            onMouseLeave={(e)=>{e.currentTarget.style.background='#0a0a0a';e.currentTarget.style.color='#fff'}}
          >
            Update
          </button>
        </header>

        {/* Last update */}
        {decidedAt && (
          <div style={{ ...styles.subtext, width: "100%", textAlign: "left" }}>
            Last update: {decidedAt}
          </div>
        )}
        {loading && <div style={styles.subtext}>Loading...</div>}
        {error && <div style={{color:'#f87171'}}>{error}</div>}

        {/* ===== Two-column: LEFT (Battle stack) | RIGHT (Winner) ===== */}
        <div className="two-col" style={styles.twoCol}>
          {/* LEFT: Battle Stack */}
          <div>
            {/* Explainer (independent box) */}
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Battle of Momentum</div>
              <div style={styles.explainerBox}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={styles.explainerTitle}>How the battle works</div>
                </div>
                <div style={{color:'#cbd5e1',fontSize:14,lineHeight:1.65}}>
                  We compare two contenders:
                  <br/>
                  <strong style={{color:'var(--accent)'}}>Early</strong> — coins up <em>3–10%</em> in 24h with a positive <em>1h impulse</em> (healthier entries).
                  <br/>
                  <strong style={{color:'var(--accent)'}}>Explosive</strong> — coins up <em>10–60%</em> in 24h with strong <em>liquidity</em> (bigger upside, bigger risk).
                  <br/><br/>
                  <span style={{opacity:.9}}>Scoring formula:</span> <code>Score = (1h momentum × 3) + 24h change + log₁₀(volume)</code>.
                  The higher score wins.
                </div>
              </div>

              {/* EARLY contender */}
              <div style={styles.subcard}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <span style={styles.tag}>EARLY</span>
                  <div style={styles.scoreWrap}>
                    <div style={styles.scoreLabel}>Score</div>
                    <div style={styles.scoreValue}>
                      {battle.early
                        ? (
                          (safe(battle.early.price_change_percentage_1h_in_currency||battle.early.price_change_percentage_1h||0)*3) +
                          (safe(battle.early.price_change_percentage_24h_in_currency||battle.early.price_change_percentage_24h||0)) +
                          Math.log10(Math.max(1, safe(battle.early.total_volume)))
                        ).toFixed(1)
                        : "—"}
                    </div>
                  </div>
                </div>
                {battle.early ? (
                  <div style={styles.coinRow}>
                    <img src={battle.early.image} alt="coin" style={{width:48,height:48,borderRadius:999,flexShrink:0}}/>
                    <div style={{minWidth:0}}>
                      <div style={styles.coinTitle}>{battle.early.name} <span style={{color:'#9ca3af'}}>({(battle.early.symbol||'').toUpperCase()})</span></div>
                      <div style={styles.coinPrice}>{fmtUSD(battle.early.current_price)}</div>
                      <p style={styles.subtext}>
                        1h {pct(battle.early.price_change_percentage_1h_in_currency||battle.early.price_change_percentage_1h||0)} ·
                        24h {pct(battle.early.price_change_percentage_24h_in_currency||battle.early.price_change_percentage_24h||0)} ·
                        Vol {fmtUSD(battle.early.total_volume)}
                      </p>
                    </div>
                  </div>
                ) : <div style={styles.subtext}>No early candidate today.</div>}
              </div>

              {/* EXPLOSIVE contender */}
              <div style={styles.subcard}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <span style={styles.tag}>EXPLOSIVE</span>
                  <div style={styles.scoreWrap}>
                    <div style={styles.scoreLabel}>Score</div>
                    <div style={styles.scoreValue}>
                      {battle.explosive
                        ? (
                          (safe(battle.explosive.price_change_percentage_1h_in_currency||battle.explosive.price_change_percentage_1h||0)*3) +
                          (safe(battle.explosive.price_change_percentage_24h_in_currency||battle.explosive.price_change_percentage_24h||0)) +
                          Math.log10(Math.max(1, safe(battle.explosive.total_volume)))
                        ).toFixed(1)
                        : "—"}
                    </div>
                  </div>
                </div>
                {battle.explosive ? (
                  <div style={styles.coinRow}>
                    <img src={battle.explosive.image} alt="coin" style={{width:48,height:48,borderRadius:999,flexShrink:0}}/>
                    <div style={{minWidth:0}}>
                      <div style={styles.coinTitle}>{battle.explosive.name} <span style={{color:'#9ca3af'}}>({(battle.explosive.symbol||'').toUpperCase()})</span></div>
                      <div style={styles.coinPrice}>{fmtUSD(battle.explosive.current_price)}</div>
                      <p style={styles.subtext}>
                        1h {pct(battle.explosive.price_change_percentage_1h_in_currency||battle.explosive.price_change_percentage_1h||0)} ·
                        24h {pct(battle.explosive.price_change_percentage_24h_in_currency||battle.explosive.price_change_percentage_24h||0)} ·
                        Vol {fmtUSD(battle.explosive.total_volume)}
                      </p>
                    </div>
                  </div>
                ) : <div style={styles.subtext}>No explosive candidate today.</div>}
              </div>
            </div>
          </div>

          {/* RIGHT: Winner Card */}
          <div>
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Winner</div>
              {battle.winner ? (
                <>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div style={{display:'flex',gap:'1rem'}}>
                      <img src={battle.winner.image} alt="coin" style={{width:56,height:56,borderRadius:999,flexShrink:0}}/>
                      <div>
                        <div style={styles.coinTitle}>
                          {battle.winner.name} <span style={{color:'#9ca3af'}}>({(battle.winner.symbol||'').toUpperCase()})</span>
                        </div>
                        <div style={styles.coinPrice}>{fmtUSD(battle.winner.current_price)}</div>
                        <div style={{display:'flex',gap:12,marginTop:10,alignItems:'center'}}>
                          <span style={{...styles.tag, borderColor:'#1f1f1f', color:'#cbd5e1'}}>{battle.winner._tag}</span>
                          <div style={styles.scoreWrap}>
                            <div style={styles.scoreLabel}>Score</div>
                            <div style={styles.scoreValue}>{battle.winner._score?.toFixed(1)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Reason */}
                  <div style={styles.verdict}>
                    {battle.reason}
                  </div>

                  {/* PnL */}
                  {pnl.winner && (
                    <p style={styles.subtext}>
                      3h PnL {pct(pnl.winner.pnl3h)} | 6h PnL {pct(pnl.winner.pnl6h)} | 1d PnL {pct(pnl.winner.pnl1d)}
                    </p>
                  )}

                  {/* Networks / contracts */}
                  {coinDetails.winner && (
                    <div style={{ ...styles.subtext, marginTop: '0.25rem' }}>
                      <div style={{ fontWeight: 600, color: '#e5e7eb', marginBottom: 4 }}>Networks</div>
                      {Object.keys(coinDetails.winner).length === 0 ? (
                        <div>Native token (no contract address)</div>
                      ) : (
                        Object.entries(coinDetails.winner).map(([network, address]) => (
                          <div key={network} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <span style={{ minWidth: 160 }}>{network}</span>
                            <span style={{ opacity: 0.85 }}>
                              {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—'}
                            </span>
                            {address && (
                              <button
                                onClick={() => copy(address)}
                                onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.25)')}
                                onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
                                title="Copy contract"
                                aria-label="Copy contract"
                                style={styles.copyBtnBase}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div style={styles.subtext}>No winner — insufficient momentum today.</div>
              )}
            </div>
          </div>
        </div>

        {/* SELL (below the two-column section) */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Sell</div>
          {sellPick?(
            <>
              <div style={styles.coinRow}>
                <img src={sellPick.image} alt="coin" style={{width:48,height:48,borderRadius:999,flexShrink:0}}/>
                <div style={{minWidth:0}}>
                  <div style={styles.coinTitle}>{sellPick.name} <span style={{color:'#9ca3af'}}>({(sellPick.symbol||'').toUpperCase()})</span></div>
                  <div style={styles.coinPrice}>{fmtUSD(sellPick.current_price)}</div>
                  {pnl.sell && (
                    <p style={styles.subtext}>
                      3h PnL {pct(pnl.sell.pnl3h)} | 6h PnL {pct(pnl.sell.pnl6h)} | 1d PnL {pct(pnl.sell.pnl1d)}
                    </p>
                  )}
                  {coinDetails.sell && (
                    <div style={{ ...styles.subtext, marginTop: '0.25rem' }}>
                      <div style={{ fontWeight: 600, color: '#e5e7eb', marginBottom: 4 }}>Networks</div>
                      {Object.keys(coinDetails.sell).length === 0 ? (
                        <div>Native token (no contract address)</div>
                      ) : (
                        Object.entries(coinDetails.sell).map(([network, address]) => (
                          <div key={network} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <span style={{ minWidth: 160 }}>{network}</span>
                            <span style={{ opacity: 0.85 }}>
                              {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—'}
                            </span>
                            {address && (
                              <button
                                onClick={() => copy(address)}
                                onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.25)')}
                                onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
                                title="Copy contract"
                                aria-label="Copy contract"
                                style={styles.copyBtnBase}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              <p style={styles.subtext}>
                Largest 24h decline suggests weakness or profit-taking; consider exiting exposure or hedging.
              </p>
            </>
          ):<div style={styles.subtext}>No SELL candidate found.</div>}
        </div>

        {/* Donation (full width) */}
        <div style={{...styles.card,width:'100%'}}>
          <div style={styles.sectionTitle}>❤️ Support</div>
          <div style={styles.subtext}>If I helped you make money, show some love ❤️</div>
          <div style={styles.donation}>
            <input readOnly value={'0x6575048c1b1f8dB65D7B0a10430146aA59D84D58'} style={{flex:1,padding:'0.8rem',borderRadius:12,border:'1px solid #1b1b1b',background:'#000',color:'#fff'}}/>
            <button
              onClick={()=>copy('0x6575048c1b1f8dB65D7B0a10430146aA59D84D58')}
              title="Copy wallet address"
              aria-label="Copy wallet address"
              style={{ ...styles.copyBtnBase, border:'1px solid #333' }}
              onMouseEnter={(e)=>e.currentTarget.style.filter='brightness(1.25)'}
              onMouseLeave={(e)=>e.currentTarget.style.filter='none'}
            >
              {copied ? '✅' : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <footer style={{fontSize:12,color:'#6b7280',marginTop:'1.5rem',textAlign:'center'}}>
          Data: CoinGecko API — Informational only, not financial advice.
        </footer>
      </div>
    </div>
  );
}
