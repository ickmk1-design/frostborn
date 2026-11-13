// One-shot: pair every stages[*].completedText with a Turkish completedTextTr.
import fs from 'fs';

const TR = {
  'Survivor found! Now build the tent.': 'Bulundu! Şimdi çadır kur.',
  'Tent built! Rescue more survivors.': 'Çadır hazır! Daha fazla kişi kurtar.',
  'Wolf hunted! Now rescue survivors.': 'Kurt avlandı! Kişileri kurtar.',
  'Good! Now build the tent.': 'İyi! Şimdi çadır kur.',
  'One found! Now build the tent.': 'Biri bulundu! Şimdi çadır kur.',
  'Tent built! Rescue the rest.': 'Çadır hazır! Geri kalanı kurtar.',
  'Alpha Wolf slain! Now rescue survivors.': 'Alfa Kurt yenildi! Kişileri kurtar.',
  'Survivors rescued!': 'Kişiler kurtarıldı!',
  'Wolves hunted! Now build shelter.': 'Kurtlar avlandı! Barınak kur.',
  'Tent up! Rescue the survivors.': 'Çadır hazır! Kişileri kurtar.',
  'Shelter up! Rescue the rest.': 'Barınak hazır! Geri kalanı kurtar.',
  'Path cleared!': 'Yol açık!',
  'Scout down! Build shelter quickly.': 'Keşif düştü! Hemen barınak kur.',
  'Tent built! Now go rescue survivors.': 'Çadır hazır! Kurtarmaya git.',
  'Halfway there!': 'Yarı yoldayız!',
  'Pack thinned! Build shelter now.': 'Sürü seyreldi! Şimdi barınak kur.',
  'Tent built!': 'Çadır hazır!',
  'More are out there!': 'Daha fazlası var!',
  'Good! Now hunt — the pack is closing in.': 'İyi! Şimdi avla — sürü yaklaşıyor.',
  'Path cleared! Build shelter.': 'Yol açık! Barınak kur.',
  'Tent up! Find all survivors.': 'Çadır hazır! Herkesi bul.',
  'Alpha slain! Clear the remaining wolves.': 'Alfa yenildi! Kalan kurtları temizle.',
  'Threat neutralised! Build shelter.': 'Tehdit bitti! Barınak kur.',
  'Tent built! Now rescue everyone.': 'Çadır hazır! Şimdi herkesi kurtar.',
  'One found! Feed that fire.': 'Biri bulundu! Ateşi besle.',
  'Wolves down! Now build.': 'Kurtlar devrildi! Şimdi inşa et.',
  'Tent up! Rescue the rest.': 'Çadır hazır! Geri kalanı kurtar.',
  'Path cleared! Rescue now.': 'Yol açık! Hemen kurtar.',
  'Good! Now build tent and push deeper.': 'İyi! Çadırı kur ve ilerle.',
  'Tent up!': 'Çadır hazır!',
  'Deep path clear!': 'Derin yol açık!',
  '2 safe. Now deal with the wolves.': '2 kişi güvende. Şimdi kurtlarla ilgilen.',
  'Good! Build shelter now.': 'İyi! Şimdi barınak kur.',
  'Tent up! Deep wave incoming.': 'Çadır hazır! Derin dalga geliyor.',
  'Pack broken!': 'Sürü kırıldı!',
  'Beta down! Now rescue.': 'Beta devrildi! Şimdi kurtar.',
  '3 saved! Build quick.': '3 kurtarıldı! Hızlı inşa et.',
  'Shelter up! Push deeper.': 'Barınak hazır! Daha derine git.',
  'Pack scattered!': 'Sürü dağıldı!',
  'One rescued! The Grand Alpha stirs...': 'Biri kurtarıldı! Büyük Alfa uyanıyor...',
  'Grand Alpha slain! The winter breaks...': 'Büyük Alfa yenildi! Kış kırılıyor...',
  'Shelter built! Rescue everyone!': 'Barınak hazır! Herkesi kurtar!',
  'All threats gone!': 'Tüm tehditler bitti!',
};

const missing = new Set();
for (let i = 1; i <= 15; i++) {
  const n = String(i).padStart(2, '0');
  const f = `C:/Users/ickmk/Frostborn/game/src/levels/level${n}.json`;
  let raw = fs.readFileSync(f, 'utf8');
  const d = JSON.parse(raw);
  let touched = false;
  for (const s of d.stages || []) {
    if (s.completedText && !s.completedTextTr) {
      const tr = TR[s.completedText];
      if (!tr) { missing.add(s.completedText); continue; }
      s.completedTextTr = tr;
      touched = true;
    }
  }
  if (touched) {
    // Preserve indent used elsewhere (2 spaces in these files)
    fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n', 'utf8');
    console.log('updated', f);
  }
}
if (missing.size) {
  console.error('missing translations:', [...missing]);
  process.exit(1);
}
