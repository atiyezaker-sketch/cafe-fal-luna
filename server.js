const http = require(‘http’);
const crypto = require(‘crypto’);
const OpenAI = require(‘openai’);

const PORT = process.env.PORT || 3000;
const results = new Map();

const openai = new OpenAI({
apiKey: process.env.OPENAI_API_KEY
});

const types = {
tarot: { title: ‘تاروت ۷۸ کارتی’ },
love: { title: ‘فال عشق و رابطه’ },
coffee: { title: ‘فال قهوه’ },
hafez: { title: ‘فال حافظ’ },
general: { title: ‘فال عمومی’ }
};

function escapeHtml(s = ‘’) {
return String(s).replace(/[&<>”’]/g, c => ({
‘&’: ‘&’,
‘<’: ‘<’,
‘>’: ‘>’,
‘”’: ‘"’,
“’”: ‘'’
}[c]));
}

function page(content, title = ‘کافه فال لونا’) {
return `<!doctype html>

<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{
margin:0;
font-family:Tahoma,Arial,sans-serif;
background:radial-gradient(ellipse at top,#38234d,#130f20 65%);
color:#fff;
line-height:1.9
}
.wrap{max-width:760px;margin:auto;padding:24px 16px}
.hero{text-align:center;padding:28px 10px 16px}
.moon{font-size:42px;color:#e9c982}
.brand{font-size:32px;margin:0;color:#f5dca0}
.sub{color:#d4c8dc}
.card{
background:#ffffff0d;
border:1px solid #ffffff24;
border-radius:20px;
padding:20px;
margin:16px 0;
box-shadow:0 12px 35px #0002
}
.grid{
display:grid;
grid-template-columns:repeat(auto-fit,minmax(135px,1fr));
gap:10px
}
.pick{
display:block;
text-decoration:none;
color:#fff;
background:#ffffff0d;
border:1px solid #d7b66a66;
border-radius:14px;
padding:16px;
text-align:center
}
.pick b{display:block;color:#f5dca0}
.label{display:block;margin:12px 0 5px}
input,textarea{
width:100%;
padding:12px;
border-radius:10px;
border:1px solid #ffffff30;
background:#171222;
color:#fff;
font:inherit
}
button,.btn{
display:inline-block;
border:0;
border-radius:12px;
padding:12px 20px;
background:#d8b86d;
color:#20152a;
font:inherit;
font-weight:bold;
text-decoration:none;
cursor:pointer;
margin-top:14px
}
.muted{font-size:13px;color:#c4b9ce}
.result{white-space:pre-wrap}
.center{text-align:center}
a{color:#f5dca0}
</style>
</head>
<body>
<main class="wrap">
<header class="hero">
<div class="moon">☾ ✦ ☽</div>
<h1 class="brand">کافه فال لونا</h1>
<div class="sub">لحظه‌ای برای مکث، نیت و شناخت بهتر خودت</div>
</header>
${content}
<footer class="center muted">
فال‌ها برای سرگرمی و خودشناسی هستند و پیش‌بینی قطعی آینده محسوب نمی‌شوند.
</footer>
</main>
</body>
</html>`;
}

function home() {
return page(`

<section class="card center">
<h2>به دنیای رازهای لونا خوش اومدی ✨</h2>
<p>نوع فال موردنظرت رو انتخاب کن، نیتت رو بنویس و نتیجه اختصاصی خودت رو دریافت کن.</p>
<div class="grid">
${Object.entries(types).map(([k,v]) => `
<a class="pick" href="/reading/${k}">
<b>${v.title}</b>
<span class="muted">شروع فال</span>
</a>
`).join('')}
</div>
</section>
<section class="card">
<h3>فال رایگان</h3>
<p>برای شروع، یک فال عمومی کوتاه دریافت کن.</p>
<a class="btn" href="/reading/general">شروع فال رایگان</a>
</section>`);
}

function form(type) {
const t = types[type];

if (!t) {
return page(’این نوع فال پیدا نشد. بازگشت’);
}

return page(`

<section class="card">
<a href="/">← بازگشت</a>
<h2>${t.title}</h2>
<p>چند لحظه آرام شو و نیتت رو مشخص کن.</p>
<form method="post" action="/generate">
<input type="hidden" name="type" value="${type}">
<label class="label">نام کوچک (اختیاری)</label>
<input name="name" maxlength="60" placeholder="نام شما">
<label class="label">نیت یا سؤال تو</label>
<textarea name="question" maxlength="1000" rows="4" required placeholder="سؤالت رو اینجا بنویس..."></textarea>
<button type="submit">دریافت فال اختصاصی</button>
</form>
</section>`);
}

function result(id) {
const r = results.get(id);

if (!r) {
return page(’این نتیجه پیدا نشد. بازگشت’);
}

return page(`

<section class="card">
<h2>نتیجه ${escapeHtml(types[r.type]?.title || 'فال لونا')}</h2>
<p><b>${escapeHtml(r.name || 'دوست لونا')} عزیز،</b></p>
<div class="result">${escapeHtml(r.text)}</div>
<a class="btn" href="/">گرفتن فال دیگر</a>
</section>`);
}

function readBody(req) {
return new Promise((resolve, reject) => {
let body = ‘’;

req.on('data', chunk => {
  body += chunk;
  if (body.length > 10000) {
    reject(new Error('درخواست بیش از حد بزرگ است'));
    req.destroy();
  }
});
req.on('end', () => resolve(new URLSearchParams(body)));
req.on('error', reject);

});
}

async function generateReading(type, name, question) {
const readingType = types[type].title;

const instructions = `
تو دستیار هوشمند و نویسنده فال‌های اختصاصی کافه فال لونا هستی.

نوع فال: ${readingType}
نام مخاطب: ${name || ‘دوست لونا’}
نیت یا سؤال مخاطب: ${question}

قوانین:

* به زبان فارسی روان، صمیمی و محترمانه پاسخ بده.
* پاسخ اختصاصی و مرتبط با سؤال مخاطب باشد.
* متن سطحی و تکراری ننویس.
* پاسخ را با مقدمه، تفسیر اصلی و جمع‌بندی ارائه کن.
* برای تاروت از ساختار نمادین کارت‌های تاروت استفاده کن.
* تاروت دارای ۷۸ کارت شامل ۲۲ آرکانای بزرگ و ۵۶ آرکانای کوچک است.
* برای فال حافظ از حال‌وهوای ادبی و معنوی اشعار حافظ الهام بگیر و شعر جعلی را به حافظ نسبت نده.
* برای فال قهوه از نمادهای فرضی و تفسیری استفاده کن.
* آینده را قطعی اعلام نکن.
* از ترساندن مخاطب یا دادن توصیه خطرناک خودداری کن.
* فال را برای سرگرمی و خودشناسی ارائه بده.
* در پایان یک پیام کوتاه و دلگرم‌کننده از طرف لونا بنویس.
    `;
    const response = await openai.responses.create({
    model: ‘gpt-4.1-mini’,
    instructions,
    input: ‘فال اختصاصی را با جزئیات مناسب تولید کن.’,
    max_output_tokens: 1400
    });
    return response.output_text || ‘متأسفانه نتیجه‌ای تولید نشد. دوباره تلاش کن.’;
    }

const server = http.createServer(async (req, res) => {
try {
const url = new URL(req.url, ‘http://localhost’);

res.setHeader('Content-Type', 'text/html; charset=utf-8');
if (req.method === 'GET' && url.pathname === '/') {
  res.end(home());
  return;
}
if (req.method === 'GET' && url.pathname.startsWith('/reading/')) {
  const type = url.pathname.split('/')[2];
  res.end(form(type));
  return;
}
if (req.method === 'GET' && url.pathname.startsWith('/result/')) {
  const id = url.pathname.split('/')[2];
  res.end(result(id));
  return;
}
if (req.method === 'POST' && url.pathname === '/generate') {
  const data = await readBody(req);
  const type = data.get('type');
  const name = (data.get('name') || '').slice(0, 60);
  const question = (data.get('question') || '').slice(0, 1000).trim();
  if (!types[type] || !question) {
    res.statusCode = 400;
    res.end(page('<section class="card">اطلاعات واردشده معتبر نیست. <a href="/">بازگشت</a></section>'));
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    res.statusCode = 500;
    res.end(page('<section class="card">کلید هوش مصنوعی در سرور تنظیم نشده است. لطفاً بعداً تلاش کن.</section>'));
    return;
  }
  res.end(page('<section class="card center"><h2>لونا در حال آماده‌کردن فال توست ✨</h2><p>چند لحظه صبر کن...</p></section>'));
  // نتیجه در درخواست جداگانه تولید می‌شود.
  return;
}
if (req.method === 'POST' && url.pathname === '/api/generate') {
  const data = await readBody(req);
  const type = data.get('type');
  const name = (data.get('name') || '').slice(0, 60);
  const question = (data.get('question') || '').slice(0, 1000).trim();
  if (!types[type] || !question) {
    res.statusCode = 400;
    res.end('اطلاعات معتبر نیست');
    return;
  }
  const text = await generateReading(type, name, question);
  const id = crypto.randomBytes(12).toString('hex');
  results.set(id, { type, name, text });
  res.statusCode = 303;
  res.setHeader('Location', '/result/' + id);
  res.end();
  return;
}
res.statusCode = 404;
res.end(page('<section class="card">صفحه پیدا نشد. <a href="/">بازگشت</a></section>'));

} catch (error) {
console.error(‘Server error:’, error.message);

if (!res.headersSent) {
  res.statusCode = 500;
  res.end(page('<section class="card">در تولید فال مشکلی پیش آمد. لطفاً دوباره تلاش کن.</section>'));
}

}
});

server.listen(PORT, ‘0.0.0.0’, () => {
console.log(Cafe Fal Luna running on ${PORT});
});
