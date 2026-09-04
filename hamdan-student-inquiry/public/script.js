const express =
  require('express');

const helmet =
  require('helmet');

const rateLimit =
  require('express-rate-limit');

const path =
  require('path');


const app =
  express();


const PORT =
  process.env.PORT ||
  10000;


const SUPABASE_URL =
  String(
    process.env.SUPABASE_URL ||
    ''
  )
    .replace(
      /\/$/,
      ''
    );


const SUPABASE_SERVICE_ROLE_KEY =
  process.env
    .SUPABASE_SERVICE_ROLE_KEY ||
  '';


/* =========================================
   إعدادات Express
========================================= */

app.disable(
  'x-powered-by'
);


app.use(

  helmet({

    contentSecurityPolicy: {

      directives: {

        defaultSrc:
          ["'self'"],

        styleSrc: [
          "'self'",
          'https://fonts.googleapis.com'
        ],

        fontSrc: [
          "'self'",
          'https://fonts.gstatic.com'
        ],

        imgSrc: [
          "'self'",
          'data:'
        ],

        scriptSrc:
          ["'self'"],

        connectSrc:
          ["'self'"]

      }

    },

    crossOriginResourcePolicy: {
      policy: 'same-origin'
    }

  })

);


app.use(

  express.json({
    limit: '12kb'
  })

);


/* =========================================
   تحديد عدد محاولات البحث
========================================= */

const searchLimiter =
  rateLimit({

    windowMs:
      15 * 60 * 1000,

    limit:
      40,

    standardHeaders:
      'draft-8',

    legacyHeaders:
      false,

    message: {

      ok:
        false,

      message:
        'تم تجاوز عدد محاولات البحث المسموح بها. يرجى المحاولة لاحقًا.'

    }

  });


/* =========================================
   توحيد الكتابة العربية
========================================= */

function normalizeArabic(
  value = ''
) {

  return String(value)

    .trim()

    /* التشكيل */
    .replace(
      /[\u064B-\u065F\u0670]/g,
      ''
    )

    /* التطويل */
    .replace(
      /ـ/g,
      ''
    )

    /* أشكال الألف */
    .replace(
      /[إأآ]/g,
      'ا'
    )

    /* ألف مقصورة */
    .replace(
      /ى/g,
      'ي'
    )

    /* تاء مربوطة */
    .replace(
      /ة/g,
      'ه'
    )

    /* المسافات */
    .replace(
      /\s+/g,
      ' '
    )

    .toLowerCase();

}


/* =========================================
   إزالة كلمة "بن" من المقارنة
========================================= */

function getNameTokens(
  value = ''
) {

  return normalizeArabic(value)

    .split(' ')

    .filter(Boolean)

    .filter(

      token =>
        token !== 'بن'

    );

}


/* =========================================
   التحقق من أن اسم البحث
   هو بداية اسم الطالب
========================================= */

function nameStartsWith(
  searchTokens,
  studentTokens
) {

  if (
    searchTokens.length >
    studentTokens.length
  ) {

    return false;

  }


  for (
    let i = 0;
    i < searchTokens.length;
    i += 1
  ) {

    if (
      searchTokens[i] !==
      studentTokens[i]
    ) {

      return false;

    }

  }


  return true;

}


/* =========================================
   إعداد Headers الخاصة بـ Supabase
========================================= */

function getSupabaseHeaders() {

  const headers = {

    apikey:
      SUPABASE_SERVICE_ROLE_KEY,

    Accept:
      'application/json'

  };


  /*
    المفاتيح الحديثة:
    sb_secret_...

    لا تستخدم Bearer.

    أما service_role القديم فهو JWT.
  */

  if (
    !SUPABASE_SERVICE_ROLE_KEY
      .startsWith('sb_secret_')
  ) {

    headers.Authorization =
      `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;

  }


  return headers;

}


/* =========================================
   جلب المرشحين من Supabase

   نبحث أولًا بالاسم الأول لتقليل
   عدد السجلات القادمة إلى Render.
========================================= */

async function fetchCandidates(
  firstToken
) {

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {

    throw new Error(
      'SUPABASE_NOT_CONFIGURED'
    );

  }


  const params =
    new URLSearchParams();


  params.set(
    'select',
    'student_name,normalized_name,grade,section'
  );


  /*
    normalized_name مخزن مسبقًا
    بشكل موحد في قاعدة البيانات.

    * هي wildcard في PostgREST.
  */

  params.set(
    'normalized_name',
    `ilike.${firstToken}*`
  );


  /*
    500 أكثر من كافٍ لطلاب
    يحملون الاسم الأول نفسه.
  */

  params.set(
    'limit',
    '500'
  );


  const url =
    `${SUPABASE_URL}` +
    `/rest/v1/hamdan_students?` +
    params.toString();


  const response =
    await fetch(
      url,
      {

        method:
          'GET',

        headers:
          getSupabaseHeaders(),

        signal:
          AbortSignal.timeout(
            8000
          )

      }
    );


  if (
    !response.ok
  ) {

    const body =
      await response
        .text()
        .catch(
          () => ''
        );


    console.error(

      'Supabase search failed',

      response.status,

      body.slice(
        0,
        250
      )

    );


    throw new Error(
      'SUPABASE_SEARCH_FAILED'
    );

  }


  const rows =
    await response.json();


  if (
    !Array.isArray(rows)
  ) {

    return [];

  }


  return rows;

}


/* =========================================
   API البحث
========================================= */

app.post(

  '/api/search',

  searchLimiter,

  async (
    req,
    res
  ) => {

    /*
      منع تخزين نتائج الطلاب
      في Cache المتصفح.
    */

    res.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate'
    );


    const rawName =
      req.body?.name;


    if (
      typeof rawName !==
      'string'
    ) {

      return res
        .status(400)
        .json({

          ok:
            false,

          message:
            'يرجى إدخال اسم الطالب.'

        });

    }


    const cleanName =
      rawName.trim();


    const searchTokens =
      getNameTokens(
        cleanName
      );


    /*
      ثلاثة أسماء فعلية على الأقل.
      كلمة "بن" لا تحسب.
    */

    if (
      searchTokens.length < 3
    ) {

      return res
        .status(400)
        .json({

          ok:
            false,

          message:
            'يرجى إدخال الاسم الثلاثي للطالب على الأقل.'

        });

    }


    if (
      cleanName.length > 120
    ) {

      return res
        .status(400)
        .json({

          ok:
            false,

          message:
            'اسم الطالب المدخل غير صحيح.'

        });

    }


    try {

      /*
        الاسم الأول بعد التوحيد.
      */

      const firstToken =
        searchTokens[0];


      const candidates =
        await fetchCandidates(
          firstToken
        );


      /*
        المقارنة الفعلية تتم على الخادم.

        نحذف "بن" من اسم البحث
        ومن اسم الطالب.
      */

      const matches =
        candidates.filter(
          student => {

            const studentTokens =
              getNameTokens(

                student.normalized_name ||
                student.student_name

              );


            return nameStartsWith(

              searchTokens,

              studentTokens

            );

          }
        );


      /* =====================================
         لا يوجد طالب
      ===================================== */

      if (
        matches.length === 0
      ) {

        return res
          .status(404)
          .json({

            ok:
              false,

            message:
              'لم يتم العثور على طالب مطابق. تأكد من كتابة الاسم الثلاثي بشكل صحيح.'

          });

      }


      /* =====================================
         أكثر من طالب

         لا نخمن الطالب حتى لا تظهر
         بيانات طالب خاطئ.
      ===================================== */

      if (
        matches.length > 1
      ) {

        return res
          .status(409)
          .json({

            ok:
              false,

            message:
              'يوجد أكثر من طالب مطابق لهذا الاسم. يرجى إضافة الاسم الرابع أو القبيلة.'

          });

      }


      /* =====================================
         نتيجة واحدة
      ===================================== */

      const student =
        matches[0];


      return res.json({

        ok:
          true,

        student: {

          name:
            student.student_name,

          grade:
            student.grade,

          section:
            student.section

        }

      });

    }

    catch (error) {

      console.error(
        'Student search error:',
        error.message
      );


      return res
        .status(503)
        .json({

          ok:
            false,

          message:
            'تعذر الاتصال ببيانات الطلاب حاليًا. يرجى المحاولة بعد قليل.'

        });

    }

  }

);


/* =========================================
   الملفات الثابتة
========================================= */

app.use(

  express.static(

    path.join(
      __dirname,
      'public'
    ),

    {

      etag:
        true,

      maxAge:
        '1h',

      index:
        'index.html'

    }

  )

);


/* =========================================
   الصفحة الرئيسية
========================================= */

app.use(

  (
    req,
    res
  ) => {

    res.sendFile(

      path.join(
        __dirname,
        'public',
        'index.html'
      )

    );

  }

);


/* =========================================
   تشغيل الخادم
========================================= */

app.listen(

  PORT,

  '0.0.0.0',

  () => {

    console.log(
      `Hamdan student inquiry service running on port ${PORT}`
    );

  }

);
