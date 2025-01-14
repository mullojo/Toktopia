import { openDB } from './libs/idb.mjs';
import { 
  parseTikTokUniqueId, 
  initializeLoggedInUserDB,
  initializeProfilesDB,
  initSettingsDB,
  getToggleState,
  initializeFollowListDB, 
  initializeVideosDB 
} from './common.js';



navigator.storage.estimate().then(estimate => {
  console.log(`Quota: ${estimate.quota / (1024 * 1024)} MB`);
  console.log(`Usage: ${estimate.usage / (1024 * 1024)} MB`);
});

// Prevent side panel from opening when the action icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error) => {
  console.error("Error setting side panel behavior:", error);
});



/*

// Listen for message to navigate to user's profile page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'navigate' && message.url) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { url: message.url });
      }
    });
  }
});

*/

/////////////////////////////////////////////////////////////
//////////////////// Logged In Users ////////////////////////
/////////////////////////////////////////////////////////////

var loggedInUsername;

// Initialize a Set to store processed odinIds
const processedOdinIds = new Set();

chrome.webRequest.onCompleted.addListener(
  async (details) => {
    try {
      const url = new URL(details.url);

      // Check if the URL matches the desired pattern
      if (url.pathname.includes("info/")) {
        // Extract odinId from the query parameters
        const queryParams = new URLSearchParams(url.search);
        const odinId = queryParams.get("odinId");

        // Skip if odinId is already processed or missing
        if (!odinId || processedOdinIds.has(odinId)) {
          console.log(`Duplicate or missing odinId (${odinId}). Skipping.`);
          return;
        }

        // Add the odinId to the Set to prevent reprocessing
        processedOdinIds.add(odinId);

        // Fetch the response from the intercepted URL
        const response = await fetch(details.url);
        const data = await response.json();

        // Ensure "LoggedInUserDB" exists and open it
        const db = await initializeLoggedInUserDB();

        // Save the response data to the database
        await db.put("Accounts", data);
        console.log("Saved logged-in user data:", data);
        loggedInUsername = data.data.username;
      }
    } catch (error) {
      console.error("Error processing intercepted request:", error);
    }
  },
  { urls: ["*://www.tiktok.com/passport/web/account/info/*"] },
);




/////////////////////////////////////////////////////////////
//////////////////// Profiles Data //////////////////////////
/////////////////////////////////////////////////////////////


// Cache to track processed user IDs
const processedUsers = new Set();

// Listen to network requests matching the pattern
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    try {
      const url = new URL(details.url);

      // Check if the URL matches the desired pattern
      if (url.pathname.includes("detail/")) {
        // Extract user ID from the URL or other reliable source if possible
        const queryParams = new URLSearchParams(url.search);
        const uniqueId = queryParams.get("uniqueId");

        console.log("Intercepted Profile Request 👩‍🦰 for:", uniqueId);

        // Skip if user ID is already processed
        if (uniqueId && processedUsers.has(uniqueId)) {
          console.log(`User ${uniqueId} already processed. Skipping.`);
          return;
        }

        // Fetch the response body only if it's not processed
        const responseBody = await fetch(details.url);
        const jsonData = await responseBody.json();

        // Check if userInfo exists
        if (jsonData.userInfo) {
          const userInfo = jsonData.userInfo;
          const userId = userInfo.user.uniqueId;

          // Add user ID to the cache
          processedUsers.add(userId);

          // Process userInfo
          console.log("Intercepted User Info:", userInfo);

          (async () => {
            try {
                // Process the userInfo object
                const updatedUserInfo = await processUserInfo(userInfo);
                console.log("Updated userInfo with Base64 avatar:", updatedUserInfo);
        
                // Save userInfo to IndexedDB
                await saveProfileToIDB(updatedUserInfo);
                console.log("userInfo saved to IndexedDB successfully.");

            } catch (error) {
                console.error("Error processing or saving userInfo:", error);
            }
        })();
          
        }
      }
    } catch (error) {
      console.error("Error processing request:", error);
    }
  },
  { urls: ["*://*.tiktok.com/api/user/detail/*"] }
);

async function processUserInfo(userInfo) {
  // Helper function to fetch and convert an image URL to Base64
  async function fetchImageAsBase64(url) {
      try {
          const response = await fetch(url);
          const blob = await response.blob();

          return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob); // Converts blob to Base64
          });
      } catch (error) {
          console.error("Error fetching or converting image:", error);
          return null;
      }
  }

  // Only process the 'avatarLarger' key
  const avatarBase64 = await fetchImageAsBase64(userInfo.user.avatarLarger);
  if (avatarBase64) {
      userInfo.user.avatarLarger = avatarBase64; // Replace the URL with Base64 data
  } else {
      console.warn("Failed to convert avatarLarger to Base64");
  }

  // Remove other image keys (if present)
  delete userInfo.user.avatarMedium;
  delete userInfo.user.avatarThumb;

  return userInfo; // Return the updated object
}



async function saveProfileToIDB(userInfo) {
  if (!userInfo.user?.uniqueId) {
    console.error("UserInfo object must have a `user.uniqueId` field.");
    return;
  }

  try {
    // Open or create the database and the object store
    const db = await initializeProfilesDB();

    // Save the userInfo object
    await db.put("userInfo", userInfo);
    console.log("User Info saved to IndexedDB:", userInfo);
  } catch (error) {
    console.error("Error working with IndexedDB:", error);
  }
}




/////////////////////////////////////////////////////////////////
////////////////// Following and Followers Lists ////////////////
/////////////////////////////////////////////////////////////////

// Function to lookup user in IndexedDB using idb
async function lookupUserInProfilesDB(secUid) {
  try {
    const db = await openDB("ProfilesDB", 1);
    // Use the `secUid` index to find the matching record
    const store = db.transaction("userInfo", "readonly").objectStore("userInfo");
    const index = store.index("secUid");
    const record = await index.get(secUid);

    if (record) {
      // Return the uniqueId field
      return record.user.uniqueId;
    } else {
      console.log("User profile not yet found in ProfilesDB");
      return null;
    }
  } catch (error) {
    console.error("Error querying IndexedDB:", error);
    return null;
  }
}


// Set to track processed minCursor values per secUid and scene
const processedCursors = new Map();

// Main logic to intercept TikTok API requests
chrome.webRequest.onCompleted.addListener(
  async function (details) {
    const url = new URL(details.url);
    const path = url.pathname;
    const params = url.searchParams;

    // Filter by the correct path and count
    if (path === "/api/user/list/" && params.has("scene") && params.has("secUid")) {
      const minCursor = params.get("minCursor");
      const scene = params.get("scene");
      const secUid = params.get("secUid");

      // Initialize cursor tracking for this secUid and scene
      const cursorKey = `${secUid}_${scene}`;
      if (!processedCursors.has(cursorKey)) {
        processedCursors.set(cursorKey, new Set());
      }

      const sceneCursors = processedCursors.get(cursorKey);

      // Check for duplicate minCursor
      if (sceneCursors.has(minCursor)) {
        console.log(`Duplicate request detected for secUid: ${secUid}, scene: ${scene}, minCursor: ${minCursor}`);
        return;
      }

      // Check User Settings Following List Toggle
      await initSettingsDB();
      const toggleState = await getToggleState('following-toggle');
      if(!toggleState){
        console.log("User has turned off Follow list backups");
        return;
      }

      // Mark the minCursor as processed for this secUid and scene
      sceneCursors.add(minCursor);
      console.log(`Processing request for secUid: ${secUid}, scene: ${scene}, minCursor: ${minCursor}`);


      // Lookup the user in IndexedDB
      const uniqueId = await lookupUserInProfilesDB(secUid);
      console.log("Found uniqueId:", uniqueId);
      if (!uniqueId) {
        console.log("User not found in IndexedDB. Please save user information first.");
        return;
      }

      /*
      // Prevent from Saving of not logged in user follow lists data
      if(loggedInUsername != uniqueId){
        console.log("List data not from logged in profile 🗑️")
        return
      }
      */

      // Fetch the response data
      try {
        const response = await fetch(details.url);
        if (response.ok) {
          const data = await response.json();
          console.log("Response JSON data:", data);

          // Process and save user data
          if (data.userList && Array.isArray(data.userList)) {

            // Process fetch & base64 images for user data asynchronously
            const updatedUsers = await Promise.all(
              data.userList.map(user => processUserInfo(user))
            );

            // Determine the correct store name based on the scene
            const storeName = scene === "21" ? "Following" : scene === "67" ? "Followers" : null;

            if (storeName) {

              const db = await initializeFollowListDB(uniqueId);
              const transaction = db.transaction(storeName, "readwrite");
              const store = transaction.objectStore(storeName);

              try {
                for (const user of updatedUsers) {
                  await store.put(user);
                }
                console.log(`All users successfully saved to ${storeName}`);
              } catch (err) {
                console.error(`Error saving users to ${storeName}:`, err);
              }

              await transaction.done;

            } else {
              console.warn(`Unknown scene: ${scene}. Data not saved.`);
            }
            
            
          } else {
            console.warn("No userList found in the response data.");
          }
        } else {
          console.error(`Error fetching URL: ${details.url}, Status: ${response.status}`);
        }
      } catch (err) {
        console.error("Error during fetch:", err);
      }
    }
  },
  { urls: ["*://*.tiktok.com/api/user/list/*"] } // Filters for specific path
);


/////////////////////////////////////////////////////////////////
///////////////////////// Videos Data ///////////////////////////
/////////////////////////////////////////////////////////////////


// Set to track processed video list cursor values per secUid
const videoListsProcessedCursor = new Map();

// Main logic to intercept TikTok API requests for video lists
chrome.webRequest.onCompleted.addListener(

  async function (details) {
    const url = new URL(details.url);
    const path = url.pathname;
    const params = url.searchParams;

    // Filter by the correct path
    if (path === "/api/post/item_list/") {
      const cursor = params.get("cursor");
      const secUid = params.get("secUid");

      console.log('Found new video list with cursor:', cursor);

      if (!secUid || !cursor) {
        console.error("Missing required parameters: secUid, or cursor.");
        return;
      }

      // Initialize ProfilesDB
      await initializeProfilesDB();

      // Lookup the user in IndexedDB
      const uniqueId = await lookupUserInProfilesDB(secUid);
      
      if (!uniqueId) {
        console.log("User not found in IndexedDB. Please save user information first.");
        return;
      } else {
        console.log("Found uniqueId:", uniqueId);
      }

      // Initialize cursor tracking for this secUid
      if (!videoListsProcessedCursor.has(secUid)) {
        videoListsProcessedCursor.set(secUid, new Set());
      }

      const userVideoCursors = videoListsProcessedCursor.get(secUid);

      // Check for duplicate cursors
      if (userVideoCursors.has(cursor)) {
        console.log(`[TikTok Backup] Duplicate request detected for secUid: ${secUid}, cursor: ${cursor}`);
        return;
      }

      // Check User Settings - Video Toggle
      await initSettingsDB();
      const toggleState = await getToggleState('video-toggle');
      if(!toggleState){
        console.log("User has turned off video backups");
        return;
      }

      // Mark the cursor as processed for this secUid
      userVideoCursors.add(cursor);
      console.log(`[TikTok Backup] Processing request for secUid: ${secUid}, cursor: ${cursor}`);

      // Fetch the response data
      try {
        const response = await fetch(details.url);
        if (response.ok) {
          const data = await response.json();
          console.log("Videos List Response JSON data:", data);

          // Process and save user data
          if (data.itemList && Array.isArray(data.itemList)) {

              const videosList = data.itemList;

              const videoUrlIds = videosList.map(videoData => {
                if ('imagePost' in videoData) {
                  console.log("Image post:", videoData); // Key exists
                  return null; // Return null for image posts (if you don't want to include them)
                } else if (videoData.video?.playAddr) {
                  const videoPath = videoData.video.playAddr;
                  // Extract the unique identifier (last part before '/?')
                  const videoUrlId = videoPath.split('/?')[0].split('/').pop();
                  return videoUrlId;
                } else {
                  console.error("No playAddr or imagePost field found in video data.");
                  return null; // Handle cases where neither field exists
                }
              }).filter(id => id !== null); // Remove null values from the resulting array
              
        
              console.log("list of video url IDs:", videoUrlIds);

              const db = await initializeVideosDB(uniqueId);
              const transaction = db.transaction('videosData', "readwrite");
              const store = transaction.objectStore('videosData');

              try {
                for (const video of data.itemList) {
                  await store.put(video);
                }
                console.log(`All videos successfully saved to videosData`);
              } catch (err) {
                console.error(`Error saving videos to videosData:`, err);
              }

              await transaction.done;

            
          } else {
            console.warn("No itemList found in the response data.");
          }
        } else {
          console.error(`Error fetching URL: ${details.url}, Status: ${response.status}`);
        }
      } catch (err) {
        console.error("Error during fetch:", err);
      }
    }
  },
  { urls: ["*://*.tiktok.com/api/post/item_list/*"] } // Filters for specific path
);


/////////////////////////////////////////////////////////////////
//////////////////////// Videos Backups /////////////////////////
/////////////////////////////////////////////////////////////////


// Listener for completed web requests
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    try {
      const url = new URL(details.url);

      // Check if the URL matches the desired pattern
      if (url.pathname.includes("video/tos/")) {
        console.log("Intercepted TikTok video URL:", details.url);

        const videoUrlId = details.url.split('/?')[0].split('/').pop();
        if (!videoUrlId) {
          console.warn("No unique ID found in URL:", url.href);
          return;
        }

        // Check User Settings - Video Toggle
        await initSettingsDB();
        const toggleState = await getToggleState('video-toggle');
        if(!toggleState){
          console.log("User has turned off video backups");
          return;
        }


        // Dynamically fetch the username from any open TikTok tab
        chrome.tabs.query({}, async (tabs) => {
          const tiktokTab = tabs.find(tab => tab.url && tab.url.includes("https://www.tiktok.com/"));
          if (!tiktokTab) {
            console.log("No TikTok tab found.");
            return;
          }

          const uniqueId = parseTikTokUniqueId(tiktokTab.url);

          if (!uniqueId) {
            console.log("Url does not contain @username, video ignored");
            return;
          }

          try {
            const db = await initializeVideosDB(uniqueId);
            console.log(`Database initialized for user: ${uniqueId}`);

            // Check if the video already exists in the database
            const existingVideo = await db.get("videos", videoUrlId);
            if (existingVideo) {
              console.log("Video already backed up:", videoUrlId);
              return;
            }

            // Fetch the video and store it in the database
            const response = await fetch(url.href);
            if (!response.ok) {
              throw new Error(`Failed to fetch video: ${response.statusText}`);
            }
            const blob = await response.blob();

            await db.put("videos", { id: videoUrlId, videoBlob: blob });
            console.log("Video successfully backed up:", videoUrlId);
          } catch (error) {
            console.error("Error initializing database or saving video:", error);
          }
        });
      }
    } catch (error) {
      console.error("Error handling web request:", error);
    }
  },
  { urls: ["*://*.tiktok.com/video/tos/*"] } // Filter for TikTok video CDN links
);