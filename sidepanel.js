import { openDB } from './libs/idb.mjs';
import { parseTikTokUniqueId } from './common.js';

// Fetch saved videos from IndexedDB
async function fetchVideos(username) {
  try {
    const dbName = `${username}_videosDB`;
    const db = await openDB(dbName, 1);

    // Get all videos from the 'videos' object store
    const videos = await db.getAll('videos');
    return videos;
  } catch (error) {
    console.error("Error fetching videos:", error);
    return [];
  }
}

// Get the TikTok username dynamically from open tabs
async function getTikTokUsername() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({}, (tabs) => {
      const tiktokTab = tabs.find(tab => tab.url && tab.url.includes("https://www.tiktok.com/"));
      if (!tiktokTab) {
        reject("No TikTok tab found.");
        return;
      }

      const uniqueId = parseTikTokUniqueId(tiktokTab.url);
      if (!uniqueId) {
        reject("Error parsing TikTok user profile page.");
        return;
      }

      resolve(uniqueId);
    });
  });
}

// Render videos in the sidebar
function renderVideos(videos) {
  const container = document.getElementById('video-container');
  container.innerHTML = ""; // Clear existing content

  if (videos.length === 0) {
    container.textContent = "No videos backed up yet.";
    return;
  }

  videos.forEach((video) => {
    const videoBlob = video.videoBlob;
    const videoURL = URL.createObjectURL(videoBlob);

    // Create a video element
    const videoElement = document.createElement('video');
    videoElement.src = videoURL;
    videoElement.controls = true;
    videoElement.style.width = "100%";
    videoElement.style.marginBottom = "10px";

    container.appendChild(videoElement);
  });
}

// Main function to handle video display
async function displayVideos() {
  try {
    // Dynamically fetch the username
    const username = await getTikTokUsername();
    console.log("Fetched username:", username);

    // Fetch videos from IndexedDB
    const videos = await fetchVideos(username);

    // Render videos in the container
    renderVideos(videos);
  } catch (error) {
    console.error(error);
    const container = document.getElementById('video-container');
    container.textContent = error;
  }
}

// Run the display function when the page loads
document.addEventListener('DOMContentLoaded', displayVideos);

