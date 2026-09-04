const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

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

function loadStudents() {
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

app.post('/api/search', searchLimiter, (req, res) => {
  res.set('Cache-Control', 'no-store');

  const rawName = req.body?.name;
  const name = normalizeArabic(rawName);

  if (!name || name.length < 8 || name.length > 120) {
    return res.status(400).json({
      ok: false,
      message: 'يرجى إدخال اسم الطالب الثلاثي والقبيلة بشكل صحيح.'
    });
  }

  const students = loadStudents();
  if (!students.length) {
    return res.status(503).json({
      ok: false,
      message: 'بيانات الطلاب غير مفعّلة حاليًا. يرجى مراجعة إدارة المدرسة.'
    });
  }

  const matches = students.filter(student => normalizeArabic(student.name) === name);

  if (matches.length === 0) {
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

app.get('*path', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Hamdan student inquiry service running on port ${PORT}`);
});
