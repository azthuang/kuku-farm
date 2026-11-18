# 素材來源

遊戲的土地與作物使用程式產生的圖形和系統 emoji；牧場動物與牧場景觀使用下表登記的外部素材。

新增素材時，請在下方登記來源、作者與授權：

| 檔案 | 來源網址 | 作者 | 授權 |
| --- | --- | --- | --- |
| public/assets/ranch/{chicken,cow,pig,sheep,llama}_{walk,eat}.png、chicken/cow/llama_shadow.png（羊駝檔由 llama_walk_0 / llama_eat_0 改名） | https://opengameart.org/content/lpc-style-farm-animals | Daniel Eddeland | CC-BY 3.0（原作雙授權 CC-BY 3.0 / GPL 2.0，本專案採用 CC-BY 3.0） |
| public/assets/scenery/scenery.png、farmhouse.png（由下方「牧場景觀」各素材包裁切、拼合） | 見下方「牧場景觀」 | 見下方「牧場景觀」 | CC-BY-SA 3.0 |
| public/assets/ranch/dog.png、cat.png（狗：柴犬、大麥町、柯基、邊境牧羊犬；貓：橘虎斑、三花貓、賓士貓、暹羅貓） | 本專案以 Google Antigravity CLI 的圖像模型（gemini-3.1-flash-image）生成，再去背、縮小、量化成 40 px 像素圖 | 本專案（AI 生成） | 本專案自製，不含第三方素材 |
| public/assets/decor/lpc.png（裝飾：彩色、向日葵、玫瑰、藍色花圃、樹叢、小樹、大香菇；由「牧場景觀」的 LPC Flowers / Plants / Fungi / Wood 與 Trees 素材包裁切、拼合） | 見下方「牧場景觀」 | 見下方「牧場景觀」 | CC-BY-SA 3.0 |
| public/assets/decor/made.png（裝飾：長椅、稻草人、水井、南瓜堆、白鴿；驚喜物件：聖誕樹、熱氣球、火箭、飛碟、恐龍） | 本專案以 Google Antigravity CLI 的圖像模型（gemini-3.1-flash-image）生成，再去背、縮小、量化成像素圖（恐龍、白鴿另外換色） | 本專案（AI 生成） | 本專案自製，不含第三方素材 |

## 牧場景觀（LPC）

牧場的草地、石頭路、小溪、樹木、花草、農場主人的家、磨坊與水車，來自下列 OpenGameArt 素材包。
`public/assets/scenery/scenery.png`（圖集）與 `public/assets/scenery/farmhouse.png`（農場主人的家）
是本專案從這些素材裁切、拼合而成（另加少量手繪像素：門、窗、花台、信箱、木牌、菜圃邊框、木橋、水面亮點），
這兩張拼合圖以 **CC-BY-SA 3.0** 釋出。各素材包附的 `CREDITS-*.txt` 原檔也放在
`public/assets/scenery/` 下，內容照錄於後。

### [LPC] Terrains（草地、小溪與草岸、石頭路、菜圃泥土、石頭、草叢）

- 來源：https://opengameart.org/content/lpc-terrains
- 授權：CC-BY-SA 3.0 / CC-BY-SA 4.0（本專案採用 CC-BY-SA 3.0）
- `CREDITS-terrain.txt`：

```text
"[LPC] Terrains" by bluecarrot16, Lanea Zimmerman (Sharm), Daniel Eddeland (Daneeklu), Richard Kettering (Jetrel), Zachariah Husiar (Zabin), Hyptosis, Casper Nilsson, Buko Studios, Nushio, ZaPaper, billknye, William Thompson, caeles, Redshrike, Bertram, and Rayane Félix (RayaneFLX)

Liberated Pixel Cup (LPC) Base Assets (sprites & map tiles)
Lanea Zimmerman (Sharm)
CC-BY 3.0 / CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles

[LPC] Farming tilesets, magic animations and UI elements
Daniel Eddeland (Daneeklu)
CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/lpc-farming-tilesets-magic-animations-and-ui-elements

ZRPG Tiles
Richard Kettering (Jetrel), Zachariah Husiar (Zabin), Hyptosis, Lanea Zimmerman (Sharm), and Open Pixel Project.
CC-BY-SA 3.0+
https://opengameart.org/content/zrpg-tiles

LPC C.Nilsson
Casper Nilsson
CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/lpc-cnilsson

Frozen Lake [LPC]
Buko Studios (http://www.buko-studios.com/) Commissioned by PlayCraft: (www.playcraftapp.com)
CC-BY 3.0
https://opengameart.org/content/frozen-lake-lpc


LPC Animated Water and waterfalls
ZaPaper
CC-BY-SA 3.0
https://opengameart.org/content/lpc-animated-water-and-waterfalls

LPC More Water Transitions
billknye
CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/lpc-more-water-transitions

[LPC] Sand+Rock Alt Colors
William.Thompsonj, Daniel Eddeland
CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/lpc-sandrock-alt-colors

[LPC] Colorful Sand + Deep Water!
Nushio
CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/lpc-colorful-sand-deep-water

LPC terrain extension
caeles
CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/lpc-terrain-extension

RPG Tiles: Cobble stone paths & town objects
Zachariah Husiar (Zabin), Daniel Eddeland (Daneeklu), Richard Kettering (Jetrel), Hyptosis, Redshrike, Bertram
CC-BY-SA 3.0
https://opengameart.org/content/rpg-tiles-cobble-stone-paths-town-objects

RPG Terrains
Rayane Félix (RayaneFLX)
CC-BY-SA 3.0
https://opengameart.org/content/rpg-terrains
```

### [LPC] Trees（樹、樹叢）

- 來源：https://opengameart.org/content/lpc-trees
- 授權：CC-BY-SA 3.0
- `CREDITS-trees.txt`：

```text
## Trees

"[LPC] Trees Mega-Pack" by bluecarrot16, Jetrel, Zabin, Hyptosis, Surt, Buch, Johann Charlot, Stephen Challener and the Open Surge team (http://opensnc.sourceforge.net), Gaurav Munjal, Ivan Voirol (Silver IV)
Guido Bos, Yar, Paulina Riva (PauR), William.Thompsonj, Casper Nilsson, Hyptosis, ansimuz, qubodup, Bart K., Blarumyrran, Lanea Zimmerman (Sharm), Leonard Pabin, Chris Phillips, Barbara Rivera, and Talosaurus. 
CC-BY-SA 3.0


Lots of trees and plants from OGA (DB32) tilesets pack 1
Jetrel, Zabin, Hyptosis, Surt
CC0
https://opengameart.org/content/lots-of-trees-and-plants-from-oga-db32-tilesets-pack-1

The Field of the Floating Islands
Buch <https://opengameart.org/users/buch>
CC0
https://opengameart.org/content/the-field-of-the-floating-islands

Outdoor tiles, again
Buch <https://opengameart.org/users/buch>
CC-BY 2.0
https://opengameart.org/content/outdoor-tiles-again

Shoot'em up graphic kit
Johann Charlot
CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/shootem-up-graphic-kit

32x32 (and 16x16) RPG Tiles--Forest and some Interior Tiles
Stephen Challener and the Open Surge team (http://opensnc.sourceforge.net)commissioned by Gaurav Munjal
CC-BY 3.0
https://opengameart.org/content/32x32-and-16x16-rpg-tiles-forest-and-some-interior-tiles

Orthographic outdoor tiles
Buch
CC0
https://opengameart.org/content/orthographic-outdoor-tiles

Basic map 32x32 by Silver IV
Ivan Voirol (Silver IV)
CC-BY 3.0 / GPL 3.0 / GPL 2.0
https://opengameart.org/content/basic-map-32x32-by-silver-iv

old frogatto tile art
Guido Bos
CC0
https://opengameart.org/content/old-frogatto-tile-art

Generic Platformer Tiles
surt
CC0
http://opengameart.org/content/generic-platformer-tiles

Isometric 64x64 Outside Tileset
Yar
CC-BY 3.0
https://opengameart.org/content/isometric-64x64-outside-tileset

Nature tileset
Paulina Riva (PauR)
CC-BY 3.0
https://opengameart.org/content/nature-tileset

[LPC] Tree Recolors
William.Thompsonj
CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/lpc-tree-recolors

LPC C.Nilsson
Casper Nilsson
CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/lpc-cnilsson

Lots of Hyptosis' tiles organized!
Hyptosis
CC-BY 3.0
https://opengameart.org/content/lots-of-hyptosis-tiles-organized

Trees & Bushes
ansimuz
CC0
http://opengameart.org/content/trees-bushes

OGA Community Tileset: Nature
qubodup, Bart K., Blarumyrran
GPL 2.0 / GPL 3.0 / CC-BY-SA 3.0
https://opengameart.org/content/oga-community-tileset-nature

Liberated Pixel Cup (LPC) Base Assets 
Lanea Zimmerman (Sharm)
CC-BY-SA 3.0 / CC-BY 3.0 / GPL 3.0
https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles

Whispers of Avalon: Grassland Tileset
Leonard Pabin
CC-BY 3.0 / GPL 3.0 / GPL 2.0
https://opengameart.org/content/whispers-of-avalon-grassland-tileset

Team River Fox
Chris Phillips, Barbara Rivera
CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/team-river-fox

Concept Art for LPC Entry
Barbara Rivera
CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/concept-art-for-lpc-entry

Old Eastern Themed Building Tiles + Tree
Talosaurus
CC0
https://opengameart.org/content/old-eastern-themed-building-tiles-tree
```

### [LPC] Flowers / Plants / Fungi / Wood（野花、小草、蘑菇、樹樁、灌木、高麗菜、南瓜、香蒲、蘆葦、睡蓮）

- 來源：https://opengameart.org/content/lpc-flowers-plants-fungi-wood
- 授權：CC-BY-SA 3.0
- `CREDITS-plants.txt`：

```text
## Flowers / Plants / Fungi / Wood

"[LPC] Flowers / Plants / Fungi / Wood," by bluecarrot16, Guido Bos, Ivan Voirol (Silver IV), SpiderDave, William.Thompsonj, Yar, Stephen Challener and the Open Surge team (http://opensnc.sourceforge.net), Gaurav Munjal, Johann Charlot, Casper Nilsson, Jetrel, Zabin, Hyptosis, Surt, Lanea Zimmerman, George Bailey, ansimuz, Buch, and the Open Pixel Project contributors (OpenPixelProject.com). 
CC-BY-SA 3.0. 

Based on: 

[LPC] Guido Bos entries cut up
Guido Bos
CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/lpc-guido-bos-entries-cut-up

Basic map 32x32 by Silver IV
Ivan Voirol (Silver IV)
CC-BY 3.0 / GPL 3.0 / GPL 2.0
https://opengameart.org/content/basic-map-32x32-by-silver-iv

Flowers
SpiderDave
CC0
https://opengameart.org/content/flowers

[LPC] Leaf Recolor
William.Thompsonj
CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/lpc-leaf-recolor

Isometric 64x64 Outside Tileset
Yar
CC-BY 3.0
https://opengameart.org/content/isometric-64x64-outside-tileset

32x32 (and 16x16) RPG Tiles--Forest and some Interior Tiles
Stephen Challener and the Open Surge team (http://opensnc.sourceforge.net)commissioned by Gaurav Munjal
CC-BY 3.0
https://opengameart.org/content/32x32-and-16x16-rpg-tiles-forest-and-some-interior-tiles

Lots of Hyptosis' tiles organized!
Hyptosis
CC-BY 3.0
https://opengameart.org/content/lots-of-hyptosis-tiles-organized

Generic Platformer Tiles
surt
CC0
http://opengameart.org/content/generic-platformer-tiles

old frogatto tile art
Guido Bos
CC0
https://opengameart.org/content/old-frogatto-tile-art

LPC: Interior Castle Tiles
Lanea Zimmerman
CC-BY-3.0 / GPL 3.0
http://opengameart.org/content/lpc-interior-castle-tiles

RPG item set
Jetrel
CC0
https://opengameart.org/content/rpg-item-set

Shoot'em up graphic kit
Johann Charlot
CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/shootem-up-graphic-kit

LPC C.Nilsson
Casper Nilsson
CC-BY-SA 3.0 / GPL 3.0
https://opengameart.org/content/lpc-cnilsson

Lots of trees and plants from OGA (DB32) tilesets pack 1
Jetrel, Zabin, Hyptosis, Surt
CC0
https://opengameart.org/content/lots-of-trees-and-plants-from-oga-db32-tilesets-pack-1

Trees & Bushes
ansimuz
CC0
https://opengameart.org/content/trees-bushes

Outdoor tiles, again
Buch <https://opengameart.org/users/buch>
CC-BY 2.0
https://opengameart.org/content/outdoor-tiles-again

16x16 Game Assets
George Bailey
CC-BY 4.0
https://opengameart.org/content/16x16-game-assets

Tuxemon tileset
Buch
CC-BY-SA 3.0
https://opengameart.org/content/tuxemon-tileset

Orthographic outdoor tiles
Buch
CC0
https://opengameart.org/content/orthographic-outdoor-tiles

OPP2017 - Jungle and temple set
OpenPixelProject.com
CC0
https://opengameart.org/content/opp2017-jungle-and-temple-set
```

### [LPC] Thatched-roof Cottage（農場主人的家與磨坊：茅草屋頂、木骨牆、石牆、石基）

- 來源：https://opengameart.org/content/lpc-thatched-roof-cottage
- 作者：bluecarrot16；based on LPC base assets by Lanea Zimmerman (Sharm) and Daniel Armstrong (HughSpectrum)
- 授權：CC-BY-SA 3.0 / GPL 3.0+（本專案採用 CC-BY-SA 3.0）
- 使用檔案：`cottage.png`、`thatched-roof.png`（此包沒有附 CREDITS 檔）

### [LPC] Farm（轉動的水車 water-wheel.png）

- 來源：https://opengameart.org/content/lpc-farm
- 授權：CC-BY 4.0
- `CREDITS-farm.txt`：

```text
"[LPC] Farm" by bluecarrot16, Wolthera van Hövell tot Westerflier (TheraHedwig), and Ivan Voirol
http://opengameart.org/content/lpc-farm


Based on:

Slates [32x32px orthogonal tileset by Ivan Voirol]
Ivan Voirol
CC-BY 4.0
https://opengameart.org/content/slates-32x32px-orthogonal-tileset-by-ivan-voirol

LPC compatible Ancient Greek Architecture
Wolthera van Hövell tot Westerflier (TheraHedwig)
CC-BY-4.0 / GPL-3.0 / OGA-BY-3.0
https://opengameart.org/content/lpc-compatible-ancient-greek-architecture


* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *  

Build a farm, in the style of the LPC! Kindly commissioned by Rupil. 

There are several excellent LPC asset packs to do with farming, but this pack should help you build a more complete farm. Contents: 
- Modular barn, in two colors: red and brown
- Towers/silos
- Granary
- Modular chicken coop and nesting boxes
- Apiary/beehives
- Sheds/stables
- Two new fences
- Farm crafting machines---butter churner, cheese press, mayonnaise maker
- Animated windmill blades and water wheels

Because the LPC assets span a range of time periods and technology levels, these assets are meant to be flexible; most buildings come in two styles: a more primitive style with thatched roofs and wattlework https://en.wikipedia.org/wiki/Wattle_(construction)---appropriate for medieval or pre-modern settings, and a more modern style (but still targeting an early industrial period---think the Victorian era). 

Animated windmill and water wheels were adapted from Ivan Voirol's excellent Slates set https://opengameart.org/content/slates-32x32px-orthogonal-tileset-by-ivan-voirol . I have drawn thatched roofs in the past, but I liked TheraHedwig's better https://opengameart.org/content/lpc-compatible-ancient-greek-architecture and so based this set of their roofs. 



Preview image also includes assets from the following submissions, which would go well with these assets:

- "[LPC] Terrains" by bluecarrot16, Lanea Zimmerman (Sharm), Daniel Eddeland (Daneeklu), Richard Kettering (Jetrel), Zachariah Husiar (Zabin), Hyptosis, Casper Nilsson, Buko Studios, Nushio, ZaPaper, billknye, William Thompson, caeles, Redshrike, Bertram, and Rayane Félix (RayaneFLX). https://opengameart.org/content/lpc-terrains
- "[LPC] Containers" by bluecarrot16, Lanea Zimmerman (Sharm), William Thompson, Tuomo Untinen (Reemax), Evert, Buch, Blarumyrran, n2liquid, Jetrel, Guido Bos, Hyptosis, Bonsaiheldin, NaRNeRZz, PriorBlue, Jerom, 7Soul, and Wolthera van Hövell tot Westerflier (TheraHedwig). https://opengameart.org/content/lpc-containers
- "[LPC] Horses" by bluecarrot16 https://opengameart.org/content/lpc-horses
https://opengameart.org/content/lpc-medieval-village-decorations
- "LPC style farm animals" by Daniel Eddeland (daneeklu). https://opengameart.org/content/lpc-style-farm-animals

And a few other asset packs that might be helpful:

https://opengameart.org/content/lpc-fruit-trees
https://opengameart.org/content/lpc-crops
https://opengameart.org/content/lpc-food
https://opengameart.org/content/lpc-goat
https://opengameart.org/content/lpc-turkey
https://opengameart.org/content/lpc-cats-and-dogs
```
