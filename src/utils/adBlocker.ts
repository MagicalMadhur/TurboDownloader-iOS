// Ad & tracker blocking rules for the built-in browser
// This provides basic ad blocking similar to Brave

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
  
  // Facebook trackers
  '*.facebook.net',
  'connect.facebook.net',
  'pixel.facebook.com',
  
  // Common ad domains
  '*.adnxs.com',
  '*.adsrvr.org',
  '*.advertising.com',
  '*.taboola.com',
  '*.outbrain.com',
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
  '*.adskeeper.co.uk',
  '*.adtechus.com',
  '*.bidswitch.net',
  '*.buzzfeed.com/ads',
  '*.contextweb.com',
  '*.districtm.io',
  '*.exoclick.com',
  '*.liveintent.com',
  '*.mathtag.com',
  '*.mopub.com',
  '*.quantserve.com',
  '*.revcontent.com',
  '*.scorecardresearch.com',
  '*.sharethrough.com',
  '*.smartadserver.com',
  '*.spotxchange.com',
  '*.tapad.com',
  '*.turn.com',
  '*.yieldmo.com',
  
  // Trackers
  '*.hotjar.com',
  '*.mixpanel.com',
  '*.segment.com',
  '*.amplitude.com',
  '*.branch.io',
  '*.adjust.com',
  '*.appsflyer.com',
  '*.kochava.com',
  '*.singular.net',
  
  // Pop-up / redirect ad networks
  '*.popads.net',
  '*.popcash.net',
  '*.propellerads.com',
  '*.juicyads.com',
  '*.trafficjunky.com',
  '*.clickadu.com',
  '*.hilltopads.com',
];

// CSS injection to hide common ad elements
export const AD_HIDE_CSS = `
  [class*="ad-"], [class*="ads-"], [class*="advert"],
  [id*="ad-"], [id*="ads-"], [id*="advert"],
  [class*="banner"], [class*="sponsor"],
  iframe[src*="ad"], iframe[src*="doubleclick"],
  div[data-ad], div[data-ads], div[data-advert],
  .ad-container, .ad-wrapper, .ad-slot, .ad-unit,
  .ad-banner, .ad-box, .ad-frame, .ad-overlay,
  #ad-container, #ad-wrapper, #ad-slot,
  .google-ad, .adsense, .adsbygoogle,
  ins.adsbygoogle, .ad-placeholder {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    max-height: 0 !important;
    overflow: hidden !important;
  }
`;

// JavaScript injection to block ads
export const AD_BLOCK_JS = `
  (function() {
    'use strict';
    
    // Block popup windows
    window._originalOpen = window.open;
    window.open = function() { return null; };
    
    // Block alert/confirm for ad popups
    var origAlert = window.alert;
    window.alert = function(msg) {
      if (typeof msg === 'string' && (
        msg.toLowerCase().includes('ad') ||
        msg.toLowerCase().includes('subscribe') ||
        msg.toLowerCase().includes('notification')
      )) return;
      return origAlert.call(window, msg);
    };
    
    // Remove ad elements periodically
    function removeAds() {
      var selectors = [
        '[class*="ad-"]', '[class*="ads-"]', '[id*="ad-"]',
        'iframe[src*="ad"]', 'iframe[src*="doubleclick"]',
        '.adsbygoogle', 'ins.adsbygoogle',
        '[data-ad]', '.ad-container', '.ad-wrapper'
      ];
      selectors.forEach(function(sel) {
        try {
          document.querySelectorAll(sel).forEach(function(el) {
            el.style.display = 'none';
            el.style.height = '0';
            el.style.overflow = 'hidden';
          });
        } catch(e) {}
      });
    }
    
    // Run on load and periodically
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', removeAds);
    } else {
      removeAds();
    }
    setInterval(removeAds, 2000);
    
    // Observe DOM changes for dynamically injected ads
    var observer = new MutationObserver(function() { removeAds(); });
    observer.observe(document.body || document.documentElement, {
      childList: true, subtree: true
    });
  })();
  true;
`;

// Check if a URL should be blocked
export function shouldBlockUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return AD_BLOCK_RULES.some(rule => {
    const domain = rule.replace('*.', '').replace('*', '');
    return lowerUrl.includes(domain);
  });
}
