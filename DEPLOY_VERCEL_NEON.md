# 🚀 نشر التطبيق على Vercel + Neon (بديل Supabase المجاني الدائم)

> الدليل الكامل بالعربي. المعمارية: **مشروعين على Vercel** (واحد للواجهة وواحد
> للباك إند FastAPI) + **Neon كقاعدة PostgreSQL سيرفرليس** — بديل Supabase.
>
> ✅ **Neon**: مجاني دائم، **من غير كارت بنك**، scale-to-zero (مش بتحاسبك وقت
> الخمول)، ومفيش إيقاف تلقائي بعد أسبوع زي Supabase المجاني.

## لماذا Neon بدل Supabase؟
- مشروعنا بيستخدم القاعدة **بس** (مش Auth/Storage بتاع Supabase — الـ auth بتاعنا
  مكتوب بنفسنا في الباك إند). فاستبدالها بـ Neon **مش بيغيّر ولا سطر في الكود** —
  مجرد تغيير `DATABASE_URL`.
- خطة Neon المجانية: **0.5GB تخزين + 100 ساعة compute شهريًا** — كفاية جدًا لمشروع
  اختبارات صغير، وبتصحى تلقائيًا من الخمول في أجزاء من الثانية.

## مخطط النشر

```
جهازك (مرة واحدة)          Vercel (مشروع 1)               Vercel (مشروع 2)
───────────────────        ───────────────────            ───────────────────
alembic upgrade            الواجهة React (Vite)           الباك إند FastAPI
python -m app.create_admin root directory = /             root directory = /backend
         │
         ▼
Neon (PostgreSQL سيرفرليس)  └── https://<ui>.vercel.app ┘──► https://<api>.vercel.app
```

- الواجهة بتتكلم مع الباك إند عن طريق متغيّر `VITE_API_URL`.
- الباك إند شغال كـ **serverless function** من Vercel (Python runtime) — يناسبنا
  لأن طلباتنا قصيرة (تسجيل/حفظ/تسليم) ومفيش WebSocket ولا عمليات طويلة.
- **الـ migrations مش بتتعمل على Vercel** — بتتعمل مرة واحدة من جهازك على قاعدة
  Neon قبل ما ترفع.

---

## الخطوة 1 — إنشاء قاعدة Neon (مجاني، بلا كارت)

1. ادخل على [neon.tech](https://neon.tech) → سجّل بحساب (GitHub أو Google) →
   **Create a project**.
   - اسم المشروع (مثل `ms-eman`) + اختار منطقة قريبة (مثل `Frankfurt (eu-central-1)`).
   - تخطّي أي شاشات "تفعيل بطاقة" — الـ free plan مش محتاج كارت.
2. بعد الإنشاء هتلاقي **Connection string**. اختار **Connection pooling**
   (موصى به للـ serverless — بيستخدم بورت `5432` ومضيف `neon` محدد) أو مستقيم.
   - شكله تقريبًا:
     ```
     postgresql://neondb_owner:YOUR_PASSWORD@ep-XXXX-YYYY.us-east-1.aws.neon.tech/neondb?sslmode=require
     ```
3. **حوّله للشكل اللي التطبيق بيقريه** — استبدل أول `postgresql://` بـ
   `postgresql+psycopg2://` (خلي `?sslmode=require` في الآخر زي ما هو):
   ```
   postgresql+psycopg2://neondb_owner:YOUR_PASSWORD@ep-XXXX-YYYY.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```
   دي قيمة `DATABASE_URL`. لو في رموز خاصة في الباسورد (زي `@` أو `:` أو `#`)،
   لازم تـ encode لها (مثلاً `@` → `%40`).

> 💡 **اتأكد إن الاتصال يشتغل من جهازك قبل ما تكمّل.** في مشاكل SSL/شبكة ممكن
> تظهر هنا أسهل من على Vercel.

---

## الخطوة 2 — إنشاء الجداول + حساب المعلم (من جهازك، مرة واحدة)

من مجلد `backend/` على جهازك، مع تفعيل البيئة:

```bash
cd backend
# مثبّت المتطلبات
pip install -r requirements.txt

# 1) تشغيل الـ migrations على قاعدة Neon
export DATABASE_URL="postgresql+psycopg2://neondb_owner:YOUR_PASSWORD@ep-XXXX-YYYY.us-east-1.aws.neon.tech/neondb?sslmode=require"
alembic upgrade head

# 2) إنشاء حساب المعلم (أول مرة)
export ADMIN_EMAIL="you@example.com"
export ADMIN_PASSWORD="ضع-كلمة-مرور-قوية-طويلة"
export ADMIN_NAME="Ms Eman Zahy"
python -m app.create_admin
```

> `app.create_admin` آمن للاستخدام في الإنتاج (كلمة المرور إنت بتحددها وبتتحقّق
> أنها ≥ 8 أحرف). **مفيش أي حساب تجريبي بكلمة ضعيفة في الإنتاج.**
> بعد إنشاء حسابك تقدر تغيّر كلمة السر في أي وقت من صفحة **Settings** داخل التطبيق.

### على ويندوز (PowerShell)
```powershell
$env:DATABASE_URL="postgresql+psycopg2://neondb_owner:YOUR_PASSWORD@ep-XXXX-YYYY.us-east-1.aws.neon.tech/neondb?sslmode=require"
alembic upgrade head
$env:ADMIN_EMAIL="you@example.com"; $env:ADMIN_PASSWORD="..."; $env:ADMIN_NAME="Ms Eman Zahy"
python -m app.create_admin
```

---

## الخطوة 3 — رفع الباك إند على Vercel (مشروع 1)

1. اتأكد إن الكود الجاهز مترفوع على فرع من GitHub (هنا `arena/01a06e1a-ms-eman`).
2. افتح [vercel.com/new](https://vercel.com/new) → استورد ريبو `ms-eman`.
3. في شاشة الإعدادات، **مهم**:
   - **Root Directory**: `backend`
   - **Framework Preset**: Python (FastAPI) — Vercel بيلاقي `app` في `backend/index.py`
     تلقائيًا (الملف ده اتعمل لهذا الغرض).
   - **Production Branch**: `arena/01a06e1a-ms-eman` (أو الفرع اللي فيه الكود الجاهز).
4. ضيف **Environment Variables**:

   | المتغير | القيمة |
   |---------|--------|
   | `DATABASE_URL` | رابط Neon المحوّل (من الخطوة 1) |
   | `SECRET_KEY` | توليد: `openssl rand -hex 32` (احفظه) |
   | `ENVIRONMENT` | `production` |
   | `DEBUG` | `false` |
   | `CORS_ORIGINS` | قائمة JSON بكل روابط الواجهة، مثال: `["https://your-ui.vercel.app"]` |

5. اضغط **Deploy**. بعد ما يخلص خد **الرابط بتاع الـ API** (شكله
   `https://your-api-xxxx.vercel.app`).

> جرّب إن الباك إند شغال: افتح `https://your-api-xxxx.vercel.app/healthz` — المفروض
> يرجّع `{"status":"ok",...}`.

---

## الخطوة 4 — رفع الواجهة على Vercel (مشروع 2)

1. **New Project** تاني → استورد نفس الريبو `ms-eman`.
2. الإعدادات:
   - **Root Directory**: `/` (الجذر — فيه `package.json`)
   - **Framework Preset**: Vite
   - **Production Branch**: `arena/01a06e1a-ms-eman`
3. ضيف **Environment Variable**:

   | المتغير | القيمة |
   |---------|--------|
   | `VITE_API_URL` | `https://your-api-xxxx.vercel.app/api` (رابط الباك إند + `/api`) |

4. اضغط **Deploy**. هتاخد رابط زي `https://your-ui-xxxx.vercel.app`.

---

## الخطوة 5 — تشغيل التطبيق 🎉

1. افتح `https://your-ui-xxxx.vercel.app`.
2. سجّل الدخول بالإيميل وكلمة السر اللي عملتهم في الخطوة 2.
3. أنشئ امتحان (أو اعمل نسخة من النموذج)، انشره، وافتح رابطه كطالب.

---

## تحديثات بعد النشر (روتين عادي)

لو غيّرت كود الباك إند **وعايز تغيّر شكل قاعدة البيانات**:
1. اعمل migration جديد من جهازك:
   ```bash
   alembic revision --autogenerate -m "change"
   alembic upgrade head   # ضد DATABASE_URL بتاعة Neon
   ```
2. ارفع الكود — Vercel هيتحدّث تلقائيًا (مفيش حاجة للمخططات لأنه معمول قبلها).

لو غيّرت كود بس من غير تغيير في القاعدة، مجرد الـ push بيشغّل deploy جديد.

---

## الأسئلة الشائعة / الملاحظات

- **ليه مشروعين؟** الواجهة (static SPA) والباك إند (Python serverless) كل واحد
  محتاج إعدادات Build مختلفة و Root Directory مختلفة، فبنفصلهم في مشروعين على
  نفس الريبو.
- **هل Neon هيبقى في سيرفر قريب؟** اختار أقرب منطقة لجمهورك (مصر غالبًا
  `eu-central-1` / Frankfurt). مش هيبقى فرق محسوس مع تطبيقنا الصغير.
- **في ناس بتلاقي أن Python على Vercel "beta"**: ينفع لكن بيحتاج إعادة محاولة
  ساعات أول مرة (cold start بياخد ثانية). لو حسّيت إنه مش ثابت معاك بشكل مزعج،
  أسهل بديل يفضل مع Neon: شغّل نفس الباك إند على منصّة **Render** (مجاني) بنفس
  `DATABASE_URL` وبس — الواجهة تفضل على Vercel. أنا أجهّزلك الخطوات لو حابب.
- **الـ seed (ms.eman.zahy@test.com)** هو للـ development بس وبيعلن يرفض يشتغل في
  `ENVIRONMENT=production`. للرفع الحقيقي استخدم `app.create_admin` من فوق.
- **كلمة سر Neon**: لو فيها رموز خاصة، انسخ الرابط من لوحة Neon وعدّل الـ scheme
  والـ encode بعناية، وخلّيه في Environment Variables (مش في ملف `.env` مترفوع).
