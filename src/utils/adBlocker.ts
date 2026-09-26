// Advanced Ad, Tracker & Popup Blocking Rules for TurboDownloader
// Designed specifically to eliminate aggressive popups, popunders, and clickjacking
// commonly found on streaming and download sites (YoMovies, VegaMovies, 9xmovies, etc.)

export const AD_BLOCK_RULES = [
  // Major ad networks
  '*.doubleclick.net',
  '*.googlesyndication.com',
  '*.googleadservices.com',
  '*.google-analytics.com',
  '*.googletagmanager.com',
  '*.googletagservices.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',

  // Facebook & Social Trackers
  '*.facebook.net',
  'connect.facebook.net',
  'pixel.facebook.com',

  // Piracy, Movie Site & Adult Pop-up / Popunder / Redirect Networks
  '*.popads.net',
  '*.popcash.net',
  '*.propellerads.com',
  '*.propellerclick.com',
  '*.propu.sh',
  '*.monetag.com',
  '*.adsterra.com',
  '*.highcpmgate.com',
  '*.highrevenuenetwork.com',
  '*.alwingulla.com',
  '*.onclickalgo.com',
  '*.onclickperformance.com',
  '*.deloton.com',
  '*.onmarshtomato.com',
  '*.juicyads.com',
  '*.trafficjunky.com',
  '*.clickadu.com',
  '*.hilltopads.com',
  '*.exoclick.com',
  '*.yllix.com',
  '*.bidvertiser.com',
  '*.adkeeper.com',
  '*.adskeeper.co.uk',
  '*.adskeeper.com',
  '*.adxad.com',
  '*.wigetmedia.com',
  '*.vdo.ai',
  '*.aniview.com',
  '*.mgid.com',
  '*.admaven.com',
  '*.ad-maven.com',
  '*.zeroredirect.com',
  '*.fastclick.net',
  '*.pt-ad.com',
  '*.adtrue.com',
  '*.clicksor.com',
  '*.infolinks.com',
  '*.revcontent.com',
  '*.taboola.com',
  '*.outbrain.com',

  // Notorious Redirect / Shortener Spam Domains
  '*.shorte.st',
  '*.ouo.io',
  '*.ouo.press',
  '*.linkvertise.com',
  '*.droplink.co',
  '*.gplinks.co',
  '*.shrinkearn.com',
  '*.shrinkme.io',
  '*.za.gl',

  // General Ad Exchanges & SSPs
  '*.adnxs.com',
  '*.adsrvr.org',
  '*.advertising.com',
  '*.criteo.com',
  '*.criteo.net',
  '*.pubmatic.com',
  '*.rubiconproject.com',
  '*.openx.net',
  '*.casalemedia.com',
  '*.moatads.com',
  '*.serving-sys.com',
  '*.adform.net',
  '*.adhigh.net',
  '*.admixer.net',
  '*.adroll.com',
  '*.adtechus.com',
  '*.bidswitch.net',
  '*.contextweb.com',
  '*.districtm.io',
  '*.liveintent.com',
  '*.mathtag.com',
  '*.mopub.com',
  '*.quantserve.com',
  '*.scorecardresearch.com',
  '*.sharethrough.com',
  '*.smartadserver.com',
  '*.spotxchange.com',
  '*.tapad.com',
  '*.turn.com',
  '*.yieldmo.com',

  // Push Notification / Spam Trackers
  '*.pushwoosh.com',
  '*.onesignal.com',
  '*.truepush.com',
  '*.aimtell.com',
  '*.sendpulse.com',
  '*.subscribers.com',

  // Analytics & Session Recorders
  '*.hotjar.com',
  '*.mixpanel.com',
  '*.segment.com',
  '*.amplitude.com',
  '*.branch.io',
  '*.adjust.com',
  '*.appsflyer.com',
  '*.kochava.com',
  '*.singular.net',
  '*.histats.com',
  '*.whos.amung.us',
];

// CSS injection to hide ads, banners, and clickjack overlays
export const AD_HIDE_CSS = `
  [class*="ad-"], [class*="ads-"], [class*="advert"],
  [id*="ad-"], [id*="ads-"], [id*="advert"],
  [class*="banner"], [class*="sponsor"],
  iframe[src*="ad"], iframe[src*="doubleclick"], iframe[src*="pop"],
  div[data-ad], div[data-ads], div[data-advert],
  .ad-container, .ad-wrapper, .ad-slot, .ad-unit,
  .ad-banner, .ad-box, .ad-frame, .ad-overlay,
  #ad-container, #ad-wrapper, #ad-slot,
  .google-ad, .adsense, .adsbygoogle,
  ins.adsbygoogle, .ad-placeholder,
  div[class*="popunder"], div[id*="popunder"],
  div[class*="overlay"][style*="z-index: 999"],
  div[class*="overlay"][style*="z-index:999"] {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    max-height: 0 !important;
    overflow: hidden !important;
    pointer-events: none !important;
  }
`;

// Advanced script to run BEFORE and DURING page execution
// Neutralizes popups, click-jacking, popunders, and intercepts media streams
export const AD_BLOCK_JS = `
  (function() {
    'use strict';
    
    // 1. Mock Window Object to satisfy scripts attempting window.open without opening tabs
    var mockWindow = {
      closed: true,
      name: '',
      document: {
        write: function(){},
        writeln: function(){},
        open: function(){ return this; },
        close: function(){},
        location: { href: '', replace: function(){}, assign: function(){}, reload: function(){} }
      },
      location: {
        href: '',
        replace: function(){},
        assign: function(){},
        reload: function(){}
      },
      focus: function(){},
      blur: function(){},
      close: function(){},
      postMessage: function(){},
      addEventListener: function(){},
      removeEventListener: function(){}
    };

    try {
      window.open = function() {
        console.log('[TurboDownloader] Blocked window.open popup attempt');
        return mockWindow;
      };
    } catch(e) {}

    // 2. Block popup alerts, confirms, prompts (scareware)
    try {
      window.alert = function() { return null; };
      window.confirm = function() { return false; };
      window.prompt = function() { return null; };
      window.onbeforeunload = null;
    } catch(e) {}

    // 3. Prevent popunder blur / focus tricks
    try {
      window.blur = function() {};
    } catch(e) {}

    // 4. Clean Clickjacking Overlays & Link targets
    function sanitizeDOM() {
      try {
        // Strip target="_blank" from links so they don't spawn popups
        var links = document.querySelectorAll('a[target="_blank"]');
        for (var i = 0; i < links.length; i++) {
          links[i].removeAttribute('target');
        }

        // Detect full-screen invisible clickjacking overlays
        var allElems = document.querySelectorAll('div, a, span, section');
        var winW = window.innerWidth || document.documentElement.clientWidth;
        var winH = window.innerHeight || document.documentElement.clientHeight;

        for (var j = 0; j < allElems.length; j++) {
          var el = allElems[j];
          var style = window.getComputedStyle(el);
          var pos = style.position;
          var z = parseInt(style.zIndex, 10);

          if ((pos === 'fixed' || pos === 'absolute') && z >= 900) {
            var rect = el.getBoundingClientRect();
            if (rect.width >= winW * 0.7 && rect.height >= winH * 0.7) {
              var op = parseFloat(style.opacity);
              var bg = style.backgroundColor;
              if (op < 0.1 || bg === 'transparent' || bg.indexOf('rgba(0, 0, 0, 0)') !== -1) {
                if (el.parentNode) {
                  console.log('[TurboDownloader] Removed clickjacking overlay');
                  el.parentNode.removeChild(el);
                }
              }
            }
          }
        }
      } catch(err) {}
    }

    // 5. Media Sniffer (IDM style) - Detects video sources for easy 1-tap download
    function sniffMedia() {
      try {
        var videos = document.querySelectorAll('video, audio');
        for (var v = 0; v < videos.length; v++) {
          var vid = videos[v];
          var src = vid.currentSrc || vid.src;
          if (!src && vid.children) {
            for (var c = 0; c < vid.children.length; c++) {
              if (vid.children[c].tagName === 'SOURCE') {
                src = vid.children[c].src;
                if (src) break;
              }
            }
          }
          if (src && src.startsWith('http') && !src.includes('blob:')) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'MEDIA_DETECTED',
                url: src,
                title: document.title || 'Video'
              }));
            }
          }
        }
      } catch(e) {}
    }

    // Hook play event to capture streams right when they start
    try {
      document.addEventListener('play', function(e) {
        if (e.target && (e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO')) {
          var src = e.target.currentSrc || e.target.src;
          if (src && src.startsWith('http') && window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'MEDIA_DETECTED',
              url: src,
              title: document.title || 'Video'
            }));
          }
        }
      }, true);
    } catch(e) {}

    // Periodic sweep
    function runSweep() {
      sanitizeDOM();
      sniffMedia();
    }

    setInterval(runSweep, 800);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runSweep);
    } else {
      runSweep();
    }

    // Capture clicks: clean overlays and intercept direct file download clicks
    document.addEventListener('click', function(e) {
      sanitizeDOM();
      try {
        var el = e.target;
        while (el && el.tagName !== 'A' && el.tagName !== 'BODY') {
          el = el.parentElement;
        }
        if (el && el.tagName === 'A' && el.href) {
          var href = el.href;
          if (href && href.startsWith('http')) {
            var lowerHref = href.toLowerCase();
            var hasDownloadAttr = el.hasAttribute('download');
            var isDirectFile = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|3gp|mp3|wav|flac|aac|zip|rar|7z|tar|gz|iso|apk|ipa|pdf)(\?|#|$)/i.test(href);
            var isWebPage = lowerHref.endsWith('.html') || lowerHref.endsWith('.htm') || lowerHref.endsWith('.php');

            if (isDirectFile || (hasDownloadAttr && !isWebPage)) {
              if (window.ReactNativeWebView) {
                var safeTitle = (el.getAttribute('download') || el.textContent || document.title || 'Download').trim().substring(0, 100);
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'DOWNLOAD_CLICKED',
                  url: href,
                  title: safeTitle
                }));
              }
            }
          }
        }
      } catch(err) {}
    }, true);
  })();
  true;
`;

// Check if a URL should be blocked
export function shouldBlockUrl(url: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();

  // Don't block data or about URLs
  if (lowerUrl.startsWith('data:') || lowerUrl.startsWith('about:')) return false;

  return AD_BLOCK_RULES.some(rule => {
    const domain = rule.replace('*.', '').replace('*', '');
    return lowerUrl.includes(domain);
  });
}
