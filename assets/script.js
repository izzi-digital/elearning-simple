// ======================= KONFIGURASI & VARIABEL GLOBAL =======================
const PUSHER_APP_KEY = "e8c4316838343859317e";
const PUSHER_CLUSTER = "ap1";
const PUSHER_CHANNEL_NAME = "nobar-channel-public-demo";
const PUSHER_EVENT_NAME = "video-control-event";
const PUSHER_PROXY_URL =
  "https://sincere-glittery-solstice.glitch.me/trigger-pusher";

let currentUser = null;
let youtubePlayer = null;
let pusher = null;
let channel = null;
let dbUsers = []; // Untuk menyimpan user dari db.json

// ======================= FUNGSI UTAMA & MANAJEMEN HALAMAN =======================
$(document).ready(function () {
  function showPage(pageId) {
    $(".page").removeClass("active");
    $("#" + pageId).addClass("active");
  }

  async function initializeApp() {
    try {
      // Memuat data pengguna dari file JSON
      const response = await fetch("./data/db.json");
      const data = await response.json();
      dbUsers = data.users;
    } catch (error) {
      console.error("Gagal memuat db.json dari folder data:", error);
    }

    // Memeriksa apakah ada pengguna yang sudah login di localStorage
    const loggedInUser = JSON.parse(localStorage.getItem("currentUser"));
    if (loggedInUser && loggedInUser.isLoggedIn) {
      currentUser = loggedInUser;
      // Mengarahkan ke dasbor yang sesuai berdasarkan peran
      if (currentUser.role === "guru") {
        $("#teacher-name").text(currentUser.fullName);
        showPage("teacher-dashboard");
      } else {
        $("#student-name").text(currentUser.fullName);
        showPage("student-dashboard");
      }
      initPusher(); // Inisialisasi Pusher untuk pengguna yang login
    } else {
      showPage("login-register-page");
    }
  }

  initializeApp();

  // ======================= LOGIKA AUTENTIKASI =======================

  $("#register-form").on("submit", function (e) {
    e.preventDefault();
    const fullName = $("#full_name").val();
    const email = $("#email_register").val();
    const password = $("#password_register").val();

    let localUsers = JSON.parse(localStorage.getItem("localUsers")) || [];
    const isEmailTaken =
      dbUsers.find((u) => u.email === email) ||
      localUsers.find((u) => u.email === email);
    if (isEmailTaken) {
      $("#register-alert").html(
        '<div class="alert alert-danger">Email sudah terdaftar.</div>'
      );
      return;
    }

    // Pengguna baru yang mendaftar hanya disimpan di localStorage
    localUsers.push({ fullName, email, password, role: "siswa" });
    localStorage.setItem("localUsers", JSON.stringify(localUsers));

    $("#register-alert").html(
      '<div class="alert alert-success">Registrasi berhasil! Silakan login.</div>'
    );
    $("#register-form")[0].reset();
  });

  $("#login-form").on("submit", function (e) {
    e.preventDefault();
    const email = $("#email_login").val();
    const password = $("#password_login").val();

    // Gabungkan pengguna dari db.json dan yang terdaftar lokal
    let localUsers = JSON.parse(localStorage.getItem("localUsers")) || [];
    const allUsers = [...dbUsers, ...localUsers];

    // Cari pengguna berdasarkan email dan password
    const foundUser = allUsers.find(
      (user) => user.email === email && user.password === password
    );

    if (foundUser) {
      // Jika pengguna ditemukan, simpan sesi mereka
      currentUser = { ...foundUser, isLoggedIn: true };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));

      // Arahkan ke dasbor yang benar berdasarkan peran (role)
      if (foundUser.role === "guru") {
        $("#teacher-name").text(currentUser.fullName);
        showPage("teacher-dashboard");
      } else {
        // Asumsikan peran lainnya adalah siswa
        $("#student-name").text(currentUser.fullName);
        showPage("student-dashboard");
      }

      initPusher(); // Inisialisasi Pusher setelah login berhasil
    } else {
      // Jika pengguna tidak ditemukan
      $("#login-alert").html(
        '<div class="alert alert-danger">Email atau password salah.</div>'
      );
    }
  });

  $(".logout-btn").on("click", function () {
    localStorage.removeItem("currentUser");
    currentUser = null;
    if (pusher) pusher.disconnect();
    youtubePlayer = null;
    showPage("login-register-page");
    location.reload();
  });

  $(".back-to-dashboard-btn").on("click", function () {
    if (currentUser.role === "guru") showPage("teacher-dashboard");
    else showPage("student-dashboard");
  });

  // ======================= LOGIKA NOBAR (PUSHER & YOUTUBE) =======================

  function initPusher() {
    if (pusher) return;
    pusher = new Pusher(PUSHER_APP_KEY, { cluster: PUSHER_CLUSTER });
    channel = pusher.subscribe(PUSHER_CHANNEL_NAME);

    if (currentUser && currentUser.role === "siswa") {
      channel.bind(PUSHER_EVENT_NAME, function (data) {
        if (data.type === "start") {
          $("#nobar-notification").show();
          $("#join-nobar-btn").data("videoId", data.videoId);
        } else if (youtubePlayer) {
          handleVideoControl(data);
        }
      });
    }
  }

  $("#start-nobar-btn").on("click", function () {
    const videoId = prompt(
      "Masukkan ID Video YouTube untuk Nobar:",
      "dQw4w9WgXcQ"
    );
    if (videoId) {
      sendPusherEvent({ type: "start", videoId: videoId });
      loadNobarPage(videoId);
    }
  });

  $("#join-nobar-btn").on("click", function () {
    const videoId = $(this).data("videoId");
    loadNobarPage(videoId);
  });

  function loadNobarPage(videoId) {
    showPage("nobar-page");
    $("#youtube-video-id").text(videoId);
    if (currentUser.role === "guru") {
      $("#teacher-controls").show();
    }
    if (youtubePlayer) {
      youtubePlayer.loadVideoById(videoId);
    } else {
      createYouTubePlayer(videoId);
    }
  }

  function createYouTubePlayer(videoId) {
    youtubePlayer = new YT.Player("nobar-player-container", {
      height: "100%",
      width: "100%",
      videoId: videoId,
      playerVars: {
        playsinline: 1,
        controls: currentUser.role === "guru" ? 1 : 0,
        disablekb: 1,
      },
      events: { onReady: onPlayerReady, onStateChange: onPlayerStateChange },
    });
  }

  function onPlayerReady(event) {
    if (currentUser.role === "guru") setInterval(updateSlider, 1000);
  }

  function onPlayerStateChange(event) {
    if (currentUser.role !== "guru") return;
    const statusMap = {
      [YT.PlayerState.PLAYING]: "Playing",
      [YT.PlayerState.PAUSED]: "Paused",
      [YT.PlayerState.ENDED]: "Ended",
      [YT.PlayerState.BUFFERING]: "Buffering",
      [YT.PlayerState.CUED]: "Cued",
    };
    $("#player-status").text(statusMap[event.data] || "Unknown");
    if (event.data === YT.PlayerState.PLAYING)
      sendPusherEvent({ type: "play", time: youtubePlayer.getCurrentTime() });
    else if (event.data === YT.PlayerState.PAUSED)
      sendPusherEvent({ type: "pause" });
  }

  function handleVideoControl(data) {
    if (!youtubePlayer) return;
    switch (data.type) {
      case "play":
        youtubePlayer.seekTo(data.time, true);
        youtubePlayer.playVideo();
        break;
      case "pause":
        youtubePlayer.pauseVideo();
        break;
      case "seek":
        youtubePlayer.seekTo(data.time, true);
        break;
    }
  }

  $("#play-btn").on("click", () => youtubePlayer && youtubePlayer.playVideo());
  $("#pause-btn").on(
    "click",
    () => youtubePlayer && youtubePlayer.pauseVideo()
  );
  $("#seek-slider").on("input", function () {
    if (youtubePlayer) {
      const duration = youtubePlayer.getDuration();
      const seekToTime = duration * ($(this).val() / 100);
      youtubePlayer.seekTo(seekToTime, true);
      sendPusherEvent({ type: "seek", time: seekToTime });
    }
  });

  function updateSlider() {
    if (youtubePlayer && youtubePlayer.getDuration) {
      const currentTime = youtubePlayer.getCurrentTime();
      const duration = youtubePlayer.getDuration();
      $("#seek-slider").val((currentTime / duration) * 100);
    }
  }

  function sendPusherEvent(data) {
    $.ajax({
      url: PUSHER_PROXY_URL,
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({
        channel: PUSHER_CHANNEL_NAME,
        event: PUSHER_EVENT_NAME,
        data: data,
      }),
    }).fail((err) => console.error("Gagal mengirim event ke Pusher:", err));
  }
});
