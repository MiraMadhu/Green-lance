const cfg = require('./config');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const rupees = (paise) => '₹' + (paise / 100).toLocaleString('en-IN');
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const trunc = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1).trim() + '…' : String(s));
const skillChips = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8).map((x) => `<span class="chip">${esc(x)}</span>`).join('');
const ago = (d) => {
  const t = new Date(String(d).replace(' ', 'T') + 'Z');
  const days = Math.floor((Date.now() - t) / 86400000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const initials = (n) => esc(String(n).split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());

function layout({ title, desc, path = '/', body, user, jsonld = '', noindex = false, scripts = '' }) {
  const fullTitle = title.includes(cfg.siteName) ? title : `${title} | ${cfg.siteName}`;
  const url = cfg.baseUrl + path;
  const d = trunc(desc, 158);
  const dash = user ? (user.role === 'admin' ? '/admin' : '/dashboard') : null;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(d)}">
<meta name="robots" content="${noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large'}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#0B1F3A">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${cfg.siteName}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(d)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${cfg.baseUrl}/img/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(d)}">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/style.css">
${jsonld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav">
  <div class="wrap nav-in">
    <a class="logo" href="/" aria-label="${cfg.siteName} home"><span class="logo-mark">G</span>${cfg.siteName}</a>
    <nav class="links" aria-label="Main">
      <a href="/freelancers">Find Freelancers</a>
      <a href="/projects">Find Projects</a>
      <a href="/pricing">Pricing</a>
    </nav>
    <div class="nav-cta">
      ${user
        ? `<a class="btn btn-ghost" href="${dash}">${user.role === 'admin' ? 'Admin' : 'Dashboard'}</a><button class="btn btn-outline" data-logout>Log out</button>`
        : `<a class="btn btn-ghost" href="/login">Log in</a><a class="btn btn-green" href="/register">Join free</a>`}
    </div>
  </div>
</header>
<main id="main">${body}</main>
<footer class="foot">
  <div class="wrap foot-in">
    <div><a class="logo logo-light" href="/"><span class="logo-mark">G</span>${cfg.siteName}</a>
      <p>Pay once. Connect directly. No commissions, no monthly fees.</p></div>
    <div><h4>Explore</h4><a href="/freelancers">Freelancers</a><a href="/projects">Projects</a><a href="/pricing">Pricing</a></div>
    <div><h4>Categories</h4>${cfg.categories.slice(0, 5).map((c) => `<a href="/freelancers?category=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>
    <div><h4>Account</h4><a href="/register?role=freelancer">Join as freelancer</a><a href="/register?role=client">Hire talent</a><a href="/login">Log in</a></div>
  </div>
  <div class="wrap copy">© ${new Date().getFullYear()} ${cfg.siteName}. All rights reserved.</div>
</footer>
<div id="toast" role="status" aria-live="polite"></div>
${scripts}
<script src="/js/app.js" defer></script>
</body>
</html>`;
}

const orgLd = () => ld({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': cfg.baseUrl + '/#org', name: cfg.siteName, url: cfg.baseUrl, logo: cfg.baseUrl + '/img/favicon.svg' },
    { '@type': 'WebSite', '@id': cfg.baseUrl + '/#site', url: cfg.baseUrl, name: cfg.siteName, publisher: { '@id': cfg.baseUrl + '/#org' },
      potentialAction: { '@type': 'SearchAction', target: cfg.baseUrl + '/freelancers?q={search_term_string}', 'query-input': 'required name=search_term_string' } }
  ]
});

function freelancerCard(f) {
  return `<article class="card person">
  <div class="avatar" aria-hidden="true">${initials(f.name)}</div>
  <div class="grow">
    <h3><a href="/freelancers/${esc(f.slug)}">${esc(f.name)}</a></h3>
    <p class="muted">${esc(f.headline)}</p>
    <div class="chips">${skillChips(f.skills)}</div>
    <div class="meta">${f.rate ? `<span>💼 ${esc(f.rate)}</span>` : ''}${f.location ? `<span>📍 ${esc(f.location)}</span>` : ''}${f.category ? `<span>${esc(f.category)}</span>` : ''}</div>
  </div>
  <a class="btn btn-outline sm" href="/freelancers/${esc(f.slug)}">View profile</a>
</article>`;
}

function projectCard(r) {
  return `<article class="card project">
  <div class="between"><span class="tag">${esc(r.category || 'Other')}</span><span class="muted sm-t">${ago(r.created_at)}</span></div>
  <h3><a href="/projects/${r.id}">${esc(r.title)}</a></h3>
  <p class="muted">${esc(trunc(r.description, 170))}</p>
  <div class="chips">${skillChips(r.skills)}</div>
  <div class="between meta"><span>${r.budget ? '💰 ' + esc(r.budget) : ''}${r.location ? ' &nbsp; 📍 ' + esc(r.location) : ''}</span><a class="btn btn-outline sm" href="/projects/${r.id}">View &amp; contact</a></div>
</article>`;
}

const catOptions = (sel) => `<option value="">All categories</option>` + cfg.categories.map((c) => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('');

function pager(base, q, cat, page, pages) {
  if (pages <= 1) return '';
  const link = (p, t) => `<a class="btn ${p === page ? 'btn-green' : 'btn-outline'} sm" href="${base}?${new URLSearchParams({ ...(q ? { q } : {}), ...(cat ? { category: cat } : {}), page: p })}">${t}</a>`;
  let out = '';
  for (let p = 1; p <= pages && p <= 10; p++) out += link(p, p);
  return `<nav class="pager" aria-label="Pagination">${out}</nav>`;
}

/* ================= pages ================= */

function home({ user, freelancers, projects, counts }) {
  const steps = [
    ['1', 'Create your free account', 'Join as a freelancer or a client in under a minute — email or Google.'],
    ['2', 'Post or browse', 'Clients post requirements. Freelancers showcase skills. Search both sides openly.'],
    ['3', 'Contact directly', 'Your first 2 contacts are free. After that, unlock once and use credits — no commissions ever.']
  ];
  const body = `
<section class="hero">
  <div class="wrap hero-in">
    <div>
      <span class="pill">One-time fee · Zero commission</span>
      <h1>Hire freelancers or find clients — <em>pay once, connect directly.</em></h1>
      <p class="lead">${cfg.siteName} is the pay-once freelance marketplace. Skip the 20% cuts and monthly plans. Get 2 free contacts, then unlock lifetime access and use credits only when you reach out.</p>
      <form class="search" action="/freelancers" method="get" role="search">
        <input name="q" placeholder="Search skills — e.g. React developer, logo designer" aria-label="Search freelancers">
        <button class="btn btn-green">Find freelancers</button>
      </form>
      <div class="hero-links"><a href="/register?role=freelancer">I'm a freelancer →</a><a href="/register?role=client">I'm hiring →</a></div>
    </div>
    <div class="hero-card" aria-hidden="true">
      <div class="stat"><b>${counts.freelancers}</b><span>Freelancers</span></div>
      <div class="stat"><b>${counts.clients}</b><span>Clients</span></div>
      <div class="stat"><b>${counts.projects}</b><span>Open projects</span></div>
      <div class="free-badge">🎁 2 free contacts<br><small>for every new member</small></div>
    </div>
  </div>
</section>

<section class="sec"><div class="wrap">
  <h2 class="center">How ${cfg.siteName} works</h2>
  <div class="grid3">${steps.map(([n, t, d]) => `<div class="card step"><span class="num">${n}</span><h3>${t}</h3><p class="muted">${d}</p></div>`).join('')}</div>
</div></section>

<section class="sec alt"><div class="wrap">
  <div class="between"><h2>Latest projects</h2><a href="/projects">Browse all →</a></div>
  <div class="grid2">${projects.length ? projects.map(projectCard).join('') : '<p class="muted">No open projects yet — be the first client to post one.</p>'}</div>
</div></section>

<section class="sec"><div class="wrap">
  <div class="between"><h2>Featured freelancers</h2><a href="/freelancers">Browse all →</a></div>
  <div class="list">${freelancers.length ? freelancers.map(freelancerCard).join('') : '<p class="muted">Freelancer profiles will appear here.</p>'}</div>
</div></section>

<section class="sec alt"><div class="wrap">
  <h2 class="center">Why pay-once beats commissions</h2>
  <div class="grid3">
    <div class="card"><h3>Keep 100% of your earnings</h3><p class="muted">We never touch your project payments. Agree on terms directly and keep every rupee.</p></div>
    <div class="card"><h3>Pay only when you reach out</h3><p class="muted">1 credit = 1 new contact. Credits never expire and there is no monthly subscription.</p></div>
    <div class="card"><h3>Both sides are verified buyers</h3><p class="muted">Because everyone pays to contact, you talk to serious clients and committed freelancers.</p></div>
  </div>
  <div class="center cta"><a class="btn btn-green lg" href="/register">Create free account</a></div>
</div></section>`;
  return layout({
    title: 'Hire Freelancers & Find Clients — Pay Once, No Commission',
    desc: 'GreenLance is a pay-once freelance marketplace. Post requirements, find skilled freelancers, and contact clients directly with credits. 2 free contacts, no commissions.',
    path: '/', body, user, jsonld: orgLd()
  });
}

function pricing({ user }) {
  const p = cfg.plans;
  const body = `
<section class="page-head"><div class="wrap"><h1>Simple, one-time pricing</h1><p class="lead">No subscriptions. No commissions. Start free — pay only when you want to contact more people.</p></div></section>
<section class="sec"><div class="wrap">
  <div class="grid3 pricing">
    <div class="card plan"><h3>Free start</h3><div class="price">₹0</div><ul class="ticks"><li>Create profile / post requirements</li><li>Browse everyone</li><li><b>${cfg.freeContacts} free contacts</b></li></ul><a class="btn btn-outline" href="/register">Get started</a></div>
    <div class="card plan best"><span class="ribbon">Best value</span><h3>${p.unlock.label}</h3><div class="price">${rupees(p.unlock.amount)}<small> once</small></div><ul class="ticks"><li>Lifetime access, no renewals</li><li><b>${p.unlock.credits} starter credits included</b></li><li>Unlimited profile &amp; requirement posts</li><li>Unlock credit packs anytime</li></ul>
      ${user && user.role !== 'admin' ? `<button class="btn btn-green" data-pay="unlock">Unlock now</button>` : `<a class="btn btn-green" href="/register">Join &amp; unlock</a>`}</div>
    <div class="card plan"><h3>Credit packs</h3><ul class="packs">
      ${['pack_10', 'pack_30', 'pack_100'].map((k) => `<li><span>${p[k].credits} credits</span><b>${rupees(p[k].amount)}</b>${user && user.role !== 'admin' ? `<button class="btn btn-outline sm" data-pay="${k}">Buy</button>` : ''}</li>`).join('')}
    </ul><p class="muted sm-t">1 credit = 1 new contact. Credits never expire. Requires one-time unlock.</p></div>
  </div>
  <div class="faq">
    <h2>Questions</h2>
    <details><summary>What counts as a contact?</summary><p>Contacting a person for the first time — you send an intro message and see their email and phone. Re-opening a contact you already unlocked is free.</p></details>
    <details><summary>Do you take a cut of my project payments?</summary><p>Never. Agree on price and payment directly with the other person.</p></details>
    <details><summary>Does it work the same for freelancers and clients?</summary><p>Yes. Both sides get ${cfg.freeContacts} free contacts, then a one-time unlock and credits.</p></details>
    <details><summary>Do credits expire?</summary><p>No. Buy once and use them whenever you like.</p></details>
  </div>
</div></section>`;
  const faq = ld({
    '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
      ['What counts as a contact?', 'Contacting a person for the first time — you send an intro message and see their email and phone. Re-opening a contact you already unlocked is free.'],
      ['Do you take a cut of my project payments?', 'Never. Agree on price and payment directly with the other person.'],
      ['Do credits expire?', 'No. Buy once and use them whenever you like.']
    ].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))
  });
  return layout({
    title: 'Pricing — One-time Unlock & Credit Packs',
    desc: `Start with ${cfg.freeContacts} free contacts. Unlock lifetime access for ${rupees(p.unlock.amount)} one-time, then buy credit packs only when you need them. No commission.`,
    path: '/pricing', body, user, jsonld: faq, scripts: razorpayScript()
  });
}

const razorpayScript = () => (cfg.razorpay.keyId ? '<script src="https://checkout.razorpay.com/v1/checkout.js" defer></script>' : '');

function freelancerList({ user, rows, q, cat, page, pages, total }) {
  const body = `
<section class="page-head"><div class="wrap"><h1>${cat ? esc(cat) + ' Freelancers' : 'Find Freelancers'}</h1><p class="lead">${total} skilled freelancer${total === 1 ? '' : 's'} ready to work${q ? ` matching “${esc(q)}”` : ''}.</p>
<form class="filters" method="get" action="/freelancers"><input name="q" value="${esc(q)}" placeholder="Skill, role or name" aria-label="Search"><select name="category" aria-label="Category">${catOptions(cat)}</select><button class="btn btn-green">Search</button></form></div></section>
<section class="sec"><div class="wrap"><div class="list">${rows.length ? rows.map(freelancerCard).join('') : '<p class="muted">No freelancers found. Try a different search.</p>'}</div>${pager('/freelancers', q, cat, page, pages)}</div></section>`;
  const canon = '/freelancers' + (cat && !q && page === 1 ? '?category=' + encodeURIComponent(cat) : '');
  return layout({
    title: cat ? `${cat} Freelancers for Hire` : 'Find Freelancers for Hire',
    desc: `Browse ${total} freelancers${cat ? ' in ' + cat : ''}. Contact directly with no commission — 2 free contacts to start.`,
    path: canon, body, user, noindex: !!q || page > 1
  });
}

function freelancerPage({ user, f, contacted }) {
  const canContact = !user || user.role === 'client';
  const body = `
<section class="page-head"><div class="wrap profile-head">
  <div class="avatar xl" aria-hidden="true">${initials(f.name)}</div>
  <div><h1>${esc(f.name)}</h1><p class="lead">${esc(f.headline)}</p>
  <div class="meta light">${f.rate ? `<span>💼 ${esc(f.rate)}</span>` : ''}${f.location ? `<span>📍 ${esc(f.location)}</span>` : ''}${f.category ? `<span>${esc(f.category)}</span>` : ''}</div></div>
</div></section>
<section class="sec"><div class="wrap two">
  <div class="card"><h2>About</h2><p class="pre">${esc(f.bio || 'This freelancer has not added a bio yet.')}</p><h3>Skills</h3><div class="chips">${skillChips(f.skills)}</div></div>
  <aside class="card side">${contactBox({ user, targetId: f.id, name: f.name, contacted, canContact, role: 'freelancer', reqId: null })}</aside>
</div></section>`;
  const person = ld({
    '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: {
      '@type': 'Person', name: f.name, jobTitle: f.headline, description: trunc(f.bio || f.headline, 300),
      knowsAbout: String(f.skills || '').split(',').map((s) => s.trim()).filter(Boolean),
      ...(f.location ? { homeLocation: { '@type': 'Place', name: f.location } } : {}), url: `${cfg.baseUrl}/freelancers/${f.slug}`
    }
  });
  return layout({
    title: `${f.name} — ${f.headline}`,
    desc: `${f.name}, ${f.headline}. ${f.bio ? trunc(f.bio, 100) : ''} Skills: ${f.skills || 'see profile'}. Contact directly on ${cfg.siteName}.`,
    path: `/freelancers/${f.slug}`, body, user, jsonld: person, scripts: razorpayScript()
  });
}

function projectList({ user, rows, q, cat, page, pages, total }) {
  const body = `
<section class="page-head"><div class="wrap"><h1>${cat ? esc(cat) + ' Projects' : 'Find Projects & Clients'}</h1><p class="lead">${total} open requirement${total === 1 ? '' : 's'} from clients looking for freelancers${q ? ` matching “${esc(q)}”` : ''}.</p>
<form class="filters" method="get" action="/projects"><input name="q" value="${esc(q)}" placeholder="Keyword or skill" aria-label="Search"><select name="category" aria-label="Category">${catOptions(cat)}</select><button class="btn btn-green">Search</button></form></div></section>
<section class="sec"><div class="wrap"><div class="grid2">${rows.length ? rows.map(projectCard).join('') : '<p class="muted">No open projects found. Try a different search.</p>'}</div>${pager('/projects', q, cat, page, pages)}</div></section>`;
  return layout({
    title: cat ? `${cat} Projects & Freelance Jobs` : 'Freelance Projects & Client Requirements',
    desc: `Browse ${total} open freelance projects${cat ? ' in ' + cat : ''}. Contact clients directly — no bidding fees, no commission.`,
    path: '/projects' + (cat && !q && page === 1 ? '?category=' + encodeURIComponent(cat) : ''), body, user, noindex: !!q || page > 1
  });
}

function projectPage({ user, r, contacted }) {
  const open = r.status === 'open';
  const canContact = open && (!user || user.role === 'freelancer');
  const body = `
<section class="page-head"><div class="wrap"><span class="pill">${esc(r.category || 'Other')}</span><h1>${esc(r.title)}</h1>
<div class="meta light"><span>Posted ${ago(r.created_at)}</span>${r.budget ? `<span>💰 ${esc(r.budget)}</span>` : ''}${r.location ? `<span>📍 ${esc(r.location)}</span>` : ''}<span>${open ? '🟢 Open' : '🔴 Closed'}</span></div></div></section>
<section class="sec"><div class="wrap two">
  <div class="card"><h2>Project details</h2><p class="pre">${esc(r.description)}</p><h3>Skills wanted</h3><div class="chips">${skillChips(r.skills) || '<span class="muted">Not specified</span>'}</div></div>
  <aside class="card side">${open ? contactBox({ user, targetId: r.client_id, name: r.client_name, contacted, canContact, role: 'client', reqId: r.id }) : '<p class="muted">This requirement has been closed by the client.</p>'}</aside>
</div></section>`;
  const jsonld = ld({
    '@context': 'https://schema.org', '@type': 'WebPage', name: r.title, description: trunc(r.description, 300),
    url: `${cfg.baseUrl}/projects/${r.id}`, datePublished: r.created_at.replace(' ', 'T') + 'Z'
  });
  return layout({
    title: `${r.title} — ${r.category || 'Freelance'} Project`,
    desc: `${trunc(r.description, 120)} ${r.budget ? 'Budget: ' + r.budget + '.' : ''} Contact the client directly on ${cfg.siteName}.`,
    path: `/projects/${r.id}`, body, user, jsonld, noindex: !open, scripts: razorpayScript()
  });
}

function contactBox({ user, targetId, name, contacted, canContact, role, reqId }) {
  const who = role === 'client' ? 'client' : 'freelancer';
  if (!user) {
    return `<h3>Contact this ${who}</h3><p class="muted">Create a free account to get your ${cfg.freeContacts} free contacts.</p><a class="btn btn-green block" href="/register?role=${role === 'client' ? 'freelancer' : 'client'}">Join free</a><a class="btn btn-ghost block" href="/login?next=${encodeURIComponent(reqId ? '/projects/' + reqId : '/')}">Log in</a>`;
  }
  if (user.id === targetId) return '<p class="muted">This is your own listing.</p>';
  if (!canContact) return `<p class="muted">${user.role === 'freelancer' ? 'Freelancers contact clients through their projects.' : 'Clients contact freelancers through their profiles.'}</p>`;
  if (contacted) return `<h3>✅ Already unlocked</h3><p class="muted">Find ${esc(name)}'s contact details in your <a href="/dashboard#contacts">dashboard</a>.</p>`;
  const free = Math.max(0, cfg.freeContacts - user.free_used);
  return `<h3>Contact ${esc(name)}</h3>
<p class="muted">${free > 0 ? `You have <b>${free} free contact${free === 1 ? '' : 's'}</b> left.` : user.premium ? `This will use <b>1 credit</b> (you have ${user.credits}).` : 'Free contacts used — unlock once to continue.'}</p>
<form data-contact data-target="${targetId}" ${reqId ? `data-req="${reqId}"` : ''}>
  <label for="msg">Your intro message</label>
  <textarea id="msg" name="message" rows="5" minlength="20" maxlength="1500" required placeholder="Hi ${esc(String(name).split(' ')[0])}, I'd love to discuss…"></textarea>
  <button class="btn btn-green block">Send &amp; reveal contact</button>
</form><div id="contact-result" class="result" hidden></div>`;
}

const authShell = (title, inner, user, extraDesc) => layout({
  title, desc: extraDesc || `${title} to ${cfg.siteName}.`, path: title.startsWith('Log') ? '/login' : '/register',
  body: `<section class="auth"><div class="card auth-card">${inner}</div></section>`, user, noindex: false
});

const googleBtn = (on, role) => on ? `<a class="btn btn-google block" href="/auth/google${role ? '?role=' + role : ''}"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-16.6z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.100 0 24s.9 7.600 2.600 10.800l7.900-6.100z"/><path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.400-5.700c-2.100 1.400-4.800 2.300-8.500 2.300-6.300 0-11.600-4.100-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48z"/></svg>Continue with Google</a><div class="or"><span>or use email</span></div>` : '';

function login({ user, err, next, googleOn }) {
  return authShell('Log in', `
<h1>Welcome back</h1>
${err ? `<div class="alert" role="alert">${esc(err)}</div>` : ''}
${googleBtn(googleOn)}
<form data-auth="/api/login" novalidate>
  <input type="hidden" name="next" value="${esc(next || '')}">
  <label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required>
  <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
  <div class="form-err" role="alert" hidden></div>
  <button class="btn btn-green block">Log in</button>
</form>
<p class="muted center">New here? <a href="/register">Create an account</a></p>`, user, `Log in to your ${cfg.siteName} account to contact freelancers and clients.`);
}

function register({ user, role, googleOn }) {
  return authShell('Create your account', `
<h1>Join ${cfg.siteName} free</h1>
<p class="muted center">Get ${cfg.freeContacts} free contacts the moment you sign up.</p>
<div class="seg" role="radiogroup" aria-label="I am a"><label><input type="radio" name="roleSel" value="freelancer" ${role === 'freelancer' ? 'checked' : ''}><span>I'm a freelancer</span></label><label><input type="radio" name="roleSel" value="client" ${role === 'client' ? 'checked' : ''}><span>I'm hiring</span></label></div>
${googleBtn(googleOn, role)}
<form data-auth="/api/register" novalidate>
  <input type="hidden" name="role" value="${role}">
  <label for="name">Full name</label><input id="name" name="name" autocomplete="name" required maxlength="80">
  <label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required>
  <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="72" data-strength>
  <ul class="rules" id="rules"><li data-r="len">8+ characters</li><li data-r="low">lowercase</li><li data-r="up">uppercase</li><li data-r="num">number</li><li data-r="sp">special character</li></ul>
  <div class="form-err" role="alert" hidden></div>
  <button class="btn btn-green block">Create account</button>
</form>
<p class="muted center">Already a member? <a href="/login">Log in</a></p>`, user, `Create a free ${cfg.siteName} account as a freelancer or client and get ${cfg.freeContacts} free contacts.`);
}

function statusStrip(u) {
  const free = Math.max(0, cfg.freeContacts - u.free_used);
  return `<div class="strip">
  <div class="stat-s"><b>${free}</b><span>Free contacts left</span></div>
  <div class="stat-s"><b>${u.credits}</b><span>Credits</span></div>
  <div class="stat-s"><b>${u.premium ? 'Unlocked ✓' : 'Free plan'}</b><span>Access</span></div>
  <div class="strip-act">${u.premium ? `<button class="btn btn-green" data-pay="pack_10">Buy 10 credits · ${rupees(cfg.plans.pack_10.amount)}</button>` : `<button class="btn btn-green" data-pay="unlock">Unlock · ${rupees(cfg.plans.unlock.amount)} once</button>`}</div>
</div>`;
}

function contactRows(list, direction) {
  if (!list.length) return `<p class="muted">${direction === 'out' ? 'Contacts you unlock will appear here.' : 'When someone contacts you, they appear here — free for you to read.'}</p>`;
  return list.map((c) => `<div class="card contact-row">
  <div class="avatar" aria-hidden="true">${initials(c.name)}</div>
  <div class="grow"><h4>${esc(c.name)} <span class="tag">${esc(c.role)}</span></h4>
  ${c.headline ? `<p class="muted sm-t">${esc(c.headline)}</p>` : ''}
  <p class="sm-t"><a href="mailto:${esc(c.email)}">${esc(c.email)}</a>${c.phone ? ` · <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''}</p>
  ${c.req_title ? `<p class="muted sm-t">Re: ${esc(c.req_title)}</p>` : ''}
  <p class="quote">${esc(trunc(c.message, 300))}</p><p class="muted sm-t">${ago(c.created_at)}</p></div>
</div>`).join('');
}

function dashboard({ user, profile, myReqs, unlocked, inbound }) {
  const isF = user.role === 'freelancer';
  const body = `
<section class="page-head"><div class="wrap"><h1>Hi, ${esc(user.name.split(' ')[0])} 👋</h1><p class="lead">${isF ? 'Complete your profile so clients can find you, then reach out to projects.' : 'Post what you need and reach out to freelancers directly.'}</p></div></section>
<section class="sec"><div class="wrap">
  ${statusStrip(user)}
  <div class="tabs" role="tablist"><button class="tab on" data-tab="t-profile">Profile</button>${isF ? '' : '<button class="tab" data-tab="t-req">My requirements</button>'}<button class="tab" data-tab="t-contacts" id="contacts">Unlocked (${unlocked.length})</button><button class="tab" data-tab="t-inbound">Interested in you (${inbound.length})</button></div>

  <div class="pane on" id="t-profile"><form class="card form" data-save="/api/profile" data-method="PUT" novalidate>
    <div class="row2"><div><label for="p-name">Full name</label><input id="p-name" name="name" value="${esc(user.name)}" required></div><div><label for="p-phone">Phone (shown only to people you contact or who contact you)</label><input id="p-phone" name="phone" value="${esc(user.phone)}"></div></div>
    <label for="p-head">${isF ? 'Professional headline' : 'Short tagline'}</label><input id="p-head" name="headline" maxlength="120" value="${esc(profile.headline)}" placeholder="${isF ? 'e.g. Full-stack developer · React & Node.js' : 'e.g. Founder at an e-commerce startup'}">
    <label for="p-bio">About</label><textarea id="p-bio" name="bio" rows="5" maxlength="2000">${esc(profile.bio)}</textarea>
    <div class="row2"><div><label for="p-cat">Category</label><select id="p-cat" name="category">${catOptions(profile.category)}</select></div><div><label for="p-loc">Location</label><input id="p-loc" name="location" value="${esc(profile.location)}" placeholder="City, Country or Remote"></div></div>
    <div class="row2"><div><label for="p-skills">Skills (comma separated)</label><input id="p-skills" name="skills" value="${esc(profile.skills)}"></div><div><label for="p-rate">${isF ? 'Rate (e.g. ₹800/hr)' : 'Typical budget'}</label><input id="p-rate" name="rate" value="${esc(profile.rate)}"></div></div>
    ${isF ? '' : `<div class="row2"><div><label for="p-co">Company</label><input id="p-co" name="company" value="${esc(profile.company)}"></div><div><label for="p-web">Website</label><input id="p-web" name="website" value="${esc(profile.website)}"></div></div>`}
    <div class="form-err" role="alert" hidden></div>
    <button class="btn btn-green">Save profile</button> ${isF && profile.headline ? `<a class="btn btn-ghost" href="/freelancers/${esc(profile.slug)}">View public profile</a>` : ''}
    ${isF && !profile.headline ? '<p class="muted sm-t">Add a headline to make your profile public and searchable.</p>' : ''}
  </form></div>

  ${isF ? '' : `<div class="pane" id="t-req">
    <form class="card form" data-save="/api/requirements" data-method="POST" data-reload novalidate>
      <h3>Post a new requirement</h3>
      <label for="r-title">Title</label><input id="r-title" name="title" maxlength="120" required placeholder="e.g. Need a React developer to build an admin dashboard">
      <label for="r-desc">What do you need?</label><textarea id="r-desc" name="description" rows="5" maxlength="4000" required></textarea>
      <div class="row2"><div><label for="r-cat">Category</label><select id="r-cat" name="category">${catOptions('')}</select></div><div><label for="r-bud">Budget</label><input id="r-bud" name="budget" placeholder="e.g. ₹40,000 – ₹60,000"></div></div>
      <div class="row2"><div><label for="r-sk">Skills needed</label><input id="r-sk" name="skills" placeholder="React, Node.js"></div><div><label for="r-loc">Location</label><input id="r-loc" name="location" placeholder="Remote / City"></div></div>
      <div class="form-err" role="alert" hidden></div><button class="btn btn-green">Publish requirement</button>
    </form>
    <h3 class="mt">Your requirements</h3>
    ${myReqs.length ? myReqs.map((r) => `<div class="card between"><div><h4><a href="/projects/${r.id}">${esc(r.title)}</a></h4><span class="muted sm-t">${r.status === 'open' ? '🟢 Open' : '🔴 Closed'} · ${ago(r.created_at)}</span></div>${r.status === 'open' ? `<button class="btn btn-outline sm" data-close="${r.id}">Close</button>` : ''}</div>`).join('') : '<p class="muted">No requirements yet.</p>'}
  </div>`}

  <div class="pane" id="t-contacts">${contactRows(unlocked, 'out')}</div>
  <div class="pane" id="t-inbound">${contactRows(inbound, 'in')}</div>
</div></section>`;
  return layout({ title: 'Dashboard', desc: 'Manage your profile, requirements and contacts.', path: '/dashboard', body, user, noindex: true, scripts: razorpayScript() });
}

function admin({ user, s, users, pays }) {
  const body = `
<section class="page-head"><div class="wrap"><h1>Admin</h1></div></section>
<section class="sec"><div class="wrap">
  <div class="grid3">${[['Freelancers', s.freelancers], ['Clients', s.clients], ['Unlocked members', s.premium], ['Open projects', s.open], ['Contacts made', s.contacts], ['Revenue', rupees(s.revenue)]].map(([k, val]) => `<div class="card stat-c"><b>${val}</b><span>${k}</span></div>`).join('')}</div>
  <h2 class="mt">Latest users</h2><div class="card scroll"><table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Unlocked</th><th>Credits</th><th>Joined</th></tr></thead><tbody>
  ${users.map((u) => `<tr><td>${u.id}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role}</td><td>${u.premium ? 'Yes' : 'No'}</td><td>${u.credits}</td><td>${ago(u.created_at)}</td></tr>`).join('')}</tbody></table></div>
  <h2 class="mt">Recent payments</h2><div class="card scroll"><table><thead><tr><th>User</th><th>Plan</th><th>Amount</th><th>Order</th><th>When</th></tr></thead><tbody>
  ${pays.map((p) => `<tr><td>${esc(p.email)}</td><td>${esc(p.plan)}</td><td>${rupees(p.amount)}</td><td>${esc(p.order_id)}</td><td>${ago(p.created_at)}</td></tr>`).join('') || '<tr><td colspan="5">No payments yet</td></tr>'}</tbody></table></div>
</div></section>`;
  return layout({ title: 'Admin', desc: 'Admin dashboard', path: '/admin', body, user, noindex: true });
}

function notFound({ user }) {
  return layout({ title: 'Page not found', desc: 'The page you are looking for does not exist.', path: '/404', user, noindex: true,
    body: `<section class="auth"><div class="card auth-card center"><h1>404</h1><p class="muted">We couldn't find that page.</p><a class="btn btn-green" href="/">Back to home</a></div></section>` });
}

module.exports = { home, pricing, freelancerList, freelancerPage, projectList, projectPage, login, register, dashboard, admin, notFound };
