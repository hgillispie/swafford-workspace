import { signInJourneyInlineScript } from "@agent-native/core/shared";

const STYLES = `
*,*::before,*::after{box-sizing:border-box}
:root{--bg:#f9fafb;--fg:#181c25;--muted:#646a78;--border:#dfe3e7;--card:#fff;--primary:#263a69;--primary-hover:#1c2d54;--ring:rgba(38,58,105,.3);--danger:#d0252a;--stage:#14171f;--stage-fg:#f3f5f7;--stage-muted:#949ba8;--hl:rgba(48,84,166,.3)}
@media (prefers-color-scheme:dark){:root{--bg:#13151b;--fg:#e7ebee;--muted:#959ba7;--border:#2d3139;--card:#1a1d23;--primary:#6e8bcf;--primary-hover:#819bda;--ring:rgba(110,139,207,.4);--danger:#e1474c}}
html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--fg);font-family:"Inter Variable",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.shell{display:grid;min-height:100%;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr)}
.showcase{position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:40px;padding:36px 48px 40px;background:var(--stage);color:var(--stage-fg);overflow:hidden}
.brand{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;letter-spacing:-.01em}
.brand img{width:26px;height:26px;border-radius:7px}
.doc{max-width:520px;width:100%;margin:0 auto;font-size:19px;line-height:1.8;letter-spacing:-.005em}
.para{margin:0 0 26px}
.speaker{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:600;margin-bottom:4px}
.speaker time{font-weight:500;color:var(--stage-muted);font-variant-numeric:tabular-nums}
.dot{width:8px;height:8px;border-radius:99px}
.teal{background:#347970}.clay{background:#aa6b41}.rose{background:#b9466c}.sky{background:#3077a6}
.para p{margin:0;color:rgba(243,245,247,.86)}
.cut{color:#777d8c;text-decoration:line-through;text-decoration-thickness:1.5px;background-image:repeating-linear-gradient(-45deg,rgba(255,255,255,.08) 0 1px,transparent 1px 5px);border-radius:3px}
.now{position:relative;color:#fff;background:var(--hl);border-radius:3px}
.now::after{content:"";position:absolute;left:0;right:0;bottom:-3px;height:2px;border-radius:2px;background:#6e8bcf}
.gap{display:inline-block;width:1.1em;height:.6em;margin:0 .1em 0 .2em;border-radius:99px;vertical-align:.05em;background:radial-gradient(circle,rgba(255,255,255,.35) 1.2px,transparent 1.6px) center/.34em 100% repeat-x,rgba(255,255,255,.07);position:relative}
.gap::after{content:"";position:absolute;inset:0;background:linear-gradient(-60deg,transparent calc(50% - .75px),#6e8bcf calc(50% - .75px) calc(50% + .75px),transparent calc(50% + .75px))}
.track{max-width:520px;width:100%;margin:0 auto;display:flex;align-items:center;gap:3px;height:44px;padding:0 10px;border-radius:8px;background:rgba(255,255,255,.04);position:relative}
.track span{display:block;border-radius:2px;height:20px;opacity:.85}
.splice{position:absolute;top:-6px;bottom:-2px;width:1px;background:#6e8bcf}
.splice::before{content:"";position:absolute;top:0;left:-4px;border:4.5px solid transparent;border-top:5px solid #6e8bcf;border-bottom:0}
.tagline{margin:0;font-size:13px;color:var(--stage-muted)}
.panel{display:flex;align-items:center;justify-content:center;padding:40px 24px}
.card{width:100%;max-width:360px}
.card .brand{display:none;margin-bottom:28px;color:var(--fg)}
h1{margin:0 0 24px;font-size:22px;font-weight:600;letter-spacing:-.02em}
form{display:flex;flex-direction:column;gap:14px}
label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:500}
input{height:40px;padding:0 12px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--fg);font:inherit;font-size:14px;outline:none;transition:border-color .15s,box-shadow .15s}
input:focus{border-color:var(--primary);box-shadow:0 0 0 3px var(--ring)}
.hint{margin:-6px 0 0;font-size:12px;color:var(--muted)}
.error{margin:0;padding:9px 11px;border-radius:8px;font-size:13px;line-height:1.45;color:var(--danger);background:color-mix(in srgb,var(--danger) 10%,transparent)}
.submit{margin-top:6px;height:40px;border:0;border-radius:8px;background:var(--primary);color:#fff;font:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:background-color .15s,transform .1s}
.submit:hover{background:var(--primary-hover)}
.submit:active{transform:scale(.99)}
.submit:focus-visible{outline:none;box-shadow:0 0 0 3px var(--ring)}
.submit[disabled]{opacity:.65;cursor:wait}
.oauth{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;height:40px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--fg);font:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:background-color .15s,border-color .15s,transform .1s}
.oauth:hover{background:color-mix(in srgb,var(--fg) 4%,var(--card))}
.oauth:active{transform:scale(.99)}
.oauth:focus-visible{outline:none;box-shadow:0 0 0 3px var(--ring)}
.oauth[disabled]{opacity:.65;cursor:wait}
.oauth svg{width:18px;height:18px;flex:none}
#google-error{margin-top:10px}
.divider{display:flex;align-items:center;gap:12px;margin:18px 0;font-size:12px;color:var(--muted)}
.divider::before,.divider::after{content:"";flex:1;height:1px;background:var(--border)}
.switch{margin:22px 0 0;font-size:13px;color:var(--muted)}
.switch button{border:0;background:none;padding:0;color:var(--primary);font:inherit;font-weight:600;cursor:pointer}
.switch button:hover{text-decoration:underline;text-underline-offset:3px}
.embedded-help{margin:14px 0 0;padding-top:14px;border-top:1px solid var(--border);font-size:12.5px;line-height:1.5;color:var(--muted)}
.embedded-help a{color:var(--primary);font-weight:600;text-decoration:none}
.embedded-help a:hover{text-decoration:underline;text-underline-offset:3px}
[hidden]{display:none!important}
@media (max-width:860px){.shell{grid-template-columns:1fr}.showcase{display:none}.card .brand{display:flex}}
`;

const SHOWCASE = `
<section class="showcase" aria-hidden="true">
  <div class="brand"><img src="/favicon.svg" alt="" /><span>Cutline</span></div>
  <div class="doc">
    <div class="para">
      <div class="speaker"><span class="dot teal"></span>Maya Chen <time>00:00</time></div>
      <p>Hey, <span class="cut">um,</span> welcome back to Signal and Noise. Today I'm talking with Dev Patel, who has edited <span class="cut">uh,</span> something like <span class="now">four</span> hundred episodes.</p>
    </div>
    <div class="para">
      <div class="speaker"><span class="dot clay"></span>Dev Patel <time>00:09</time></div>
      <p>Most of the time the content is fine.<span class="gap"></span> It's the dead air between thoughts that makes people drift off.</p>
    </div>
  </div>
  <div>
    <div class="track">
      <span class="teal" style="width:7%"></span><span class="teal" style="width:4%"></span><span class="teal" style="width:9%"></span><span class="teal" style="width:5%"></span><span class="teal" style="width:8%"></span>
      <span class="clay" style="width:6%"></span><span class="clay" style="width:10%"></span><span class="clay" style="width:4%"></span><span class="clay" style="width:7%"></span>
      <span class="teal" style="width:5%"></span><span class="teal" style="width:8%"></span><span class="clay" style="width:6%"></span><span class="clay" style="width:9%"></span>
      <i class="splice" style="left:21%"></i><i class="splice" style="left:58%"></i>
    </div>
    <p class="tagline" style="margin-top:18px">Edit video and audio by editing the transcript.</p>
  </div>
</section>`;

// Google's brand mark keeps its official colors.
const GOOGLE_MARK = `<svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.69 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A8.96 8.96 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>`;

const GOOGLE_BLOCK = `
    <button id="google" class="oauth" type="button">${GOOGLE_MARK}<span id="google-label">Continue with Google</span></button>
    <p id="google-error" class="error" role="alert" hidden></p>
    <div class="divider" role="separator"><span>or</span></div>`;

function form(showGoogle: boolean): string {
  return `
<section class="panel">
  <div class="card">
    <div class="brand"><img src="/favicon.svg" alt="" /><span>Cutline</span></div>
    <h1 id="title">Sign in to Cutline</h1>${showGoogle ? GOOGLE_BLOCK : ""}
    <form id="form" method="post" novalidate>
      <label>Email<input id="email" name="email" type="email" autocomplete="email" required /></label>
      <label>Password<input id="password" name="password" type="password" autocomplete="current-password" required /></label>
      <p id="hint" class="hint" hidden>Use at least 12 characters.</p>
      <p id="error" class="error" role="alert" hidden></p>
      <button id="submit" class="submit" type="submit">Sign in</button>
    </form>
    <p class="switch"><span id="switch-copy">New to Cutline?</span> <button id="switch" type="button">Create an account</button></p>
    <p id="embedded-help" class="embedded-help" hidden>Sign-in not sticking in this preview? <a id="open-tab" href="/" target="_blank" rel="noopener">Open Cutline in a new tab</a></p>
  </div>
</section>`;
}

const CLIENT_SCRIPT = `
(function () {
  var journey = __anCreateSignInJourney("", "/");
  var params = new URLSearchParams(window.location.search);
  var mode = params.get("tab") === "signup" || /\\/signup\\/?$/.test(window.location.pathname) ? "signup" : "login";
  var form = document.getElementById("form");
  var email = document.getElementById("email");
  var password = document.getElementById("password");
  var submit = document.getElementById("submit");
  var error = document.getElementById("error");
  var hint = document.getElementById("hint");
  var title = document.getElementById("title");
  var switchCopy = document.getElementById("switch-copy");
  var switchButton = document.getElementById("switch");
  var embeddedHelp = document.getElementById("embedded-help");
  var openTab = document.getElementById("open-tab");
  var google = document.getElementById("google");
  var googleError = document.getElementById("google-error");
  var googleLabel = document.getElementById("google-label");

  var GOOGLE_AUTH_URL = "/_agent-native/google/auth-url";
  var PREVIEW_HOST = /(^|\\.)(builderio\\.xyz|builderio\\.dev|builder\\.codes|builder\\.my)$/i;
  var embedded = (function () {
    try { return window.self !== window.top; } catch (e) { return true; }
  })();
  var googleFlow = null;

  function resumePath() {
    return journey.journeyForLocation(window.location).resumeHref;
  }

  function standaloneHref() {
    var url = new URL(resumePath(), window.location.origin);
    var drop = [];
    url.searchParams.forEach(function (_value, key) {
      if (/^(builder\\.|__builder)/.test(key)) drop.push(key);
    });
    drop.forEach(function (key) { url.searchParams.delete(key); });
    return url.href;
  }

  // Cookies set inside an embedded preview can be blocked or partitioned, so
  // confirm the session is readable before leaving instead of bouncing back here.
  function finishSignIn(target) {
    return fetch("/_agent-native/auth/session", { credentials: "include", headers: { Accept: "application/json" } })
      .then(function (res) { return res.ok ? res.json() : {}; })
      .catch(function () { return {}; })
      .then(function (session) {
        if (session && typeof session.email === "string" && !session.error) {
          window.location.replace(target);
          return;
        }
        throw new Error(embedded
          ? "You're signed in, but this preview blocked the sign-in cookie. Open Cutline in a new tab to continue."
          : "You're signed in, but your browser didn't keep the session cookie. Allow cookies for this site and try again.");
      });
  }

  function render() {
    var signup = mode === "signup";
    title.textContent = signup ? "Create your Cutline account" : "Sign in to Cutline";
    submit.textContent = signup ? "Create account" : "Sign in";
    password.setAttribute("autocomplete", signup ? "new-password" : "current-password");
    hint.hidden = !signup;
    switchCopy.textContent = signup ? "Already have an account?" : "New to Cutline?";
    switchButton.textContent = signup ? "Sign in" : "Create an account";
    error.hidden = true;
  }

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  function postJson(path, body) {
    return fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res
        .json()
        .catch(function () { return {}; })
        .then(function (data) { return { ok: res.ok, data: data || {} }; });
    });
  }

  function login(address, secret) {
    return postJson("/_agent-native/auth/login", { email: address, password: secret }).then(function (r) {
      if (r.data.twoFactorRedirect) {
        throw new Error("This account uses two-factor sign-in, which this page doesn't support yet.");
      }
      if (!r.ok || !r.data.ok) throw new Error(r.data.error || "Sign-in failed. Check your email and password.");
    });
  }

  function register(address, secret) {
    return postJson("/_agent-native/auth/register", { email: address, password: secret }).then(function (r) {
      if (!r.ok || !r.data.ok) throw new Error(r.data.error || "Couldn't create your account.");
      return login(address, secret);
    });
  }

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "cutline-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function randomVerifier() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID() + window.crypto.randomUUID();
    }
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      var bytes = new Uint8Array(32);
      window.crypto.getRandomValues(bytes);
      var binary = "";
      for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
    }
    return "";
  }

  // Builder preview hosts need an absolute return URL so the callback can hand
  // the session back to the origin that started sign-in.
  function oauthReturnTarget(path) {
    return window.location.protocol === "https:" && PREVIEW_HOST.test(window.location.hostname)
      ? window.location.origin + path
      : path;
  }

  function setGoogleBusy(busy) {
    if (!google) return;
    google.disabled = busy;
    googleLabel.textContent = busy ? "Waiting for Google…" : "Continue with Google";
  }

  function failGoogle(message) {
    googleFlow = null;
    setGoogleBusy(false);
    googleError.textContent = message;
    googleError.hidden = false;
  }

  function closePopup(popup) {
    try { if (popup) popup.close(); } catch (e) {}
  }

  function pollGoogleExchange(flowId, verifier, target, popup) {
    var startedAt = Date.now();
    var inFlight = false;
    var closedAt = 0;
    var timer = setInterval(tick, 1000);
    setTimeout(tick, 500);

    function stop() { clearInterval(timer); }

    function tick() {
      if (googleFlow !== flowId) { stop(); return; }
      if (Date.now() - startedAt > 5 * 60 * 1000) {
        stop();
        failGoogle("Google sign-in didn't finish. Try again.");
        return;
      }
      var closed = false;
      try { closed = popup.closed; } catch (e) { closed = true; }
      if (closed && !closedAt) closedAt = Date.now();
      // A provider page with Cross-Origin-Opener-Policy can make the popup read
      // as closed mid sign-in, so keep polling and only re-enable the button.
      if (closedAt && Date.now() - closedAt > 5000) setGoogleBusy(false);
      if (inFlight) return;
      inFlight = true;
      fetch("/_agent-native/auth/desktop-exchange?flow_id=" + encodeURIComponent(flowId), {
        credentials: "include",
        headers: { Accept: "application/json", "X-Agent-Native-Desktop-Verifier": verifier },
      })
        .then(function (res) { return res.json().catch(function () { return {}; }); })
        .then(function (data) {
          if (googleFlow !== flowId) return;
          if (typeof data.email === "string" || typeof data.token === "string") {
            stop();
            googleFlow = null;
            closePopup(popup);
            return finishSignIn(target).catch(function (err) { failGoogle(err.message); });
          }
          if (data.error) {
            stop();
            closePopup(popup);
            failGoogle(data.error);
          }
        })
        .catch(function () {})
        .then(function () { inFlight = false; });
    }
  }

  function startGooglePopup(target) {
    var popup = null;
    try {
      popup = window.open("/_agent-native/oauth/popup", "_blank", "width=640,height=760");
    } catch (e) {
      popup = null;
    }
    if (!popup) {
      failGoogle("Allow pop-ups for this site, or open Cutline in a new tab, then try again.");
      return;
    }
    try { popup.opener = null; } catch (e) {}
    var flowId = randomId();
    var verifier = randomVerifier();
    if (!verifier) {
      closePopup(popup);
      failGoogle("This browser can't start Google sign-in here. Open Cutline in a new tab.");
      return;
    }
    googleFlow = flowId;
    var query = new URLSearchParams({ return: oauthReturnTarget(target), desktop: "1", flow_id: flowId });
    fetch(GOOGLE_AUTH_URL + "?" + query.toString(), {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "X-Agent-Native-Desktop-Verifier": verifier },
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data || {} }; });
      })
      .then(function (r) {
        if (googleFlow !== flowId) return;
        if (!r.ok || typeof r.data.url !== "string" || !r.data.url) {
          throw new Error(r.data.error || "Couldn't start Google sign-in. Try again.");
        }
        popup.location.href = r.data.url;
        pollGoogleExchange(flowId, verifier, target, popup);
      })
      .catch(function (err) {
        closePopup(popup);
        failGoogle(err && err.message ? err.message : "Couldn't start Google sign-in. Try again.");
      });
  }

  if (google) {
    google.addEventListener("click", function () {
      if (google.disabled) return;
      googleError.hidden = true;
      error.hidden = true;
      setGoogleBusy(true);
      var target = resumePath();
      if (!embedded) {
        var query = new URLSearchParams({ return: oauthReturnTarget(target), redirect: "1" });
        window.location.replace(GOOGLE_AUTH_URL + "?" + query.toString());
        return;
      }
      startGooglePopup(target);
    });
  }

  switchButton.addEventListener("click", function () {
    mode = mode === "signup" ? "login" : "signup";
    render();
    email.focus();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var address = email.value.trim();
    var secret = password.value;
    if (!address || address.indexOf("@") < 1) {
      showError("Enter a valid email address.");
      email.focus();
      return;
    }
    if (!secret) {
      showError("Enter your password.");
      password.focus();
      return;
    }
    if (mode === "signup" && secret.length < 12) {
      showError("Use at least 12 characters for your password.");
      password.focus();
      return;
    }
    error.hidden = true;
    submit.disabled = true;
    var label = submit.textContent;
    submit.textContent = mode === "signup" ? "Creating account…" : "Signing in…";
    (mode === "signup" ? register(address, secret) : login(address, secret))
      .then(function () { return finishSignIn(resumePath()); })
      .catch(function (err) {
        showError(err && err.message ? err.message : "Something went wrong. Try again.");
        submit.disabled = false;
        submit.textContent = label;
      });
  });

  if (embedded) {
    openTab.href = standaloneHref();
    embeddedHelp.hidden = false;
  }
  render();
  fetch("/_agent-native/auth/session", { credentials: "include" })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (session) { if (session && session.email) window.location.replace(resumePath()); })
    .catch(function () {});
  email.focus();
})();
`;

export function buildLoginHtml({ showGoogle }: { showGoogle: boolean }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#14171f" />
<title>Sign in · Cutline</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<style>${STYLES}</style>
</head>
<body>
<main class="shell">${SHOWCASE}${form(showGoogle)}</main>
<script>${signInJourneyInlineScript()}</script>
<script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}
