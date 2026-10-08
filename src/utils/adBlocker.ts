// Advanced Ad, Tracker & Popup Blocking Rules for TurboDownloader
// Designed specifically to eliminate aggressive popups, popunders, and clickjacking
// commonly found on streaming and download sites (YoMovies, VegaMovies, 9xmovies, etc.)

export const AD_BLOCK_RULES = [
  // Major ad networks & AdChoices
  '*.doubleclick.net',
  '*.googlesyndication.com',
  '*.googleadservices.com',
  '*.google-analytics.com',
  '*.googletagmanager.com',
  '*.googletagservices.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',
  'tpc.googlesyndication.com',
  'securepubads.g.doubleclick.net',
  'partner.googleadservices.com',
  '*.adchoices.com',
  '*.youradchoices.com',
  '*.aboutads.info',
  '*.youronlinechoices.com',
  '*.amazon-adsystem.com',

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

  // Betting, Scam & Adult Popups commonly triggered on movie links
  '*.1xbet.com',
  '*.1xbet.wh',
  '*.bet365.com',
  '*.mostbet.com',
  '*.parimatch.com',
  '*.melbet.com',
  '*.1win.pro',
  '*.stake.com',
  '*.richads.com',
  '*.adcash.com',
  '*.galaksion.com',
  '*.clickstar.me',
  '*.rollerads.com',
  '*.clickaine.com',
  '*.syndication.exoclick.com',

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

// Pre-process rule domains for high-speed matching without runtime allocations
export const AD_BLOCK_DOMAINS: string[] = AD_BLOCK_RULES.map(rule =>
  rule.replace(/^\*\.?/, '').toLowerCase()
);

// CSS injection to hide ads, banners, AdChoices, and popunders cleanly
export const AD_HIDE_CSS = `
  /* AdChoices, Google Ads, Sponsored Banners */
  [class*="adchoices" i], [id*="adchoices" i],
  [class*="ad-choices" i], [id*="ad-choices" i],
  a[href*="adchoices" i], a[href*="youradchoices" i], a[href*="aboutads.info" i], a[href*="youronlinechoices" i],
  img[src*="adchoices" i], svg[class*="adchoices" i], [aria-label*="AdChoices" i], [title*="AdChoices" i],
  [data-adchoices], [data-ad-feedback], [data-google-av-cxn], [data-google-av-adk],
  [id*="google_ads"], [class*="google_ads"],
  div[id*="google_ads_iframe"], iframe[id*="google_ads_iframe"],
  [id*="aswift_"], iframe[id*="aswift_"], iframe[name*="aswift_"],
  .adsbygoogle, ins.adsbygoogle,
  div[data-google-query-id],
  div[data-ad-client], div[data-ad-slot], div[data-ad-format],
  div[data-adunit], div[data-ad-unit], div[data-dfp],
  div[id*="div-gpt-ad"], div[class*="div-gpt-ad"],
  div[class*="ad_unit"], div[id*="ad_unit"],
  div[class*="ad_wrapper"], div[id*="ad_wrapper"],
  div[class*="ad_container"], div[id*="ad_container"],
  div[class*="native-ad"], div[class*="sponsored-ad"], div[data-native-ad], div[class*="gemini-ad"],
  div[class*="taboola"], div[id*="taboola"],
  div[class*="outbrain"], div[id*="outbrain"],
  div[class*="mgid"], div[id*="mgid"],
  div[class*="adthrive"], div[class*="mediavine"],
  div[class*="banner-ad"], div[class*="ad-banner"],
  [class*="ad-box"], [id*="ad-box"], [class*="ad-slot"], [id*="ad-slot"],
  [class*="sponsored"], [id*="sponsored"],
  iframe[src*="doubleclick"], iframe[src*="pop"],
  iframe[src*="/ads/"], iframe[src*="adservice"], iframe[src*="adserver"], iframe[src*="ads."],
  iframe[src*="googlesyndication"], iframe[src*="adchoices"],
  div[data-ad], div[data-ads], div[data-advert],
  .ad-container, .ad-wrapper, .ad-slot, .ad-unit,
  .ad-banner, .ad-box, .ad-frame, .ad-overlay,
  #ad-container, #ad-wrapper, #ad-slot,
  .google-ad, .adsense,
  .ad-placeholder,
  div[class*="popunder"], div[id*="popunder"],
  div[class*="sticky-ad"], div[id*="sticky-ad"],
  div[class*="floating-video"], div[id*="floating-video"],
  div[class*="vdo"], div[class*="aniview"],
  a[target="_blank"][style*="z-index: 2147483647"],
  div[style*="z-index: 2147483647"],
  a[target="_blank"][style*="z-index:2147483647"],
  div[style*="z-index:2147483647"],
  div[class*="overlay"][style*="z-index: 999"],
  div[class*="overlay"][style*="z-index:999"],
  div[class*="overlay"][style*="z-index: 1000"],
  div[class*="overlay"][style*="z-index:1000"] {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    max-height: 0 !important;
    overflow: hidden !important;
    pointer-events: none !important;
    opacity: 0 !important;
  }

  /* Never hide Cloudflare, Turnstile, Captcha challenge frames & backdrops */
  #challenge-stage, #challenge-running, #challenge-form, #turnstile-wrapper,
  [id*="challenge"], [class*="challenge"],
  [id*="cf-"], [class*="cf-"], [id*="turnstile"], [class*="turnstile"],
  [name*="cf-turnstile"], [data-sitekey],
  iframe[src*="cloudflare"], iframe[src*="challenges"], iframe[src*="turnstile"], iframe[src*="hcaptcha"], iframe[src*="recaptcha"] {
    display: block !important;
    visibility: visible !important;
    height: auto !important;
    max-height: none !important;
    pointer-events: auto !important;
    opacity: 1 !important;
  }
`;

// Advanced script to run in the WebView
// Completely avoids mutating the DOM during Cloudflare Turnstile bot challenges
// to guarantee fast, zero-loop challenge completion
export const AD_BLOCK_JS = `
  (function() {
    'use strict';

    // Helper: detect if page is currently undergoing a Cloudflare or Bot Challenge
    function isChallengeActive() {
      try {
        var host = (window.location && window.location.hostname ? window.location.hostname : '').toLowerCase();
        if (host.indexOf('cloudflare.com') !== -1 || host.indexOf('challenges.cloudflare') !== -1) {
          return true;
        }
        var title = (document.title || '').toLowerCase();
        if (
          title.indexOf('just a moment') !== -1 ||
          title.indexOf('cloudflare') !== -1 ||
          title.indexOf('attention required') !== -1
        ) {
          return true;
        }
        var href = (window.location && window.location.href ? window.location.href : '').toLowerCase();
        if (
          href.indexOf('challenge-platform') !== -1 ||
          href.indexOf('challenges.cloudflare') !== -1 ||
          href.indexOf('cdn-cgi/challenge') !== -1
        ) {
          return true;
        }
        return (
          !!document.getElementById('challenge-running') ||
          !!document.getElementById('challenge-stage') ||
          !!document.getElementById('challenge-form') ||
          !!document.getElementById('turnstile-wrapper') ||
          !!document.querySelector('.cf-turnstile') ||
          !!document.querySelector('[name*="cf-turnstile"]') ||
          !!document.querySelector('iframe[src*="challenges.cloudflare"]') ||
          !!document.querySelector('iframe[src*="cloudflare"]')
        );
      } catch(e) {
        return false;
      }
    }

    // If an active challenge is taking place, exit immediately to never interfere with proof-of-work
    if (isChallengeActive()) {
      return;
    }

    // Neutralize popups and window.open on spam movie ad links
    try {
      var _origOpen = window.open;
      window.open = function(u, t, f) {
        if (isChallengeActive()) return _origOpen ? _origOpen.apply(window, arguments) : null;
        if (!u) return null;
        var su = String(u).toLowerCase();
        if (/\\.(mp4|mkv|avi|mov|zip|rar|7z)(\\?|#|$)/i.test(su)) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MEDIA_DETECTED', url: u, title: document.title || 'Video' }));
          }
          return null;
        }
        return null;
      };
    } catch(e) {}

    // Suppress scam alert/confirm popups
    try {
      window.alert = function() {};
      window.confirm = function() { return false; };
      window.prompt = function() { return null; };
    } catch(e) {}

    // Purge transparent clickjack overlays from DOM without layout thrashing
    function purgeOverlays() {
      if (isChallengeActive()) return;
      try {
        var candidates = document.querySelectorAll(
          'div[style*="z-index"], a[style*="z-index"], ' +
          'div[style*="fixed"], div[style*="absolute"], ' +
          '[class*="overlay"], [class*="popunder"], [id*="overlay"], [id*="popunder"]'
        );
        for (var i = 0; i < candidates.length; i++) {
          var el = candidates[i];
          if (el.id && el.id.indexOf('challenge') !== -1) continue;
          var zIndex = el.style.zIndex || (window.getComputedStyle ? window.getComputedStyle(el).zIndex : '');
          var z = parseInt(zIndex, 10);
          if (z >= 999) {
            var w = el.offsetWidth || el.clientWidth || 0;
            var h = el.offsetHeight || el.clientHeight || 0;
            if (w > window.innerWidth * 0.7 && h > window.innerHeight * 0.7) {
              el.remove();
            }
          }
        }
      } catch(e) {}
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', purgeOverlays);
    } else {
      purgeOverlays();
    }

    // Capture and neutralize malicious clickjack links and popunders in the capture phase
    try {
      document.addEventListener('click', function(e) {
        if (isChallengeActive()) return;
        try {
          var el = e.target;
          while (el && el.tagName !== 'A' && el.tagName !== 'BODY') {
            el = el.parentElement;
          }
          if (el && el.tagName === 'A') {
            var href = el.getAttribute('href') || el.href || '';
            var target = el.getAttribute('target') || '';
            var lowerHref = href.toLowerCase();

            // Block ad and betting links directly before they trigger navigation
            if (
              lowerHref.indexOf('adsterra') !== -1 ||
              lowerHref.indexOf('highcpm') !== -1 ||
              lowerHref.indexOf('monetag') !== -1 ||
              lowerHref.indexOf('onclick') !== -1 ||
              lowerHref.indexOf('propeller') !== -1 ||
              lowerHref.indexOf('popads') !== -1 ||
              lowerHref.indexOf('popcash') !== -1 ||
              lowerHref.indexOf('1xbet') !== -1 ||
              lowerHref.indexOf('bet365') !== -1 ||
              lowerHref.indexOf('1win') !== -1 ||
              lowerHref.indexOf('mostbet') !== -1 ||
              lowerHref.indexOf('parimatch') !== -1 ||
              lowerHref.indexOf('melbet') !== -1 ||
              lowerHref.indexOf('doubleclick') !== -1 ||
              lowerHref.indexOf('googlesyndication') !== -1
            ) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              return false;
            }

            // Remove full-screen clickjack overlay anchors
            if (target === '_blank') {
              var s = el.getAttribute('style') || '';
              if (s.indexOf('2147483647') !== -1 || (s.indexOf('fixed') !== -1 && s.indexOf('z-index') !== -1)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                try { el.remove(); } catch(err) {}
                return false;
              }
            }
          }
        } catch(err) {}
      }, true);
    } catch(e) {}

    // Media Sniffer (IDM style) - Detects video sources for easy 1-tap download
    function sniffMedia() {
      if (isChallengeActive()) return;

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

    // Hook play event to capture streams right when playback begins
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

    // Sniff once after DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', sniffMedia);
    } else {
      sniffMedia();
    }

    // Capture direct media file clicks for download modal
    document.addEventListener('click', function(e) {
      if (isChallengeActive()) return;

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
            var isDirectFile = /\\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|3gp|mp3|wav|flac|aac|zip|rar|7z|tar|gz|iso|apk|ipa|pdf)(\\?|#|$)/i.test(href);
            var isWebPage = lowerHref.endsWith('.html') || lowerHref.endsWith('.htm') || lowerHref.endsWith('.php');

            if (isDirectFile || (hasDownloadAttr && !isWebPage)) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              if (window.ReactNativeWebView) {
                var safeTitle = (el.getAttribute('download') || el.textContent || document.title || 'Download').trim().substring(0, 100);
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'DOWNLOAD_CLICKED',
                  url: href,
                  title: safeTitle
                }));
              }
              return false;
            }
          }
        }
      } catch(err) {}
    }, true);
  })();
  true;
`;

// Check if a URL should be blocked (Ultra-fast and zero-allocation)
export function shouldBlockUrl(url: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();

  // Don't block internal data, about or blob URLs
  if (
    lowerUrl.startsWith('data:') ||
    lowerUrl.startsWith('about:') ||
    lowerUrl.startsWith('blob:')
  ) {
    return false;
  }

  // Never block essential verification, challenge and captcha providers
  if (
    lowerUrl.includes('cloudflare.com') ||
    lowerUrl.includes('challenges.cloudflare.com') ||
    lowerUrl.includes('cloudflareinsights.com') ||
    lowerUrl.includes('hcaptcha.com') ||
    lowerUrl.includes('recaptcha') ||
    lowerUrl.includes('gstatic.com') ||
    lowerUrl.includes('arkoselabs') ||
    lowerUrl.includes('geetest')
  ) {
    return false;
  }

  // 1. Fast match against known ad domains
  for (let i = 0; i < AD_BLOCK_DOMAINS.length; i++) {
    if (lowerUrl.includes(AD_BLOCK_DOMAINS[i])) {
      return true;
    }
  }

  // 2. Match aggressive ad/popunder keywords in hostname
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    const adKeywords = [
      'doubleclick', 'googlesyndication', 'googleadservices', 'adchoices',
      'popads', 'popcash', 'propeller', 'onclick', 'clickadu',
      'adsterra', 'exoclick', 'trafficjunky', 'juicyads', 'hilltopads',
      'highcpm', 'alwingulla', 'deloton', 'onmarshtomato', 'monetag',
      'adkeeper', 'adskeeper', 'admaven', 'vdo.ai', 'aniview',
      'zeroredirect', 'adtrue', 'bidvertiser', 'mgid',
      '1xbet', 'bet365', 'mostbet', 'parimatch', 'melbet', '1win',
      'stake.com', 'richads', 'adcash', 'galaksion', 'clickstar',
      'rollerads', 'clickaine', 'syndication.exoclick', 'exosrv',
      'criteo', 'pubmatic', 'rubiconproject', 'casalemedia',
      'taboola', 'outbrain', 'adnxs', 'smartadserver'
    ];

    for (let i = 0; i < adKeywords.length; i++) {
      if (host.includes(adKeywords[i])) {
        return true;
      }
    }

    const path = parsed.pathname.toLowerCase();
    if (
      path.includes('/ads/') ||
      path.includes('/popunder') ||
      path.includes('/banner/') ||
      path.includes('/adserver') ||
      path.includes('/adservice') ||
      path.endsWith('/popup.js') ||
      path.endsWith('/ads.js') ||
      path.endsWith('/show_ads.js') ||
      path.endsWith('/ad.js')
    ) {
      return true;
    }
  } catch {}

  return false;
}

