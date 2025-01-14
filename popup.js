import { openDB } from './libs/idb.mjs';
import { reactive, watch } from './libs/vue.runtime.esm-browser.prod.js';
import { 
    parseTikTokUniqueId, 
    initializeLoggedInUserDB,
    initializeProfilesDB,
    initSettingsDB,
    getToggleState,
    initializeFollowListDB, 
    initializeVideosDB 
} from './common.js';

feather.replace();


async function getLastLoggedInUser() {
    try {
      // Open the database
      const db = await openDB("LoggedInUserDB", 1);
  
      // Ensure the "Accounts" store exists
      if (!db.objectStoreNames.contains("Accounts")) {
        console.warn("No 'Accounts' store found in the database.");
        return null;
      }
  
      // Open a transaction and get all keys
      const tx = db.transaction("Accounts", "readonly");
      const store = tx.objectStore("Accounts");
      const users = await store.getAll();
  
      // Close the transaction
      await tx.done;
  
      if (users.length === 0) {
        console.log("No users found in the 'Accounts' store.");
        return null;
      }
  
      // Return the last user (most recently added)
      return users[users.length - 1];
    } catch (error) {
      console.error("Error retrieving the last logged-in user:", error);
      return null;
    }
  }
  


// Function to lookup user pofile in IndexedDB using idb
async function lookupUserInIDB(uniqueId) {
    const db = await openDB('ProfilesDB', 1);
    return db.get('userInfo', uniqueId);
}



// Function to count records in a specified store of a user's database
async function getFollowListsCounts(username, storeName) {
    try {
      // Construct the database name
      const dbName = `${username}_FollowListsDB`;
  
      // Attempt to open the database
      let db;
      try {
        db = await openDB(dbName, 1);
      } catch (dbError) {
        console.warn(`Database "${dbName}" does not exist.`);
        return null; // Fail quietly
      }
  
      // Check if the specified store exists
      if (!db.objectStoreNames.contains(storeName)) {
        console.warn(`Store "${storeName}" does not exist in database "${dbName}".`);
        return null; // Fail quietly
      }
  
      // Open a transaction for the specified store and count records
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const count = await store.count();
  
      // Wait for the transaction to complete
      await transaction.done;
  
      console.log(`Total records in "${storeName}" of ${username}'s database:`, count);
      return count;
    } catch (error) {
      console.error(`Unexpected error counting records in "${storeName}" of ${username}'s database:`, error);
      return null; // Fail quietly on any other error
    }
  }
  

// Function to count backed-up videos
async function countBackedUpVideos(username) {
    try {
        const dbName = `${username}_videosDB`;
        const db = await openDB(dbName, 1);

        // Check if the 'videos' object store exists
        if (!db.objectStoreNames.contains('videos')) {
            console.log(`No 'videos' store found for user: ${username}. Returning count as 0.`);
            return 0; // No videos store means no videos
        }

        // Count all entries in the 'videos' object store
        const videoCount = await db.count('videos');
        console.log(`User: ${username} has ${videoCount} backed-up videos.`);
        return videoCount;
    } catch (error) {
        console.error(`Error counting backed-up videos for user: ${username}:`, error);
        return 0; // Return 0 if there's an error
    }
}



// Reactive user data
const userData = reactive({
    username: "",
    fullName: "",
    profileImage: "",
    stats: {
        following: 0,
        followers: 0,
        likes: 0,
        videos: 0,
    },
    toggles: [
        {
            id: "following-toggle",
            progressBarId: "following-progress",
            backupLabelId: "following-backup",
            checked: true,
            progress: { current: 0, total: 100 },
            color: "bg-cyan-400"
        },
        {
            id: "video-toggle",
            progressBarId: "video-progress",
            backupLabelId: "video-backup",
            checked: true,
            progress: { current: 0, total: 100 },
            color: "bg-rose-600"
        }
    ]
});

// Utility function to update DOM elements
function setData(id, data, isImage = false) {
    const element = document.getElementById(id);

    console.log(id, data)

    if (element) {
        isImage ? (element.src = data) : (element.textContent = data);
    }
}

// Update progress bar UI
function updateProgressBar(toggle) {
    const progressBar = document.getElementById(toggle.progressBarId);
    const label = document.getElementById(toggle.backupLabelId);
    if (progressBar && label) {
        progressBar.style.width = `${(toggle.progress.current / toggle.progress.total) * 100}%`;
        progressBar.className = `absolute top-0 left-0 h-2 rounded-full ${
            toggle.checked ? toggle.color : "bg-zinc-600"
        }`;
        label.textContent = `Backed Up: ${toggle.progress.current} / ${toggle.progress.total}`;
    }
}


async function initializeToggleListeners() {
    //const db = await initSettingsDB();
    for (const toggle of userData.toggles) {
        const savedState = await getToggleState(toggle.id);
        toggle.checked = savedState;

        const toggleElement = document.getElementById(toggle.id);
        if (toggleElement) {
            toggleElement.checked = toggle.checked;

            toggleElement.addEventListener('change', async (event) => {
                toggle.checked = event.target.checked;
                updateProgressBar(toggle);
                await saveToggleState(toggle.id, toggle.checked); // Save state to IndexedDB
            });
        }
    }
}


var uniqueIdLoggedIn;

// Main logic to load data
chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {

    // Initialize 'LoggedInUserDB' and 'ProfilesDB'
    await initializeLoggedInUserDB();

    const lastUser = await getLastLoggedInUser();
    // let uniqueIdLoggedIn;

    if (lastUser) {
        uniqueIdLoggedIn = lastUser.data.username;
        console.log("Last logged-in user:", lastUser);

        // Show logged-in section, hide not-logged-in section
        document.getElementById("not-logged-in").classList.add("hidden");
        document.getElementById("profile-not-saved").classList.remove("hidden");
        document.getElementById("logged-in").classList.add("hidden");
        
    } else {
        // Show not-logged-in section
        document.getElementById("not-logged-in").classList.remove("hidden");
        document.getElementById("logged-in").classList.add("hidden");
        console.log("No logged-in users found.");
        return;
    }

    const currentUrl = tabs[0]?.url;
    const uniqueId = parseTikTokUniqueId(currentUrl);

    if(uniqueId) {
        document.getElementById("profile-not-saved").classList.add("hidden");
        document.getElementById("logged-in").classList.remove("hidden");
    } else {
        console.log("User needs to navigate to their profile...")

        /*
        // Tell background.js to navigate to user's profile page
        chrome.runtime.sendMessage({ action: 'navigate', url: `https://www.tiktok.com/profile`});
        */
    }

    // initialize various user databases
    await initializeFollowListDB(uniqueId);
    await initializeVideosDB(uniqueId);

    if (!uniqueId && !uniqueIdLoggedIn) {
        console.log("Please log in and visit a TikTok user profile page.");
        return;
    }

    try {

        await initializeProfilesDB();

        if(uniqueId) {
            var userInfo = await lookupUserInIDB(uniqueId);
        } else if (uniqueIdLoggedIn) {
            var userInfo = await lookupUserInIDB(uniqueIdLoggedIn);
        }

        if (userInfo) {
            // Update reactive userData object
            Object.assign(userData, {
                username: userInfo.user.uniqueId,
                fullName: userInfo.user.nickname,
                profileImage: userInfo.user.avatarLarger,
                stats: {
                    following: userInfo.stats.followingCount,
                    followers: userInfo.stats.followerCount,
                    likes: userInfo.stats.heartCount,
                    videos: userInfo.stats.videoCount,
                },
            });
    
            // Update progress.total dynamically
            userData.toggles[0].progress.total = userData.stats.following; // "following" toggle
            userData.toggles[1].progress.total = userData.stats.videos; // "videosCreated" toggle
    
            
            // Query the count of "following" records from the user's database
            const followingCount = await getFollowListsCounts(userInfo.user.uniqueId, "Following");
            if (followingCount !== null) {
                userData.toggles[0].progress.current = followingCount; // Update the progress current
                updateProgressBar(userData.toggles[0]); // Update progress bar
            }

            // Query the count of "video" records from the user's database
            const videosCount = await countBackedUpVideos(userInfo.user.uniqueId);
            if (videosCount !== null) {
                userData.toggles[1].progress.current = videosCount; // Update the progress current
                updateProgressBar(userData.toggles[1]); // Update progress bar
            }
            

        } else {
            console.log("User not found in IndexedDB.");
        }
    } catch (error) {
        console.error("Error during IndexedDB lookup:", error);
    }
    
});

// Watch for reactive data changes and update UI
watch(() => userData, (newValue) => {
    setData("username", `@${newValue.username}`);
    setData("fullname", newValue.fullName);
    setData("profile-image", newValue.profileImage, true);
    Object.keys(newValue.stats).forEach((key) => setData(key, (newValue.stats[key]).toLocaleString()));
    newValue.toggles.forEach(updateProgressBar);
}, { deep: true });


////////////////////////////////////////////////////////////////////
/////////////////// Settings and Toggles ///////////////////////////
////////////////////////////////////////////////////////////////////

async function saveToggleState(toggleId, state) {
    const db = await initSettingsDB();
    const tx = db.transaction('toggles', 'readwrite');
    const store = tx.objectStore('toggles');
    await store.put(state, toggleId); // Save the state with the toggleId as the key
    await tx.done;
}


// Initialize Settings DB and toggles UI/UX
document.addEventListener("DOMContentLoaded", async () => {
    await initSettingsDB(); // Initialize the SettingsDB
    initializeToggleListeners();
});


////////////////////////////////////////////////////////////////////
////////////////// Giving Love with Hearts  ////////////////////////
////////////////////////////////////////////////////////////////////

async function initHeartDB() {
    const db = await openDB('HeartCountDB', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('hearts')) {
          db.createObjectStore('hearts');
        }
      },
    });
    return db;
  }
  
async function getHeartCount(db) {
    return (await db.get('hearts', 'heartCount')) || 0;
}

async function incrementHeartCount(db) {
    const currentCount = (await db.get('hearts', 'heartCount')) || 0;
    const newCount = currentCount + 1;
    await db.put('hearts', newCount, 'heartCount');
    return newCount;
}

async function updateHeartUI() {
    const db = await initHeartDB();
    const count = await getHeartCount(db);
    document.getElementById('heart-count').textContent = `+ ${count}`;

    document.getElementById('heart-button').addEventListener('click', async () => {
        const newCount = await incrementHeartCount(db);
        document.getElementById('heart-count').textContent = `+ ${newCount}`;
    });
}

// Heart Count UI
document.addEventListener('DOMContentLoaded', updateHeartUI);


/////// Open Side Panel ////////
document.getElementById("see-saved-videos").addEventListener("click", () => {

    chrome.windows.getCurrent({ populate: true }, (window) => {
        chrome.sidePanel.open({ windowId: window.id });
    });

  });
  


/*

// Navigate to User Profile on Button Press
document.addEventListener('DOMContentLoaded', () => {
    const navigateButton = document.getElementById('navigateProfile');
    
    if (navigateButton) {
      navigateButton.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent default anchor behavior
        chrome.runtime.sendMessage({ action: 'navigate', url: `https://www.tiktok.com/@${uniqueIdLoggedIn}` });
      });
    }
  });

*/