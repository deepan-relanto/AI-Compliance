const EMBED_PATCH_STYLE = `<style id="relanto-embed-size-fix">
html, body { height: 100% !important; margin: 0 !important; overflow: hidden !important; }
body.embed .deck-shell {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  height: 100% !important;
  padding: 0 !important;
  box-sizing: border-box !important;
}
body.embed .deck-shell > .deck,
body.embed .deck {
  position: relative !important;
  flex-shrink: 0 !important;
  transform-origin: center center !important;
  overflow: hidden !important;
}
body.embed .slide { overflow: auto !important; box-sizing: border-box !important; }
</style>`;

const EMBED_PATCH_SCRIPT = `<script id="relanto-embed-fit">(function(){
  function isEmbed(){try{return new URLSearchParams(location.search).get("embed")==="1"||document.body.classList.contains("embed");}catch(e){return false;}}
  if(!isEmbed())return;
  function fitEmbedDeck(){
    var shell=document.querySelector(".deck-shell");
    var deck=shell&&(shell.querySelector(".deck")||document.querySelector(".deck"));
    if(!shell||!deck)return;
    deck.style.transform="none";
    var sw=shell.clientWidth,sh=shell.clientHeight;
    if(sw<1||sh<1)return;
    var dw=deck.offsetWidth,dh=deck.offsetHeight;
    if(dw<1||dh<1)return;
    var scale=Math.min(sw/dw,sh/dh,1);
    deck.style.transform="scale("+scale+")";
    deck.style.transformOrigin="center center";
  }
  window.relantoFitEmbedDeck=fitEmbedDeck;
  window.addEventListener("resize",fitEmbedDeck);
  function schedule(){setTimeout(fitEmbedDeck,0);setTimeout(fitEmbedDeck,150);}
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

  html = html.replace(/body\.embed\s+\.deck-shell\s*\{[^}]*\}/gi, "");
  html = html.replace(/body\.embed\s+\.deck\s*\{[^}]*\}/gi, "");
  html = html.replace(/\b100vh\b/g, "100%");
  html = html.replace(/\b100vw\b/g, "100%");

  if (!html.includes("relanto-embed-size-fix")) {
    if (html.includes("</head>")) {
      html = html.replace("</head>", `${EMBED_PATCH_STYLE}</head>`);
    } else {
      html = EMBED_PATCH_STYLE + html;
    }
  }

  if (!html.includes("relanto-embed-fit")) {
    if (html.includes("</body>")) {
      html = html.replace("</body>", `${EMBED_PATCH_SCRIPT}</body>`);
    } else {
      html = html + EMBED_PATCH_SCRIPT;
    }
  }

  return Buffer.from(html, "utf8");
}
