// background.js

// Import Supabase and your config
importScripts('supabase.js', 'config.js');

// Initialize the Supabase client
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// This is your working function - it stays the same.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id || !tab.url) return;
  
  if (!tab.url.includes("nova.ayahealthcare.com")) {
    console.log("Not on Nova");
    return;
  }
  
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  } catch (err) {
    console.error("Failed to inject:", err);
  }
});

// THIS IS THE UPGRADED PART
// It now sends data to Supabase instead of downloading a file.
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request?.action !== "downloadHtml") return;

  const { htmlContent, title, pageUrl } = request.data || {};

  // Extract candidate ID and clean up the name
  const candidateIdMatch = pageUrl.match(/\/recruiting\/candidates\/(\d+)\b/);
  const candidateId = candidateIdMatch ? parseInt(candidateIdMatch[1], 10) : null;
  const candidateName = title.replace('Candidate: ', '').replace(' - Nova', '').trim();

  console.log(`Attempting to save profile to Supabase for: ${candidateName} (ID: ${candidateId})`);

  try {
    const { data, error } = await supabaseClient
      .from('captured_profiles')
      .insert({
        candidate_id: candidateId,
        candidate_name: candidateName,
        profile_url: pageUrl,
        raw_html: htmlContent
      });

    if (error) {
      throw error;
    }

    console.log('Successfully saved to Supabase.');
    
    // Show success notification to user
    chrome.action.setBadgeText({
      text: '✓',
      tabId: sender.tab?.id
    });
    chrome.action.setBadgeBackgroundColor({
      color: '#10B981'
    });
    
    // Clear badge after 3 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({
        text: '',
        tabId: sender.tab?.id
      });
    }, 3000);
    
  } catch (error) {
    console.error('Error saving to Supabase:', error.message);
    
    // Show error notification to user
    chrome.action.setBadgeText({
      text: '✗',
      tabId: sender.tab?.id
    });
    chrome.action.setBadgeBackgroundColor({
      color: '#EF4444'
    });
    
    // Clear badge after 5 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({
        text: '',
        tabId: sender.tab?.id
      });
    }, 5000);
  }
  
  sendResponse({ok: true}); 
});