# Ocean Restorer · Remake

> Archív prvej verzie remaku (low-poly, prstence biómov). Aktuálna hra je na https://davidpobezal-debug.github.io/ocean-restorer-remake/

Mobilná 3D hra na jeden palec (Three.js, bez build kroku). Zmývaš špinu z morského dna, zachraňuješ zvieratká zo sietí a útes počas toho rozkvitá.

## Spustenie lokálne
```bash
python -m http.server 8742
```
Potom otvor http://localhost:8742. Na GitHub Pages stačí nahrať celý priečinok.

## Ovládanie
- **Ťahaj palcom kdekoľvek:** potápač pláva a čistí dno.
- **Pusti palec:** sonarový pulz. Odplaší žraloky, odtlačí medúzy, vyčistí okolie a nasaje odpad. Na počítači použi WASD alebo šípky, pulz je medzerník.

## Expedícia (hlavný režim)
- **Jeden nekonečný ponor**, cieľom je čo najvyššie skóre.
- **Svet sa rozširuje po kruhoch:** Tropický útes → Vrakovisko → Kelpový les → Svetielkujúce hlbiny. Keď vyčistíš 70 % oblasti, otvorí sa ďalšia. Dostaneš plný kyslík, +1 ❤️ a bonus 1 000 × číslo oblasti.
- **Panel vylepšení je stále dole:** Dosah, Výkon, Plutvy, Pulz a +25 s O₂. Kupuješ ich za mince z ponoru jedným ťuknutím a v každom ponore začínaš od nuly, takže súťaž je férová.
- **Svet sa sám znova špiní:** z hladiny padá odpad a sudy, z ktorých uniká ropa. Ropa sa šíri, kým sud nevysaješ.
- Žraloky pribúdajú s časom a každých 20 m² vyčisteného dna dá +1 s kyslíka.
- Výzva kamarátovi má tvar `?e=<seed>&s=<skóre>&n=<meno>`, takže kamarát hrá rovnaké dno. Denná výzva je rovnaká Expedícia pre všetkých.

## Levely (druhý režim)
- Levely trvajú 1 až 3 minúty. ★ dostaneš pri 60 %, ★★ pri 85 % a ★★★ pri 100 % obnoveného útesu. Kyslík je časovač a bubliny O₂ ho dopĺňajú.
- **Kombo:** keď čistíš bez prestávky, násobič rastie ×2 až ×4, potom nastane **FEVER ×5**. Vtedy máš obrovský dosah a ozve sa dúhová hudba.
- **Odpad:** fľaše, plechovky, vrecká, pneumatiky a sudy vysaješ. Ťažké kusy treba chvíľu držať. Mince lietajú do počítadla.
- **Záchrana:** zviera v sieti (korytnačka, tuleň, chobotnica, delfín, veľrybka) po vyslobodení s tebou pláva a pomáha čistiť. Pribudne aj do zbierky.
- **Mušle s perlami** sú skryté pod špinou. Perly sú prémiová mena: dajú sa za ne obleky a druhá šanca.
- Od levelu 4 prichádzajú **žraloky**. Pred útokom sa objaví červený pás, takže stihneš uhnúť alebo použiť pulz. Od levelu 6 pribudnú **medúzy**.
- **Biómy** sa striedajú po troch leveloch: Tropický útes, Vrakovisko, Kelpový les a Svetielkujúce hlbiny.
- Ku koncu levelu šípka ukáže zvyšky špiny, takže 100 % sa vždy dá dosiahnuť.

## Virálne prvky
- Zdieľací obrázok **PRED / PO** (1080 × 1350), na ktorom je skóre, hviezdy, zachránené zvieratá a adresa hry.
- **Odkaz s výzvou** `?l=7&s=12345&n=Meno`: kamarát po otvorení uvidí kartu „Meno ťa vyzýva“. Po hre sa zobrazí, kto vyhral, a víťaz dostane +50 ◈.
- **Denná výzva:** rovnaký útes pre všetkých v daný deň. Zdieľa sa ako text s mriežkou emoji v štýle Wordle.
- **Zdieľaj a pokračuj:** pri prehre zdieľanie dá druhú šancu. Prvé zdieľanie za deň dá +50 ◈.
- Séria dní 🔥 a bonus za prvý ponor dňa.
- PWA: hru si môžeš pridať na plochu a funguje aj offline. Odkazy na Messengeri a WhatsAppe majú náhľad (`og:image`).

## Súbory
| Súbor | Obsah |
|---|---|
| `js/main.js` | renderer, kamera, obrazovky, HUD, zdieľanie |
| `js/game.js` | logika hry (pohyb, kombo, odpad, záchrana, žraloky, medúzy) |
| `js/world.js` | generovanie levelov, shader dna s maskou špiny, korály |
| `js/models.js` | procedurálne low-poly modely |
| `js/fx.js` | častice, rázové vlny, lietajúce čísla a mince |
| `js/audio.js` | procedurálne zvuky a generatívna hudba |
| `js/save.js` | postup v localStorage, vylepšenia, obleky, zvieratá |
| `js/share.js` | zdieľací obrázok, odkazy s výzvou, text dennej výzvy |
| `TRIPO.md` | prompty na 3D modely pre Tripo |

## Ďalšie možné kroky
- Globálny rebríček a počítadlo „spolu sme vyčistili X m²“, napríklad cez Supabase (zadarmo).
- GLB modely z Tripo namiesto procedurálnych (pozri `TRIPO.md`).
