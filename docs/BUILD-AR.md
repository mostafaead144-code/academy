# بناء ملفات الواجهة

ملفات `assets/build/*` تُنتج من المصادر في `v22/` و`v20-ui/` و`api/m5.css` حسب الوصفة في `tools/bundles.json`.

```bash
npm install        # مرة واحدة (يحتاج Node.js 18 أو أحدث)
npm run check      # يعرض الحزم التي ستتغير دون كتابة أي ملف
npm run build      # يبني الحزم الجديدة ويحدّث index.html وadmin.html وteacher.html وparent.html
```

- عدّل المصدر (`v22/*.js` أو `v22/*.css`)، ولا تعدّل `assets/build` يدويًا أبدًا.
- اسم كل حزمة يحمل بصمة محتواها، لذلك لا يحتاج المتصفح لمسح التخزين المؤقت.
- الحزم القديمة لا تُحذف تلقائيًا؛ الحذف يتم عبر قائمة الحذف في ملاحظات كل إصدار.
- `node_modules` و`package.json` و`tools/` غير مطلوبة على Hostinger.
