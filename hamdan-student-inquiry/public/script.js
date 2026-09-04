const form = document.getElementById('searchForm');
const input = document.getElementById('studentName');
const button = document.getElementById('searchButton');
const message = document.getElementById('message');

const resultModal = document.getElementById('resultModal');
const resultBackdrop = document.getElementById('resultBackdrop');
const closeResultButton = document.getElementById('closeResultButton');

const studentNameResult = document.getElementById('studentNameResult');
const gradeResult = document.getElementById('gradeResult');
const sectionResult = document.getElementById('sectionResult');

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

function getNameTokens(value) {
  return normalizeArabic(value)
    .split(' ')
    .filter(Boolean)
    .filter(token => token !== 'بن' && token !== 'ابن');
}

function showMessage(text, type = 'error') {
  message.textContent = text;
  message.className = `message show ${type}`;
}

function clearMessage() {
  message.textContent = '';
  message.className = 'message';
}

function setLoading(loading) {
  button.disabled = loading;
  input.disabled = loading;
  button.classList.toggle('loading', loading);
}

function openResultModal(student) {
  studentNameResult.textContent = student?.name || '—';
  gradeResult.textContent = student?.grade || '—';
  sectionResult.textContent = student?.section || '—';

  resultModal.classList.remove('hidden');
  resultModal.setAttribute('aria-hidden', 'false');
}

function closeResultModal() {
  resultModal.classList.add('hidden');
  resultModal.setAttribute('aria-hidden', 'true');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  clearMessage();
  closeResultModal();

  const name = input.value.trim();
  const tokens = getNameTokens(name);

  if (tokens.length < 3) {
    showMessage('يرجى إدخال الاسم الثلاثي للطالب على الأقل.');
    input.focus();
    return;
  }

  if (name.length > 120) {
    showMessage('اسم الطالب المدخل طويل جدًا.');
    input.focus();
    return;
  }

  setLoading(true);

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ name })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      showMessage(
        data?.message ||
        'تعذر إتمام عملية البحث. يرجى المحاولة مرة أخرى.'
      );
      return;
    }

    openResultModal(data.student);
  } catch (error) {
    showMessage(
      'تعذر الاتصال بالخدمة حاليًا. يرجى التحقق من الاتصال والمحاولة مرة أخرى.'
    );
  } finally {
    setLoading(false);
  }
});

input.addEventListener('input', () => {
  clearMessage();
});

closeResultButton.addEventListener('click', closeResultModal);
resultBackdrop.addEventListener('click', closeResultModal);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !resultModal.classList.contains('hidden')) {
    closeResultModal();
  }
});
