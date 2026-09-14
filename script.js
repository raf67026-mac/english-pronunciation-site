(function () {
  "use strict";

  // ---- Read ?word=... from the URL. No per-word files, no word list: any
  // word or phrase in the query string is displayed and spoken. -----------
  var params = new URLSearchParams(window.location.search);
  var initialWord = params.get("word") || "";

  var input = document.getElementById("wordInput");
  var barsEl = document.getElementById("bars");
  var btn = document.getElementById("playBtn");
  var label = document.getElementById("playLabel");
  var statusEl = document.getElementById("status");
  var accUS = document.getElementById("accUS");
  var accGB = document.getElementById("accGB");
  var speedButtons = Array.prototype.slice.call(document.querySelectorAll(".speedBtn"));
  var aboutEl = document.getElementById("about");

  if (initialWord) {
    input.value = initialWord;
    document.title = initialWord + " — النطق";
    aboutEl.innerHTML =
      "<b>طريقة الاستخدام</b>" +
      "<ul>" +
      "<li>اضغط زر التشغيل &#128266; لسماع نطق الكلمة الصحيح — هذه الكلمة فُتحت مباشرة من الكتاب وهي معبأة أعلاه تلقائيًا.</li>" +
      "<li>يمكنك التحكم في سرعة النطق من أزرار السرعة.</li>" +
      "<li>اختر <b>0.50×</b> لسماع الكلمة ببطء شديد جدًا ووضوح تام لكل صوت فيها.</li>" +
      "<li>اختر <b>0.75×</b> لسماع الكلمة ببطء ووضوح.</li>" +
      "<li>اختر <b>0.90×</b> لسماع النطق أبطأ قليلًا من الطبيعي.</li>" +
      "<li>اختر <b>1.00×</b> لسماع النطق بالسرعة الطبيعية (وهي المختارة تلقائيًا عند فتح الصفحة).</li>" +
      "<li>يمكنك حذف الكلمة وكتابة أو لصق أي كلمة أو جملة أخرى لسماع نطقها.</li>" +
      "<li>انسخ نص أي قسم استماع (Listening) من الكتاب والصقه هنا لسماعه.</li>" +
      "<li>اختر النطق الأمريكي &#127482;&#127480; أو البريطاني &#127468;&#127463; من الأزرار أدناه.</li>" +
      "</ul>";
  } else {
    aboutEl.innerHTML =
      "<b>طريقة الاستخدام</b>" +
      "<ul>" +
      "<li>اكتب أو الصق أي كلمة أو جملة إنجليزية في المربع أعلاه.</li>" +
      "<li>اضغط زر التشغيل &#128266; لسماع نطقها الصحيح.</li>" +
      "<li>اختر <b>0.50×</b> لسماع الكلمة ببطء شديد جدًا ووضوح تام لكل صوت فيها.</li>" +
      "<li>اختر <b>0.75×</b> لسماع الكلمة ببطء ووضوح.</li>" +
      "<li>اختر <b>0.90×</b> لسماع النطق أبطأ قليلًا من الطبيعي.</li>" +
      "<li>اختر <b>1.00×</b> لسماع النطق بالسرعة الطبيعية (وهي المختارة تلقائيًا عند فتح الصفحة).</li>" +
      "<li>انسخ نص أي قسم استماع (Listening) من الكتاب والصقه هنا لسماعه.</li>" +
      "<li>اختر النطق الأمريكي &#127482;&#127480; أو البريطاني &#127468;&#127463; من الأزرار أدناه.</li>" +
      "</ul>";
  }

  // ---- Accent (persisted per-browser via localStorage; default US) -------
  var accent = (localStorage.getItem("ec_accent") || "us").toLowerCase();
  if (accent !== "us" && accent !== "gb") accent = "us";

  function setAccentUI() {
    accUS.classList.toggle("active", accent === "us");
    accGB.classList.toggle("active", accent === "gb");
    try { localStorage.setItem("ec_accent", accent); } catch (e) {}
  }
  setAccentUI();

  // ---- Speed (0.5x/0.75x/0.9x = slow & clear for learners, 1x = normal; --
  // persisted per-browser; default 1x) -------------------------------------
  var allowedSpeeds = speedButtons.map(function (b) { return parseFloat(b.getAttribute("data-speed")); });
  var speed = parseFloat(localStorage.getItem("ec_speed"));
  if (allowedSpeeds.indexOf(speed) === -1) speed = 1;

  function setSpeedUI() {
    speedButtons.forEach(function (b) {
      b.classList.toggle("active", parseFloat(b.getAttribute("data-speed")) === speed);
    });
    try { localStorage.setItem("ec_speed", String(speed)); } catch (e) {}
  }
  setSpeedUI();

  // ---- Web Speech API (built into the browser; no server, no Claude) -----
  var supported = "speechSynthesis" in window;
  var voices = [];
  function loadVoices() {
    voices = supported ? window.speechSynthesis.getVoices() : [];
  }
  if (supported) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  // Prefer voices that actually honor rate changes, THEN prefer natural
  // sound. Many browsers' "online"/network voices (often the ones with
  // Google-style names) synthesize speech server-side at a fixed pace and
  // barely change with utterance.rate — exactly the voices a name-only
  // heuristic used to favor, which is why 0.75x/0.5x could sound almost the
  // same as 1x. On-device voices (SpeechSynthesisVoice.localService) do
  // respect rate reliably, so for a course where the whole point of the
  // speed control is to actually slow the word down, reliability comes
  // first; a natural-sounding name is still a bonus on top of that.
  function scoreVoice(v, code) {
    var target = code === "gb" ? "en-gb" : "en-us";
    var lang = (v.lang || "").toLowerCase();
    var name = (v.name || "").toLowerCase();
    var score = -1;
    if (lang === target) score = 50;
    else if (lang.indexOf(target) === 0) score = 30;
    else if (lang.indexOf("en") === 0) score = 10;
    else return -1;
    if (v.localService) score += 40;
    if (name.indexOf("natural") > -1 || name.indexOf("neural") > -1) score += 20;
    if (name.indexOf("samantha") > -1 || name.indexOf("aria") > -1 || name.indexOf("jenny") > -1 || name.indexOf("zira") > -1) score += 10;
    if (name.indexOf("espeak") > -1 || name.indexOf("compact") > -1 || name.indexOf("pico") > -1) score -= 10;
    return score;
  }
  function pickVoice(code) {
    var best = null, bestScore = -1;
    for (var i = 0; i < voices.length; i++) {
      var s = scoreVoice(voices[i], code);
      if (s > bestScore) { bestScore = s; best = voices[i]; }
    }
    return best;
  }

  // speak() is the ONLY place audio is produced — every speed button ends up
  // calling this same function, with the chosen rate, so there is exactly
  // one code path to keep correct.
  var speakToken = 0; // lets a fast double-click cancel a stale pending speak
  function speak() {
    var word = input.value.trim();
    if (!word) return;
    if (!supported) {
      statusEl.textContent = "هذا المتصفح لا يدعم نطق النصوص. جرّب Chrome أو Edge أو Safari.";
      return;
    }
    // Voices can still be empty on the very first call in some browsers even
    // though onvoiceschanged never fired — re-read them right before picking.
    if (!voices.length) loadVoices();

    var myToken = ++speakToken;
    var rateForThisPlay = speed; // snapshot: a click on another speed button
                                  // during the delay below must not change
                                  // the rate of the utterance already queued

    barsEl.classList.add("playing");
    label.textContent = "جارٍ التشغيل...";
    statusEl.textContent = "";

    function reallySpeak() {
      if (myToken !== speakToken) return; // superseded by a newer click
      var u = new SpeechSynthesisUtterance(word);
      var v = pickVoice(accent);
      if (v) u.voice = v;
      u.lang = accent === "gb" ? "en-GB" : "en-US"; // en-US by default
      // Same voice/engine, just spoken slower/faster — this is the Web
      // Speech API's own rate control, the equivalent of an <audio> element's
      // playbackRate when (as here) the sound is synthesized live rather than
      // played back from a recorded audio file. This is the ONLY property
      // that changes between speed buttons; nothing else about how the word
      // is spoken changes.
      u.rate = rateForThisPlay;
      u.pitch = 1;
      u.onend = function () {
        if (myToken === speakToken) { barsEl.classList.remove("playing"); label.textContent = "تشغيل"; }
      };
      u.onerror = function (ev) {
        if (myToken !== speakToken) return;
        barsEl.classList.remove("playing");
        label.textContent = "تشغيل";
        // "canceled"/"interrupted" fire when a newer click replaces this
        // utterance — that is expected and not a real error to show.
        if (ev && (ev.error === "canceled" || ev.error === "interrupted")) return;
        statusEl.textContent = "تم حظر التشغيل — اضغط زر التشغيل مرة أخرى.";
      };
      try { window.speechSynthesis.speak(u); }
      catch (e) { statusEl.textContent = "تعذّر تشغيل الصوت على هذا الجهاز."; }
    }

    // Chrome (desktop and Android) has a long-documented bug: calling
    // speak() in the same tick right after cancel() can silently reuse the
    // PREVIOUS utterance's rate/voice/pitch instead of the new one — the
    // symptom is exactly "the button changes but the sound never does".
    // speechSynthesis can also get left in a "paused" state (e.g. after the
    // tab lost focus), which also blocks a new rate from taking effect.
    // Canceling, resuming, and giving the engine a short moment before
    // speaking the new utterance avoids both.
    window.speechSynthesis.cancel();
    try { window.speechSynthesis.resume(); } catch (e) {}
    setTimeout(reallySpeak, 70);
  }

  btn.addEventListener("click", speak);
  input.addEventListener("keydown", function (ev) { if (ev.key === "Enter") speak(); });
  accUS.addEventListener("click", function () { accent = "us"; setAccentUI(); if (input.value.trim()) speak(); });
  accGB.addEventListener("click", function () { accent = "gb"; setAccentUI(); if (input.value.trim()) speak(); });
  speedButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      speed = parseFloat(b.getAttribute("data-speed"));
      setSpeedUI();
      if (input.value.trim()) speak();
    });
  });

  if (initialWord) {
    // Opened from a link in the book: the click that got here counts as the
    // user's gesture, which most browsers accept as activation for speech.
    window.addEventListener("load", function () {
      setTimeout(function () { try { speak(); } catch (e) {} }, 150);
    });
  }
})();
