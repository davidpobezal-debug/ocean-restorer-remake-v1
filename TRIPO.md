# Prompty pre Tripo 3D modely

Hra teraz používa vlastné low-poly modely skladané v kóde, takže funguje aj bez týchto modelov. Modely z Tripo môžu neskôr nahradiť potápača, žraloka a zvieratká. Pre všetky modely platí:

- **Štýl:** low-poly, stylized, ručne maľované farby, jasné siluety. Malo by to pôsobiť ako mobilná hra pre všetky vekové kategórie (štýl Animal Crossing / Monument Valley).
- **Export:** GLB, **do 5 000 trojuholníkov**, textúra 512 × 512 (bez PBR máp, stačí base color).
- **Orientácia:** model pozerá dopredu po osi +Z a stojí na zemi (Y = 0), výška približne 1 m.
- **Animácie:** zatiaľ netreba, plutvy a chvost hýbe kód. Ak Tripo ponúkne rig, zvoľ „swim“ cyklus.

Hotové `.glb` súbory ulož do `assets/models/` s názvami uvedenými nižšie a daj mi vedieť. Napojím ich (GLTFLoader) a procedurálne modely nechám ako zálohu.

| Súbor | Prompt (anglicky, Tripo rozumie najlepšie) |
|---|---|
| `diver.glb` | `cute chibi scuba diver character, big round glass helmet with a happy face inside, yellow-orange wetsuit with teal accents, two silver oxygen tanks on the back, short swim fins, holding a chunky turquoise underwater vacuum cleaner nozzle with a hose, swimming pose leaning forward, low poly stylized game asset, clean hand-painted colors, no background` |
| `shark.glb` | `cartoon reef shark, slightly grumpy but not scary, blue-grey back with white belly, big dorsal fin, low poly stylized mobile game enemy, smooth readable silhouette from top-down view, hand-painted colors` |
| `turtle.glb` | `cute baby sea turtle, green patterned shell, big friendly eyes, flippers spread swimming, low poly stylized game character, hand-painted colors` |
| `seal.glb` | `cute chubby grey seal pup, big black eyes, whiskers, swimming pose, low poly stylized game character, hand-painted colors` |
| `octopus.glb` | `cute pink octopus with big eyes and eight curly tentacles, smiling, low poly stylized game character, hand-painted colors` |
| `dolphin.glb` | `friendly smiling dolphin, light blue-grey with white belly, curved dorsal fin, low poly stylized game character, hand-painted colors` |
| `whale.glb` | `cute baby blue whale calf, round body, white belly with grooves, small fins and tail fluke, smiling, low poly stylized game character` |
| `jelly.glb` | `glowing pink jellyfish, translucent dome bell, short wavy tentacles, low poly stylized, emissive look` |
| `wreck.glb` | `small sunken wooden pirate shipwreck lying tilted on the seabed, broken mast, holes in hull, overgrown with a little coral, low poly stylized game environment prop` |
| `coral_set.glb` | `set of 6 separate low poly coral pieces: branching staghorn coral, brain coral, sea fan, tube coral cluster, table coral, sea anemone, stylized, white/neutral base color for tinting` |
| `trash_set.glb` | `set of low poly ocean trash props: plastic bottle, soda can, plastic bag, old car tire, rusty yellow toxic barrel, stylized game props, bright readable colors` |

## Tipy pre Tripo
1. V Tripo zvoľ **Text to 3D**. Ak chceš ešte lepší výsledok, vygeneruj najprv obrázok (Image to 3D).
2. Pred exportom použi **Low Poly / Smart Low Poly** a nastav cieľ 3 000 až 5 000 polygónov.
3. Pri postavách zapni **Auto Rig** (pre plutvy a chvost).
4. Pri sadách (`coral_set`, `trash_set`) skús generovať každý kus zvlášť. Výsledok býva čistejší.
