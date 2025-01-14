import { openDB } from './libs/idb.mjs';

// Function to parse TikTok profile URL and get the uniqueId
export function parseTikTokUniqueId(url) {
    if (typeof url !== "string" || !url) {
        console.error("Invalid URL: URL is undefined or not a string.");
        return null;
    }

    if (!url.startsWith("https://www.tiktok.com/") || !url.includes("@")) {
        console.log("Invalid URL: Does not start with TikTok base or lacks '@'. Url is:", url);
        return null;
    }

    const regex = /^https:\/\/www\.tiktok\.com\/@([^\/\?]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}


// Initialize "LoggedInUserDB" 
export async function initializeLoggedInUserDB() {
    return openDB("LoggedInUserDB", 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("Accounts")) {
          const store = database.createObjectStore("Accounts", { keyPath: "data.username" });
          store.createIndex("secUid", "data.sec_user_id", { unique: true });
          store.createIndex("id", "data.user_id_str", { unique: true });
        }
      },
    });
  }


// Initialize "ProfilesDB" and the object store
export async function initializeProfilesDB() {
    return openDB("ProfilesDB", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("userInfo")) {
          const store = db.createObjectStore("userInfo", { keyPath: "user.uniqueId" });
          // Create an index for `secUid`
          store.createIndex("secUid", "user.secUid", { unique: true });
        } else {
          // If store exists, check for missing indexes
          const transaction = db.transaction("userInfo", "readwrite");
          const store = transaction.objectStore("userInfo");
          if (!store.indexNames.contains("secUid")) {
            store.createIndex("secUid", "user.secUid", { unique: true });
          }
        }
      },
    });
  }


// Inititate Settings DB to save toggles
export async function initSettingsDB() {
    const db = await openDB('SettingsDB', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('toggles')) {
          db.createObjectStore('toggles');
        }
      },
    });
    return db;
  }


// Get the specified Toggle state (true or false) setting from idb
export async function getToggleState(toggleId) {
    const db = await initSettingsDB();
    const tx = db.transaction('toggles', 'readonly');
    const store = tx.objectStore('toggles');
    const state = await store.get(toggleId); // Retrieve the state by toggleId
    await tx.done;
    return state ?? true; // Default to `true` if no state is saved
}
  

// Initialized a dynamic Follow List database for a specific user
export async function initializeFollowListDB(username) {
    const dbName = `${username}_FollowListsDB`;
    return openDB(dbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("Following")) {
          db.createObjectStore("Following", { keyPath: "user.uniqueId" });
        }
        if (!db.objectStoreNames.contains("Followers")) {
          db.createObjectStore("Followers", { keyPath: "user.uniqueId" });
        }
      },
    });
  }

// Initialize a dynamic Videos database for a specific user
export async function initializeVideosDB(username) {
    const dbName = `${username}_videosDB`;
    return openDB(dbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("videosData")) {
          db.createObjectStore("videosData", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("videos")) {
          db.createObjectStore("videos", { keyPath: "id" });
        }
      },
    });
  }