const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'same-origin' }
}));
app.use(express.json({ limit: '16kb' }));

const networkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, message: 'تم تسجيل عدد كبير جدًا من الطلبات من هذه الشبكة. يرجى المحاولة بعد قليل.' }
});

const clientLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 40,
  standardHeaders: false,
  legacyHeaders: false,
  skip: req => !/^[a-zA-Z0-9_-]{12,80}$/.test(String(req.get('x-client-id') || '')),
  keyGenerator: req => `client:${req.get('x-client-id')}`,
  message: { ok: false, message: 'تم إجراء عدد كبير من عمليات البحث من هذا الجهاز. يرجى الانتظار قليلًا ثم المحاولة مرة أخرى.' }
});

function normalizeArabic(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/ـ/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/[ىيی]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ک/g, 'ك')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(value = '') {
  const src = normalizeArabic(value)
    .split(' ')
    .filter(Boolean)
    .filter(t => t !== 'بن' && t !== 'ابن');

  const out = [];
  for (let i = 0; i < src.length; i += 1) {
    if (src[i] === 'عبد' && src[i + 1] && (src[i + 1] === 'الله' || src[i + 1].startsWith('ال'))) {
      out.push(`عبد${src[i + 1]}`);
      i += 1;
    } else {
      out.push(src[i]);
    }
  }
  return out;
}

function sameToken(a, b, position) {
  if (a === b) return true;
  if (position > 0) {
    if (a.startsWith('ال') && a.slice(2) === b) return true;
    if (b.startsWith('ال') && b.slice(2) === a) return true;
  }
  return false;
}

function exactMatch(q, s) {
  return q.length === s.length && q.every((t, i) => sameToken(t, s[i], i));
}

function prefixMatch(q, s) {
  return q.length <= s.length && q.every((t, i) => sameToken(t, s[i], i));
}

function orderedMatch(q, s) {
  if (!q.length || !s.length || !sameToken(q[0], s[0], 0)) return false;
  let si = 1;
  for (let qi = 1; qi < q.length; qi += 1) {
    let found = false;
    while (si < s.length) {
      if (sameToken(q[qi], s[si], qi)) {
        found = true;
        si += 1;
        break;
      }
      si += 1;
    }
    if (!found) return false;
  }
  return true;
}

function scoreName(studentName, queryTokens) {
  const studentTokens = nameTokens(studentName);
  if (!studentTokens.length || !queryTokens.length) return 0;

  // الأسماء الأحادية والثنائية تقبل فقط عند كتابة الاسم الكامل المسجل.
  if (queryTokens.length < 3) return exactMatch(queryTokens, studentTokens) ? 100 : 0;

  if (exactMatch(queryTokens, studentTokens)) return 100;
  if (prefixMatch(queryTokens, studentTokens)) return 90;
  if (orderedMatch(queryTokens, studentTokens)) return 70;
  return 0;
}

function supabaseHeaders() {
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Accept: 'application/json' };
  if (!SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  }
  return headers;
}

function firstSearchKey(rawName) {
  const parts = normalizeArabic(rawName)
    .split(' ')
    .filter(Boolean)
    .filter(t => t !== 'بن' && t !== 'ابن');
  const first = parts[0] || '';
  return first.startsWith('عبد') ? 'عبد' : first;
}

async function fetchCandidates(rawName) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_NOT_CONFIGURED');

  const firstKey = firstSearchKey(rawName);
  if (!firstKey) return [];

  const params = new URLSearchParams();
  params.set('select', 'student_name,grade,section');
  params.set('normalized_name', `ilike.${firstKey}%`);
  params.set('limit', '300');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/hamdan_students?${params.toString()}`, {
    headers: supabaseHeaders(),
    signal: AbortSignal.timeout(7000)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`Supabase search failed ${response.status}: ${body.slice(0, 250)}`);
    throw new Error('SUPABASE_SEARCH_FAILED');
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function bestMatches(rows, queryTokens) {
  const ranked = rows
    .map(row => ({ row, score: scoreName(row.student_name, queryTokens) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return [];
  const best = ranked[0].score;
  return ranked.filter(x => x.score === best).map(x => x.row).slice(0, 4);
}

app.post('/api/search', networkLimiter, clientLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const rawName = String(req.body?.name || '').trim();
  const queryTokens = nameTokens(rawName);

  if (!rawName || rawName.length > 120 || !queryTokens.length) {
    return res.status(400).json({ ok: false, message: 'يرجى إدخال اسم الطالب كما هو مسجل في المدرسة.' });
  }

  try {
    const rows = await fetchCandidates(rawName);
    const matches = bestMatches(rows, queryTokens);

    if (!matches.length) {
      return res.status(404).json({
        ok: false,
        message: 'لم يتم العثور على طالب مطابق. اكتب الاسم كما هو مسجل، أو استخدم ثلاثة أجزاء صحيحة من الاسم بدءًا باسم الطالب.'
      });
    }

    if (matches.length > 1) {
      return res.status(409).json({
        ok: false,
        message: 'يوجد أكثر من طالب مطابق لهذا الاسم. أضف اسمًا آخر أو القبيلة لتحديد الطالب.'
      });
    }

    const student = matches[0];
    return res.json({
      ok: true,
      student: { name: student.student_name, grade: student.grade, section: student.section }
    });
  } catch (error) {
    console.error('Student search error:', error.message);
    return res.status(503).json({
      ok: false,
      message: 'تعذر الاتصال ببيانات الطلاب حاليًا. يرجى المحاولة بعد قليل.'
    });
  }
});

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: 0,
  index: 'index.html',
  setHeaders: res => res.setHeader('Cache-Control', 'no-cache')
}));

app.use((req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Hamdan student inquiry service running on port ${PORT}`);
});
