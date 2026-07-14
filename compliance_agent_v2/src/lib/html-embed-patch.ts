const EMBED_PATCH_STYLE = `<style id="relanto-embed-size-fix">
html, body { height: 100% !important; margin: 0 !important; overflow: hidden !important; }
body.embed { background: #0a0a0a !important; }
body.embed .deck-shell {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  height: 100% !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  container-type: size !important;
}
body.embed .deck-shell > .deck,
body.embed .deck {
  position: relative !important;
  flex-shrink: 0 !important;
  aspect-ratio: 16 / 9 !important;
  width: min(100cqw, calc(100cqh * 16 / 9)) !important;
  height: min(100cqh, calc(100cqw * 9 / 16)) !important;
  max-width: 100% !important;
  max-height: 100% !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  transform: none !important;
  transform-origin: center center !important;
  overflow: hidden !important;
}
body.embed .slide {
  overflow: auto !important;
  box-sizing: border-box !important;
  padding: 18px 24px 36px !important;
}
body.embed .flow { margin-top: 10px !important; gap: 6px !important; }
body.embed .flow-step { min-height: 0 !important; padding: 8px 10px !important; font-size: 13px !important; }
body.embed .content { margin-top: 8px !important; }
body.embed .grid { gap: 8px !important; }
body.embed .card { padding: 8px 10px !important; }
body.embed .card h3, body.embed .card strong { font-size: 14px !important; }
body.embed .card p, body.embed .card li { font-size: 12px !important; line-height: 1.35 !important; }
body.embed .journey { margin-top: 10px !important; gap: 6px !important; }
body.embed .journey-step { min-height: 0 !important; padding: 8px !important; }
body.embed h1 { font-size: clamp(16px, 2.4vw, 26px) !important; margin-bottom: 8px !important; }
body.embed .kicker { margin-bottom: 4px !important; }
body.embed .footer { left: 24px !important; right: 24px !important; bottom: 10px !important; font-size: 11px !important; }
</style>`;

const EMBED_PATCH_SCRIPT = `<script id="relanto-embed-fit">(function(){
  function isEmbed(){try{return new URLSearchParams(location.search).get("embed")==="1"||document.body.classList.contains("embed");}catch(e){return false;}}
  if(!isEmbed())return;
  var ASPECT=16/9;
  function fitEmbedDeck(){
    var shell=document.querySelector(".deck-shell");
    var deck=shell&&(shell.querySelector(".deck")||document.querySelector(".deck"));
    if(!shell||!deck)return;
    deck.style.transform="none";
    deck.querySelectorAll(".slide").forEach(function(s){
      s.style.zoom="";
      s.style.transform="";
    });
    var sw=shell.clientWidth,sh=shell.clientHeight;
    if(sw<1||sh<1)return;
    var deckW,deckH;
    if(sw/sh>ASPECT){deckH=sh;deckW=Math.round(sh*ASPECT);}
    else{deckW=sw;deckH=Math.round(sw/ASPECT);}
    deck.style.width=deckW+"px";
    deck.style.height=deckH+"px";
    deck.style.maxWidth="100%";
    deck.style.maxHeight="100%";
    var active=deck.querySelector(".slide.active");
    if(active){
      var ch=active.clientHeight;
      var contentH=active.scrollHeight;
      if(ch>0&&contentH>ch+2){
        var z=Math.max(0.55, ch/contentH);
        active.style.zoom=String(z);
        if(active.scrollHeight>active.clientHeight+2){
          active.style.overflow="auto";
        }
      }
    }
  }
  window.relantoFitEmbedDeck=fitEmbedDeck;
  window.addEventListener("resize",fitEmbedDeck);
  function schedule(){setTimeout(fitEmbedDeck,0);setTimeout(fitEmbedDeck,150);setTimeout(fitEmbedDeck,400);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule);
  else schedule();
  try{
    var deck=document.querySelector(".deck");
    if(deck)new MutationObserver(fitEmbedDeck).observe(deck,{attributes:true,subtree:true,attributeFilter:["class"]});
    var shell=document.querySelector(".deck-shell");
    if(shell&&typeof ResizeObserver!=="undefined")new ResizeObserver(fitEmbedDeck).observe(shell);
  }catch(e){}
})();</script>`;

/** Patch uploaded HTML lessons so embed mode fits the course player iframe (not 100vh). */
export function patchHtmlCourseAsset(buffer: Buffer): Buffer {
  let html = buffer.toString("utf8");
  if (!html.includes("<html") && !html.includes("<body")) {
    return buffer;
  }

  // Always refresh patch markers so content-aware fit / compact CSS stay current.
  html = html.replace(/<style id="relanto-embed-size-fix">[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<script id="relanto-embed-fit">[\s\S]*?<\/script>/gi, "");

  html = html.replace(/body\.embed\s+\.deck-shell\s*\{[^}]*\}/gi, "");
  html = html.replace(/body\.embed\s+\.deck\s*\{[^}]*\}/gi, "");
  html = html.replace(/\b100vh\b/g, "100%");
  html = html.replace(/\b100vw\b/g, "100%");

  if (html.includes("</head>")) {
    html = html.replace("</head>", `${EMBED_PATCH_STYLE}</head>`);
  } else {
    html = EMBED_PATCH_STYLE + html;
  }

  if (html.includes("</body>")) {
    html = html.replace("</body>", `${EMBED_PATCH_SCRIPT}</body>`);
  } else {
    html = html + EMBED_PATCH_SCRIPT;
  }

  return Buffer.from(html, "utf8");
}
