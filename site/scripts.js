feather.replace();

// Mock data from an API
const userData = {
  username: "kikirogers",
  fullName: "Kiki Rogers",
  profileImage: "profile.png",
  stats: {
    following: 123,
    followers: 45600,
    likes: 78900
  },
  videosCreated: 250,
  toggles: [
    {
      id: "following-toggle",
      progressBarId: "following-progress",
      backupLabelId: "following-backup",
      checked: true,
      progress: { current: 50, total: 123 },
      color: "bg-cyan-400"
    },
    {
      id: "video-toggle",
      progressBarId: "video-progress",
      backupLabelId: "video-backup",
      checked: true,
      progress: { current: 200, total: 250 },
      color: "bg-rose-600"
    }
  ]
};

// Utility function to set text or image content
function setData(id, data, isImage = false) {
  const element = document.getElementById(id);
  if (element) {
    isImage ? (element.src = data) : (element.textContent = data);
  }
}

// Utility function to update progress bar
function updateProgressBar(progressBarId, labelId, progress, color, isActive) {
  const progressBar = document.getElementById(progressBarId);
  const label = document.getElementById(labelId);
  if (progressBar && label) {
    // Update progress bar width and color
    progressBar.style.width = `${(progress.current / progress.total) * 100}%`;
    progressBar.className = `absolute top-0 left-0 h-2 rounded-full ${
      isActive ? color : "bg-zinc-600"
    }`;

    // Update progress label
    label.textContent = `Backed Up: ${progress.current} / ${progress.total}`;
  }
}

// Initialize data in the HTML
function initializeData() {
  setData("username", `@${userData.username}`);
  setData("fullname", userData.fullName);
  setData("profile-image", userData.profileImage, true); // Set as image
  setData("following", userData.stats.following);
  setData("followers", userData.stats.followers.toLocaleString());
  setData("likes", userData.stats.likes.toLocaleString());
  setData("videos-created", userData.videosCreated);

  // Initialize toggle progress bars
  userData.toggles.forEach((toggle, index) => {
    updateProgressBar(
      toggle.progressBarId,
      toggle.backupLabelId,
      toggle.progress,
      toggle.color,
      toggle.checked
    );

    // Attach event listener for toggles
    const toggleElement = document.getElementById(toggle.id);
    if (toggleElement) {
      toggleElement.checked = toggle.checked;
      toggleElement.addEventListener("change", (event) => {
        toggle.checked = event.target.checked;
        updateProgressBar(
          toggle.progressBarId,
          toggle.backupLabelId,
          toggle.progress,
          toggle.color,
          toggle.checked
        );
      });
    }
  });
}

// Initialize the page
initializeData();

document.addEventListener("DOMContentLoaded", () => {
  const notLoggedIn = document.getElementById("not-logged-in");
  const loggedIn = document.getElementById("logged-in");
  const settingsButton = document.getElementById("settings-button");

  settingsButton.addEventListener("click", () => {
    notLoggedIn.classList.toggle("hidden");
    loggedIn.classList.toggle("hidden");
  });
});

