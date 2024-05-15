// * Everything related to the Agora Real-Time Communication
const APP_ID = "2c99866a726b499dbf81462ab8b89028";

let uid = sessionStorage.getItem("uid");
if (!uid) {
  uid = String(Math.floor(Math.random() * 10000));
  // * setting the user in session storage with unique id for every user
  sessionStorage.setItem("uid", uid);
}

let token = null;
let client;

// * for real time messaging
let rtmClient;
let channel;

// ? Sample room link: room.html?room=65784
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get("room");

if (!roomId) {
  roomId = "main";
}

// * Cannot enter a room without a name
let displayName = sessionStorage.getItem("display_name");
if (!displayName) {
  window.location = "lobby.html";
}

// * Actual audio and video stream
let localTracks = [];
// * remote users will be made an object with key:value pairs for every users joining
let remoteUsers = {};

//* Variables for the screen sharing
let localScreenTracks;
let sharingScreen = false;

let joinRoomInit = async () => {
  rtmClient = await AgoraRTM.createInstance(APP_ID);
  await rtmClient.login({ uid, token });

  await rtmClient.addOrUpdateLocalUserAttributes({ name: displayName });

  channel = await rtmClient.createChannel(roomId);
  await channel.join();

  channel.on("MemberJoined", handleMemberJoined);
  channel.on("MemberLeft", handleMemberLeft);
  channel.on("ChannelMessage", handleChannelMessage);

  getMembers();
  addBotMessageToDom(`Welcome to the room ${displayName} !!!`);

  client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  //* Joined the app with agora App_id, specific room_id, individual token and user_id
  await client.join(APP_ID, roomId, token, uid);

  //* Publish the user to the main channel
  client.on("user-published", handleUserPublished);
  //* Event listener to check if user exits
  client.on("user-left", handleUserLeft);

  //  joinStream();
};

let joinStream = async () => {
  document.getElementById("join-btn").style.display = "none";
  document.getElementsByClassName("stream__actions")[0].style.display = "flex";

  //* Ask for access to audio and video feed
  localTracks = await AgoraRTC.createMicrophoneAndCameraTracks(
    {},
    {
      // * Setting the video quality
      setVideoEncoderConfiguration: {
        width: { min: 640, ideal: 1920, max: 1920 },
        height: { min: 480, ideal: 1080, max: 1080 },
      },
    }
  );

  let player = `<div class="video__container" id="user-container-${uid}">
                    <div class="video-player" id="user-${uid}"></div>
                </div>`;
  document
    .getElementById("streams__container")
    .insertAdjacentHTML("beforeend", player);
  document
    .getElementById(`user-container-${uid}`)
    .addEventListener("click", expandVideoFrame);
  //* localTracks[1] for video and localTracks[0] for audio
  localTracks[1].play(`user-${uid}`);
  await client.publish([localTracks[0], localTracks[1]]);
};

let switchtoCamera = async () => {
  // * Creating a new player
  let player = `<div class="video__container" id="user-container-${uid}">
                  <div class="video-player" id="user-${uid}"></div>
                  </div>`;

  displayFrame.insertAdjacentHTML("beforeend", player);

  await localTracks[0].setMuted(true);
  await localTracks[1].setMuted(true);

  // * this is to remove the pruple color from the buttons
  document.getElementById("mic-btn").classList.remove("active");
  document.getElementById("screen-btn").classList.remove("active");

  // * as the screen share stops, the mic and camera is muted.
  // * then, the user can manually republishes its video and audio stream as required
  localTracks[1].play(`user-${uid}`);
  await client.publish([localTracks[1]]);
};

let handleUserPublished = async (user, mediaType) => {
  //* Adding the user as a key-value pair to the remote users.
  remoteUsers[user.uid] = user;

  await client.subscribe(user, mediaType);

  let player = document.getElementById(`user-container-${user.uid}`);
  if (player === null) {
    player = `<div class="video__container" id="user-container-${user.uid}">
                  <div class="video-player" id="user-${user.uid}"></div>
              </div>`;

    document
      .getElementById("streams__container")
      .insertAdjacentHTML("beforeend", player);
    document
      .getElementById(`user-container-${user.uid}`)
      .addEventListener("click", expandVideoFrame);
  }

  //* resize any new user entering the channel to the shortened size of 100x100 px
  if (displayFrame.style.display) {
    let videoFrame = document.getElementById(`user-container-${user.uid}`);
    videoFrame.style.height = "100px";
    videoFrame.style.width = "100px";
  }

  if (mediaType === "video") {
    user.videoTrack.play(`user-${user.uid}`);
  }
  if (mediaType === "audio") {
    user.audioTrack.play();
  }
};

//* Remove the track
let handleUserLeft = async (user) => {
  delete remoteUsers[user.uid];
  let item = document.getElementById(`user-container-${user.uid}`);

  if (item) {
    item.remove();
  }

  // * If the user-in-focus leaves, then the video tag as well as the frame should be removed.
  //* Hence the frame is removed and the remaining users are brought back to their normal dimensions
  if (userIdInDisplayFrame === `user-container-${user.uid}`) {
    displayFrame.style.display = null;

    let videoFrames = document.getElementsByClassName("video__container");

    for (let i = 0; i < videoFrames.length; i++) {
      videoFrames[i].style.height = "200px";
      videoFrames[i].style.width = "200px";
    }
  }
};

// * Mic mute functionality
let toggleMic = async (e) => {
  let button = e.currentTarget;

  if (localTracks[0].muted) {
    await localTracks[0].setMuted(false);
    button.classList.add("active");
  } else {
    await localTracks[0].setMuted(true);
    button.classList.remove("active");
  }
};
document.getElementById("mic-btn").addEventListener("click", toggleMic);

// * Camera mute functionality
let toggleCamera = async (e) => {
  let button = e.currentTarget;

  if (localTracks[1].muted) {
    await localTracks[1].setMuted(false);
    button.classList.add("active");
  } else {
    await localTracks[1].setMuted(true);
    button.classList.remove("active");
  }
};

let toggleScreen = async (e) => {
  let screenButton = e.currentTarget;

  let cameraButton = document.getElementById("camera-btn");

  if (!sharingScreen) {
    sharingScreen = true;

    screenButton.classList.add("active");
    cameraButton.classList.remove("active");
    cameraButton.style.display = "none";

    localScreenTracks = await AgoraRTC.createScreenVideoTrack();

    document.getElementById(`user-container-${uid}`).remove();
    displayFrame.style.display = "block";

    let player = `<div class="video__container" id="user-container-${uid}">
                  <div class="video-player" id="user-${uid}"></div>
                  </div>`;

    displayFrame.insertAdjacentHTML("beforeend", player);
    document
      .getElementById(`user-container-${uid}`)
      .addEventListener("click", expandVideoFrame);

    userIdInDisplayFrame = `user-container-${uid}`;
    // * we are playing our screen track and publishing our video track
    // * we need to publish our screen track when on click of the button
    localScreenTracks.play(`user-${uid}`);

    // * need to publish one track at a time, either the video track, or the screen share
    // * working perfect for the remote users as well
    await client.unpublish([localTracks[1]]);
    await client.publish([localScreenTracks]);

    // * looping through the non-screen sharing users and resizing their video dimensions to 100x100
    let videoFrames = document.getElementsByClassName("video__container");
    for (let i = 0; i < videoFrames.length; i++) {
      videoFrames[i].style.height = "100px";
      videoFrames[i].style.width = "100px";
    }
  } else {
    sharingScreen = false;
    cameraButton.style.display = "block";
    document.getElementById(`user-container-${uid}`).remove();
    await client.unpublish([localScreenTracks]);

    switchtoCamera();
  }
};

let leaveStream = async (e) => {
  e.preventDefault();

  // * Inverting the join stream actions as needed
  document.getElementById("join-btn").style.display = "block";
  document.getElementsByClassName("stream__actions")[0].style.display = "none";

  //* Iterating through the remaining users and closing their streams
  for (let i = 0; i < localTracks.length; i++) {
    localTracks[i].stop();
    localTracks[i].close();
  }

  //* Unpublishing the audio and video tracks from the channel
  await client.unpublish([localTracks[0], localTracks[1]]);

  //* stop screen sharing if the user was sharing
  if (localScreenTracks) {
    await client.unpublish([localScreenTracks]);
  }

  //* Removing the current user from the DOM
  document.getElementById(`user-container-${uid}`).remove();

  if (userIdInDisplayFrame === `user-container-${uid}`) {
    displayFrame.style.display = null;

    for (let i = 0; i < videoFrames.length; i++) {
      videoFrames[i].style.height = "200px";
      videoFrames[i].style.width = "200px";
    }
  }

  channel.sendMessage({
    text: JSON.stringify({ type: "user_left", uid: uid }),
  });
};

document.getElementById("camera-btn").addEventListener("click", toggleCamera);
document.getElementById("mic-btn").addEventListener("click", toggleMic);
document.getElementById("screen-btn").addEventListener("click", toggleScreen);
document.getElementById("join-btn").addEventListener("click", joinStream);
document.getElementById("leave-btn").addEventListener("click", leaveStream);

joinRoomInit();
