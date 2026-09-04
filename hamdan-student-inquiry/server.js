const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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

const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, message: 'تم تجاوز عدد محاولات البحث المسموح بها. حاول لاحقًا.' }
});

function normalizeArabic(value = '') {
  return String(value)
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function loadStudentsFallback() {
  if (process.env.STUDENTS_JSON) {
    try {
      const parsed = JSON.parse(process.env.STUDENTS_JSON);
      if (Array.isArray(parsed)) return parsed;
    } catch (error) {
      console.error('Invalid STUDENTS_JSON environment variable');
    }
  }

  const localFile = path.join(__dirname, 'data', 'students.json');
  if (fs.existsSync(localFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(localFile, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    } catch (error) {
      console.error('Invalid local students.json file');
    }
  }

  return [];
}

async function searchSupabase(normalizedName) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;

  const params = new URLSearchParams();
  params.set('select', 'student_name,grade,section');
  params.set('normalized_name', `eq.${normalizedName}`);
  params.set('limit', '2');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/hamdan_students?${params.toString()}`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(7000)
  });

  if (!response.ok) {
    console.error(`Supabase search failed with HTTP ${response.status}`);
    throw new Error('SUPABASE_SEARCH_FAILED');
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

app.post('/api/search', searchLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const rawName = req.body?.name;
  const name = normalizeArabic(rawName);

  if (!name || name.length < 8 || name.length > 120) {
    return res.status(400).json({
      ok: false,
      message: 'يرجى إدخال اسم الطالب الثلاثي والقبيلة بشكل صحيح.'
    });
  }

  let matches;

  try {
    const supabaseMatches = await searchSupabase(name);

    if (supabaseMatches !== null) {
      matches = supabaseMatches.map(row => ({
        name: row.student_name,
        grade: row.grade,
        section: row.section
      }));
    } else {
      const students = loadStudentsFallback();
      matches = students.filter(student => normalizeArabic(student.name) === name).slice(0, 2);
    }
  } catch (error) {
    return res.status(503).json({
      ok: false,
      message: 'تعذر الاتصال ببيانات الطلاب حاليًا. يرجى المحاولة بعد قليل.'
    });
  }

  if (!matches.length) {
    const hasConfiguredSource = Boolean(
      (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) || loadStudentsFallback().length
    );

    if (!hasConfiguredSource) {
      return res.status(503).json({
        ok: false,
        message: 'بيانات الطلاب غير مفعّلة حاليًا. يرجى مراجعة إدارة المدرسة.'
      });
    }

    return res.status(404).json({
      ok: false,
      message: 'لم يتم العثور على طالب مطابق. تأكد من كتابة الاسم الثلاثي والقبيلة كما هو مسجل.'
    });
  }

  if (matches.length > 1) {
    return res.status(409).json({
      ok: false,
      message: 'يوجد أكثر من طالب بالاسم نفسه. يرجى مراجعة إدارة المدرسة.'
    });
  }

  const student = matches[0];
  return res.json({
    ok: true,
    student: {
      name: student.name,
      grade: student.grade,
      section: student.section
    }
  });
});

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '1h',
  index: 'index.html'
}));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Hamdan student inquiry service running on port ${PORT}`);
});
