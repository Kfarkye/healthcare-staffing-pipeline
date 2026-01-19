(function() {
  const doctype = '<!DOCTYPE html>';
  const html = doctype + '\n' + document.documentElement.outerHTML;
  const title = (document.title || 'nova_profile').trim();
  
  chrome.runtime.sendMessage({
    action: "downloadHtml",
    data: {
      htmlContent: html,
      title: title,
      pageUrl: location.href
    }
  });
})();