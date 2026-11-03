# Virtual Office Hub — AI Server Package (Manager + 7 workers + Controller)

## Arxitektura
- **AI Manager**: foydalanuvchi buyrug‘ini 1–3 ta aniq vazifaga ajratadi.
- **7 AI xodim**: Dasturchi, Dizayner, Kontent mutaxassisi, Marketing mutaxassisi, Moliya mutaxassisi, Biznes tahlilchi, QA sinovchi. Har biri rolga mos alohida prompt bilan Responses API chaqirig‘ida ishlaydi.
- **Controller**: natijani baholaydi (85/100 mezon), kamchiliklarni xodim nomi bilan belgilaydi.
- **Qayta ishlash**: Controller ko‘rsatgan xodimlargagina tuzatish topshiriladi, maksimal 3 nazorat bosqichi.
- **Health endpoint**: `/api/health` server holati, model va API key sozlanganini (kalitning o‘zini emas) bildiradi.

## Xavfsizlik
`OPENAI_API_KEY` faqat hosting xizmatining Environment/Secrets bo‘limiga kiritiladi. Kalitni `index.html` ichiga, GitHub repositoryga yoki ChatGPT chatiga joylamang.

## Render orqali ishga tushirish
1. GitHub repositoryga paket ichidagi fayllarni yuklang.
2. Render → New → Web Service → repository tanlang.
3. Build Command: `npm install` (dependency yo‘q; bu qadam xavfsiz)
4. Start Command: `npm start`
5. Environment variables:
   - `OPENAI_API_KEY` = OpenAI Platform'dan olingan maxfiy API key
   - `OPENAI_MODEL` = `gpt-6-luna` (yoki accountda mavjud boshqa model)
6. Deploy tugagach, `https://SIZNING-SERVER.onrender.com/api/health` ochib `ok:true` va `apiKeyConfigured:true` ni tekshiring.
7. Server URL ochilganda `index.html` interfeysi chiqadi. Manager bo‘limida topshiriq berib sinang.

## Endpointlar
- `GET /api/health`
- `POST /api/manager` — JSON body: `{"command":"..."}`

## Hozirgi cheklov
Agentlar OpenAI API orqali haqiqiy AI javoblarini ishlab chiqaradi. Hozircha agentlar kompyuter/fayl tizimida o‘zlari mustaqil operatsiya bajarmaydi; kodni sandboxda ishga tushirish, browser automation va real test muhiti keyingi integratsiya bosqichidir. Controller matn va mezonlar bo‘yicha tekshiradi, amaliy testni o‘zi bajarib bermaydi.


## 3D ofis integratsiyasi
Asosiy paneldagi **3D Ofis** bo‘limi `office3d.html` sahifasini iframe orqali ochadi. Bu boshlang‘ich geometrik 3D prototip bo‘lib, hozircha fotorealistik NPC modellarini anglatmaydi. Three.js CDN orqali yuklanadi; internet kerak. AI Manager API serveri va 3D ko‘rinish bir Node serverda ishlaydi.
