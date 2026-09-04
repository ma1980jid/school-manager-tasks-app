const form = document.getElementById('searchForm');
const input = document.getElementById('studentName');
const button = document.getElementById('searchButton');
const message = document.getElementById('message');
const result = document.getElementById('result');
const studentNameResult = document.getElementById('studentNameResult');
const gradeResult = document.getElementById('gradeResult');
const sectionResult = document.getElementById('sectionResult');

function showMessage(text, type = 'error') {
  message.textContent = text;
  message.className = `message show ${type}`;
}

function clearMessage() {
  message.textContent = '';
  message.className = 'message';
}

function hideResult() {
  result.classList.add('hidden');
  studentNameResult.textContent = '';
  gradeResult.textContent = '';
  sectionResult.textContent = '';
}

function setLoading(loading) {
  button.disabled = loading;
  button.classList.toggle('loading', loading);
  input.disabled = loading;
}

function meaningfulNameParts(value = '') {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => part !== 'بن' && part !== 'ابن');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const name = input.value.trim();
  clearMessage();
  hideResult();

  if (meaningfulNameParts(name).length < 3) {
    showMessage('يرجى إدخال الاسم الثلاثي للطالب على الأقل.');
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
      showMessage(data?.message || 'تعذر إتمام عملية البحث. يرجى المحاولة مرة أخرى.');
      return;
    }

    studentNameResult.textContent = data.student.name || '—';
    gradeResult.textContent = data.student.grade || '—';
    sectionResult.textContent = data.student.section || '—';
    result.classList.remove('hidden');
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    showMessage('تعذر الاتصال بالخدمة حاليًا. يرجى التحقق من الاتصال والمحاولة لاحقًا.');
  } finally {
    setLoading(false);
  }
});

input.addEventListener('input', () => {
  clearMessage();
  hideResult();
});
