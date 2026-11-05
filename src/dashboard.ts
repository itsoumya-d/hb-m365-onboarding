export function dashboardPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HB Technologies · M365 Onboarding</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');
    :root {
      --hb-font-heading: 'Montserrat', sans-serif;
      --hb-font-body: 'Montserrat', sans-serif;
      --hb-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --hb-bg: #FFFFFF;
      --hb-surface: #F5F5F5;
      --hb-ink: #30383A;
      --hb-red: #E31837;
      --hb-radius: 40px;
      --hb-space: 8px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--hb-bg); color: var(--hb-ink); font-family: var(--hb-font-body); }
    header { border-top: 8px solid var(--hb-red); padding: calc(var(--hb-space) * 5) calc(var(--hb-space) * 4) calc(var(--hb-space) * 3); }
    .wrap { max-width: 1080px; margin: 0 auto; }
    .eyebrow { margin: 0 0 var(--hb-space); color: var(--hb-red); font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0 0 var(--hb-space); font-family: var(--hb-font-heading); font-size: clamp(30px, 5vw, 46px); line-height: 1.05; letter-spacing: -0.02em; }
    header p { margin: 0; max-width: 700px; color: #5d6668; line-height: 1.65; }
    main { max-width: 1080px; margin: 0 auto; padding: 0 calc(var(--hb-space) * 4) calc(var(--hb-space) * 5); }
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: calc(var(--hb-space) * 2); }
    .card { background: var(--hb-surface); border-radius: 12px; padding: calc(var(--hb-space) * 2); }
    .label { margin: 0 0 6px; color: #747d7f; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .value { margin: 0; font-family: var(--hb-font-heading); font-size: 27px; font-weight: 800; letter-spacing: -0.02em; }
    .value small { font-size: 11px; font-weight: 600; color: #747d7f; }
    .panels { display: grid; grid-template-columns: 1.2fr .9fr; gap: calc(var(--hb-space) * 2); margin-top: calc(var(--hb-space) * 2); }
    .panel { background: var(--hb-bg); border: 1px solid #e5e5e5; border-radius: 12px; padding: calc(var(--hb-space) * 2); }
    .panel h2 { margin: 0 0 var(--hb-space); font-family: var(--hb-font-heading); font-size: 18px; }
    .stage { display: flex; justify-content: space-between; gap: var(--hb-space); padding: 9px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
    .stage:last-child { border-bottom: 0; }
    .stage .detail { color: #747d7f; font-size: 11px; }
    .chip { display: inline-block; border-radius: 999px; padding: 4px 9px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; white-space: nowrap; }
    .chip.complete { background: #E7F7EC; color: #1E7A3C; }
    .chip.in_progress { background: #FFF3E0; color: #A35A00; }
    .chip.blocked { background: #FDE8EB; color: var(--hb-red); }
    .chip.pending { background: #EEEEEE; color: #5d6668; }
    .blockers { margin: 0; padding-left: 16px; color: var(--hb-red); font-size: 12px; line-height: 1.7; }
    .ready { display: inline-block; margin-top: var(--hb-space); padding: 8px 12px; border-radius: var(--hb-radius); background: #E7F7EC; color: #1E7A3C; font-size: 12px; font-weight: 800; }
    .blocked { background: #FDE8EB; color: var(--hb-red); }
    .status { margin-top: var(--hb-space); font-size: 12px; color: #747d7f; }
    @media (max-width: 900px) { .kpis { grid-template-columns: repeat(2, 1fr); } .panels { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<header>
  <div class="wrap">
    <p class="eyebrow">HB Technologies · Microsoft 365 onboarding</p>
    <h1>Client Onboarding Readiness</h1>
    <p>Stage gates, license true-up, DNS checks, mailbox migration, device and security readiness, blockers and handover for a new Microsoft 365 client.</p>
  </div>
</header>
<main>
  <section class="kpis">
    <article class="card"><p class="label">Readiness</p><p class="value" id="readiness">—</p></article>
    <article class="card"><p class="label">License delta</p><p class="value" id="license">—</p></article>
    <article class="card"><p class="label">Mailboxes</p><p class="value" id="migration">—</p></article>
    <article class="card"><p class="label">Devices</p><p class="value" id="devices">—</p></article>
    <article class="card"><p class="label">Security</p><p class="value" id="security">—</p></article>
  </section>

  <section class="panels">
    <article class="panel">
      <h2>Stage gates</h2>
      <div id="stages">Loading…</div>
      <p class="status" id="status">Loading onboarding…</p>
    </article>
    <article class="panel">
      <h2>Blockers</h2>
      <ul class="blockers" id="blockers"><li>Loading…</li></ul>
      <span class="ready" id="handover">Checking handover…</span>
    </article>
  </section>
</main>
<script>
  fetch('/api/onboarding/sample').then((r) => r.json()).then((data) => {
    const pct = (v) => v + '%';
    document.getElementById('readiness').textContent = pct(data.readinessPercent);
    document.getElementById('license').textContent = data.licenseDelta;
    document.getElementById('migration').textContent = pct(data.migrationPercent);
    document.getElementById('devices').textContent = pct(data.devicePercent);
    document.getElementById('security').textContent = pct(data.securityPercent);
    document.getElementById('stages').innerHTML = data.stages.map((stage) =>
      '<div class="stage"><span>' + stage.label + '<div class="detail">' + stage.detail + '</div></span><span class="chip ' + stage.status + '">' + stage.status.replace('_', ' ') + '</span></div>'
    ).join('');
    document.getElementById('blockers').innerHTML = data.blockers.length
      ? data.blockers.map((b) => '<li>' + b + '</li>').join('')
      : '<li style="color:#1E7A3C">No blockers</li>';
    const handover = document.getElementById('handover');
    handover.textContent = data.canHandover ? 'Ready for client handover' : 'Handover blocked';
    handover.className = 'ready' + (data.canHandover ? '' : ' blocked');
    document.getElementById('status').textContent = data.clientName + ' · due ' + new Date(data.dueAt).toLocaleDateString() + ' · ' + data.auditCount + ' audit events.';
  }).catch((error) => { document.getElementById('status').textContent = 'API offline: ' + error.message; });
</script>
</body>
</html>`;
}
