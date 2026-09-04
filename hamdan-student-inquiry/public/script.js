const form =
  document.getElementById('searchForm');

const input =
  document.getElementById('studentName');

const button =
  document.getElementById('searchButton');

const message =
  document.getElementById('message');

const result =
  document.getElementById('result');

const studentNameResult =
  document.getElementById('studentNameResult');

const gradeResult =
  document.getElementById('gradeResult');

const sectionResult =
  document.getElementById('sectionResult');


/* =========================================
   توحيد الكتابة العربية
========================================= */

function normalizeArabic(value = '') {

  return String(value)

    .trim()

    /* إزالة التشكيل */
    .replace(
      /[\u064B-\u065F\u0670]/g,
      ''
    )

    /* إزالة التطويل */
    .replace(
      /ـ/g,
      ''
    )

    /* توحيد الألف */
    .replace(
      /[إأآ]/g,
      'ا'
    )

    /* توحيد الألف المقصورة */
    .replace(
      /ى/g,
      'ي'
    )

    /* توحيد التاء المربوطة */
    .replace(
      /ة/g,
      'ه'
    )

    /* توحيد المسافات */
    .replace(
      /\s+/g,
      ' '
    )

    .toLowerCase();

}


/* =========================================
   كلمات الاسم الفعلية

   كلمة "بن" لا تحسب ضمن أجزاء الاسم.
========================================= */

function getNameTokens(value) {

  return normalizeArabic(value)

    .split(' ')

    .filter(Boolean)

    .filter(
      token =>
        token !== 'بن'
    );

}


/* =========================================
   عرض الرسالة
========================================= */

function showMessage(
  text,
  type = 'error'
) {

  message.textContent =
    text;

  message.className =
    `message show ${type}`;

}


/* =========================================
   مسح الرسالة
========================================= */

function clearMessage() {

  message.textContent =
    '';

  message.className =
    'message';

}


/* =========================================
   إخفاء النتيجة
========================================= */

function hideResult() {

  result.classList.add(
    'hidden'
  );

  studentNameResult.textContent =
    '';

  gradeResult.textContent =
    '';

  sectionResult.textContent =
    '';

}


/* =========================================
   حالة التحميل
========================================= */

function setLoading(loading) {

  button.disabled =
    loading;

  input.disabled =
    loading;

  button.classList.toggle(
    'loading',
    loading
  );

}


/* =========================================
   تنفيذ البحث
========================================= */

form.addEventListener(
  'submit',

  async event => {

    event.preventDefault();

    clearMessage();
    hideResult();

    const name =
      input.value.trim();

    const tokens =
      getNameTokens(name);


    /*
      نطلب ثلاثة أسماء فعلية على الأقل.
      كلمة "بن" لا تحسب.
    */

    if (
      tokens.length < 3
    ) {

      showMessage(
        'يرجى إدخال الاسم الثلاثي للطالب على الأقل.'
      );

      input.focus();

      return;

    }


    if (
      name.length > 120
    ) {

      showMessage(
        'اسم الطالب المدخل طويل جدًا.'
      );

      input.focus();

      return;

    }


    setLoading(true);


    try {

      const response =
        await fetch(
          '/api/search',
          {

            method:
              'POST',

            headers: {

              'Content-Type':
                'application/json',

              'Accept':
                'application/json'

            },

            body:
              JSON.stringify({
                name
              })

          }
        );


      const data =
        await response
          .json()
          .catch(
            () => null
          );


      if (
        !response.ok ||
        !data?.ok
      ) {

        showMessage(
          data?.message ||
          'تعذر إتمام عملية البحث. يرجى المحاولة مرة أخرى.'
        );

        return;

      }


      studentNameResult.textContent =
        data.student.name ||
        '—';


      gradeResult.textContent =
        data.student.grade ||
        '—';


      sectionResult.textContent =
        data.student.section ||
        '—';


      result.classList.remove(
        'hidden'
      );


      /*
        تحريك النتيجة إلى مكان واضح،
        خصوصًا في الهاتف.
      */

      setTimeout(
        () => {

          result.scrollIntoView({

            behavior:
              'smooth',

            block:
              'nearest'

          });

        },
        80
      );

    }

    catch (error) {

      showMessage(
        'تعذر الاتصال بالخدمة حاليًا. يرجى التحقق من الاتصال والمحاولة مرة أخرى.'
      );

    }

    finally {

      setLoading(false);

    }

  }
);


/* =========================================
   عند تعديل الاسم
========================================= */

input.addEventListener(
  'input',

  () => {

    clearMessage();
    hideResult();

  }
);


/* =========================================
   الضغط على Enter في الهاتف
========================================= */

input.addEventListener(
  'keydown',

  event => {

    if (
      event.key === 'Enter'
    ) {

      input.blur();

    }

  }
);
