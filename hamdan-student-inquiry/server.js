const express = require('express');
const helmet = require('helmet');
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
    .filter(token => token !== 'بن' && token !== 'ابن');

  const out = [];

  for (let i = 0; i < src.length; i += 1) {
    if (
      src[i] === 'عبد' &&
      src[i + 1] &&
      (src[i + 1] === 'الله' || src[i + 1].startsWith('ال'))
    ) {
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

function exactMatch(queryTokens, studentTokens) {
  return (
    queryTokens.length === studentTokens.length &&
    queryTokens.every((token, index) => sameToken(token, studentTokens[index], index))
  );
}

function prefixMatch(queryTokens, studentTokens) {
  return (
    queryTokens.length <= studentTokens.length &&
    queryTokens.every((token, index) => sameToken(token, studentTokens[index], index))
  );
}

function orderedMatch(queryTokens, studentTokens) {
  if (
    !queryTokens.length ||
    !studentTokens.length ||
    !sameToken(queryTokens[0], studentTokens[0], 0)
  ) {
    return false;
  }

  let studentIndex = 1;

  for (let queryIndex = 1; queryIndex < queryTokens.length; queryIndex += 1) {
    let found = false;

    while (studentIndex < studentTokens.length) {
      if (sameToken(queryTokens[queryIndex], studentTokens[studentIndex], queryIndex)) {
        found = true;
        studentIndex += 1;
        break;
      }
      studentIndex += 1;
    }

    if (!found) return false;
  }

  return true;
}

function scoreName(studentName, queryTokens) {
  const studentTokens = nameTokens(studentName);

  if (!studentTokens.length || !queryTokens.length) return 0;

  // الاسم الأحادي أو الثنائي يقبل فقط عند التطابق الكامل حفاظًا على الخصوصية.
  if (queryTokens.length < 3) {
    return exactMatch(queryTokens, studentTokens) ? 100 : 0;
  }

  if (exactMatch(queryTokens, studentTokens)) return 100;
  if (prefixMatch(queryTokens, studentTokens)) return 90;
  if (orderedMatch(queryTokens, studentTokens)) return 70;

  return 0;
}

function supabaseHeaders() {
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Accept: 'application/json'
  };

  if (!SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  }

  return headers;
}

let studentCache = [];
let studentCacheExpiresAt = 0;
let studentCacheLoading = null;

async function fetchStudentPage(offset, limit) {
  const params = new URLSearchParams();
  params.set('select', 'id,student_name,grade,section');
  params.set('order', 'id.asc');
  params.set('offset', String(offset));
  params.set('limit', String(limit));

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/hamdan_students?${params.toString()}`,
    {
      headers: supabaseHeaders(),
      signal: AbortSignal.timeout(10000)
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`Supabase roster fetch failed ${response.status}: ${body.slice(0, 250)}`);
    throw new Error('SUPABASE_ROSTER_FETCH_FAILED');
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function loadAllStudentsFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }

  const pageSize = 500;
  const rows = [];

  for (let offset = 0; offset < 5000; offset += pageSize) {
    const page = await fetchStudentPage(offset, pageSize);
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  console.log(`Student roster cache loaded: ${rows.length} rows`);
  return rows;
}

async function getStudents() {
  const now = Date.now();

  if (studentCache.length && now < studentCacheExpiresAt) {
    return studentCache;
  }

  if (studentCacheLoading) {
    return studentCacheLoading;
  }

  studentCacheLoading = loadAllStudentsFromSupabase()
    .then(rows => {
      studentCache = rows;
      studentCacheExpiresAt = Date.now() + 30 * 60 * 1000;
      return studentCache;
    })
    .finally(() => {
      studentCacheLoading = null;
    });

  return studentCacheLoading;
}

function bestMatches(rows, queryTokens) {
  const ranked = rows
    .map(row => ({
      row,
      score: scoreName(row.student_name, queryTokens)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return [];

  const bestScore = ranked[0].score;

  return ranked
    .filter(item => item.score === bestScore)
    .map(item => item.row)
    .slice(0, 4);
}

app.get('/api/health', async (req, res) => {
  try {
    const rows = await getStudents();
    return res.json({
      ok: true,
      database: 'connected',
      studentCount: rows.length
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      database: 'unavailable'
    });
  }
});

// البحث مفتوح بلا حد عددي للمستخدم أو للشبكة.
app.post('/api/search', async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const rawName = String(req.body?.name || '').trim();
  const queryTokens = nameTokens(rawName);

  if (!rawName || rawName.length > 120 || !queryTokens.length) {
    return res.status(400).json({
      ok: false,
      message: 'يرجى إدخال اسم الطالب كما هو مسجل في المدرسة.'
    });
  }

  try {
    const rows = await getStudents();
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
      student: {
        name: student.student_name,
        grade: student.grade,
        section: student.section
      }
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

  // تسخين ذاكرة الطلاب مباشرة عند تشغيل الخادم دون كشف أي بيانات شخصية في السجل.
  getStudents().catch(error => {
    console.error('Initial student roster load failed:', error.message);
  });
});
