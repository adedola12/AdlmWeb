---
id: qs-handbook
title: The ADLM QS handbook
tagline: Key QS formulas, a formula library, constants, grade and unit conversions, ICMS 3 and carbon in cost planning, and real use cases for every ADLM product.
version: "2026.10"
updated: 2026-10-07
platform: Reference for every ADLM product
productKeys: []
pdf: ADLM-QS-Handbook.pdf
order: 20
---

## About this handbook

This is a working reference for quantity surveyors and estimators in Nigeria. It sets out the formulas you use every day, the conversion factors behind a material schedule, and the conversions you need when a drawing, a supplier or a client speaks a different unit.

Two kinds of figure appear in it, and each one is labelled:

- **ADLM value.** A default held in ADLM software. The handbook names the product: Rate Gen **Material Constants** on the website, QUIV (the Revit plugin), or HERON. These are the figures your ADLM software will use unless you change them.
- **Typical.** A widely used industry figure, with its assumption stated. Use it as a starting point and check it against your specification, your supplier and your site.
- **Worked from ADLM values.** A figure this handbook calculates from ADLM's own constants and carbon factors, such as the carbon in a cubic metre of 1:2:4 concrete. Your software works it out from your own build-up, so its figure can differ a little.

> **Important:** Nothing here replaces the contract documents. A specification, a structural engineer's bar schedule or a design mix always overrides a rule of thumb. Where a figure in this handbook and your drawings disagree, the drawings win.

> **Note:** ADLM's material defaults were recalibrated in September 2026 against the build-up formulas in several hundred real Nigerian bills. If your copy of QUIV, HERON or Rate Gen shows a different figure, you may be on an earlier version, or someone on your account may have changed it. You can see and edit every value in **Material Constants**.

Prices in the worked examples are illustrative only. Use current prices from your own Rate Gen library or your suppliers.

## Key QS formulas

Each formula below gives the units, a worked example and the mistake that most often goes with it.

### Areas and volumes of common shapes

| Shape | Area or volume | Units |
|---|---|---|
| Rectangle | A = L × B | m² |
| Triangle | A = ½ × base × height | m² |
| Trapezium | A = ½ × (a + b) × h | m² |
| Circle | A = π × d² ÷ 4 | m² |
| Annulus (ring) | A = π × (D² − d²) ÷ 4 | m² |
| Sector | A = (θ ÷ 360) × π × r² | m² |
| Prism or slab | V = cross-section area × length | m³ |
| Cylinder (pile, column) | V = π × d² ÷ 4 × h | m³ |
| Cone or pyramid | V = ⅓ × base area × h | m³ |
| Frustum (tapered pad, cone) | V = h ÷ 3 × (A1 + A2 + √(A1 × A2)) | m³ |
| Sphere | V = π × d³ ÷ 6 | m³ |

**Worked example.** A bored pile 600 mm in diameter and 10 m deep:

V = π × 0.6² ÷ 4 × 10 = 0.2827 × 10 = **2.83 m³** of concrete per pile.

HERON's piling template uses the same formula: concrete = number of piles × depth × π × (D ÷ 2)².

> **Tip:** Convert every dimension to metres before you multiply. A 600 mm diameter entered as 600 turns 2.83 m³ into 2,827,433 m³.

**Common mistake:** using the radius where the formula wants the diameter (or the reverse). π × d² ÷ 4 and π × r² give the same answer only if you use the right one.

### Girth and centre-line method for trenches and walls

For a wall or a trench that runs all round a building, measure along the centre line. The centre line is shorter than the outside perimeter and longer than the inside perimeter.

| You know | Centre-line girth of a rectangular building |
|---|---|
| External dimensions L × B | 2 × (L + B) − 4t |
| Internal dimensions L × B | 2 × (L + B) + 4t |

Here t is the wall thickness (or the trench width, for a trench measured from its own edges). Each external corner takes 2 × ½t off the outside girth, and a rectangle has four corners, so 4t comes off in total. A building with set-backs still loses 4t overall, because every extra outside corner is balanced by an inside corner.

**Worked example.** A bungalow measures 12.00 × 8.00 m over 225 mm external walls. The strip footing trench is 675 mm wide and 900 mm deep, centred on the wall.

1. External perimeter = 2 × (12.00 + 8.00) = 40.00 m.
2. Centre-line girth = 40.00 − 4 × 0.225 = **39.10 m**.
3. Excavation = 39.10 × 0.675 × 0.90 = **23.75 m³**.
4. Blockwork in foundation, 900 mm high = 39.10 × 0.90 = **35.19 m²**.

**Internal walls.** An internal wall runs between the inner faces of the external walls. Its trench runs only between the inner edges of the external trenches, which are further apart.

For one internal wall across the 8.00 m width of the example:

- Wall length = 8.00 − 2 × 0.225 = **7.55 m**.
- The external trench's inner edge sits 0.1125 + 0.3375 = 0.45 m in from the outside face, so the trench length = 8.00 − 2 × 0.45 = **7.10 m**.

**Common mistake:** measuring the internal trench at the wall length (7.55 m). The 0.45 m at each end has already been dug as part of the external trench, so it would be measured twice.

### Excavation, bulking and compaction

| Quantity | Formula | Units |
|---|---|---|
| Trench excavation | (w + 2 × working space) × depth × length | m³ |
| Pad excavation | (L + 2ws) × (B + 2ws) × depth | m³ |
| Earthwork support (trench) | 2 × depth × length | m² |
| Loose volume to cart away | in-situ volume × (1 + bulking %) | m³ |
| Loose fill to order | compacted volume × compaction factor | m³ |
| Disposal | excavated volume − volume backfilled | m³ |

A working space of **0.30 m** each side of strip and pad excavation is a typical allowance, and earthwork support is measured as 2 × depth × length.

> **Note:** Methods of measurement treat working space differently. Some measure the net size of the foundation and leave working space in the rate; others allow it as a separate item. Follow the method named in your contract (BESMM4, NRM2 or SMM7) and say which one you used in your preambles.

**Typical bulking** (in-situ to loose, after digging):

| Material | Typical bulking |
|---|---|
| Sand and gravel | 10 to 15% |
| Ordinary soil, loam, laterite | 20 to 30% |
| Clay | 30 to 40% |
| Broken rock | 50 to 70% |

**Typical compaction.** Laterite and sand fill lose roughly 15 to 30% of their loose volume when compacted in layers, so a compaction factor of about **1.2 to 1.3** loose m³ per compacted m³ is common. Hardcore varies with its grading.

**Worked example.** From the trench above (23.75 m³ in-situ, ordinary soil):

1. Loose volume = 23.75 × 1.25 = **29.69 m³**.
2. With a tipper carrying about 6 m³ loose (ask your haulier for the real figure), that is 29.69 ÷ 6 = 4.9, so **5 trips**.

**Filling in tonnes.** QUIV, HERON and Rate Gen **Material Constants** all convert measured fill to tonnes at **1.6 t/m³** (hardcore, laterite and general fill).

Hardcore 150 mm thick inside the example building (7.55 × 11.55 m):

- Area = 7.55 × 11.55 = 87.20 m².
- Volume = 87.20 × 0.15 = 13.08 m³.
- Weight = 13.08 × 1.6 = **20.93 t**.

> **Important:** Never treat trips per m³ as tonnes per m³. A common bill template converts fill with "m³ ÷ 3.51", which gives tipper TRIPS. Reading that 0.285 as tonnes per m³ makes the filling about six times too light. ADLM's software had this error and it was corrected in September 2026; check any spreadsheet you inherit for the same thing.

### Concrete volume, dry volume and mix materials

**Volume** is length × width × depth, in m³. Measure net. Do not deduct the space taken by reinforcement. SMM7 and NRM2 do not deduct voids of 0.05 m³ or less; check the rule in your contract's method.

**Dry volume.** Cement, sand and granite shrink when they are mixed with water, because the fine material fills the voids between the coarse. One cubic metre of placed concrete needs about **1.54 m³** of dry materials. QUIV, HERON and Rate Gen **Material Constants** all use 1.54. That factor already carries the normal allowance for waste, so ADLM's concrete waste factor is **1.00**.

**ADLM's formula** (QUIV, HERON and Rate Gen **Material Constants**), for a mix c : s : g and V m³ of concrete:

- Cement (bags) = V × (c ÷ (c + s + g)) × 1.54 × 1,440 ÷ 50
- Sharp sand (t) = V × (s ÷ (c + s + g)) × 1.54 × 1,440 ÷ 1,000
- Granite (t) = sharp sand tonnes × 2

The constants are: cement 1,440 kg/m³, sharp sand 1,440 kg/m³, a 50 kg bag, and a granite-to-sand multiplier of 2.

**Materials per m³ of concrete (ADLM values):**

| Mix | Cement (bags) | Sharp sand (t) | Sharp sand (m³ loose) | Granite (t) |
|---|---|---|---|---|
| 1:1:2 | 11.09 | 0.55 | 0.39 | 1.11 |
| 1:1.5:3 | 8.06 | 0.60 | 0.42 | 1.21 |
| 1:2:4 | 6.34 | 0.63 | 0.44 | 1.27 |
| 1:3:6 | 4.44 | 0.67 | 0.46 | 1.33 |
| 1:4:8 | 3.41 | 0.68 | 0.47 | 1.37 |

**Worked example.** The strip footing from the girth example is 675 mm wide and 225 mm thick, in 1:2:4.

1. Volume = 39.10 × 0.675 × 0.225 = **5.94 m³**.
2. Cement = 5.94 × 6.34 = 37.6, so order **38 bags**.
3. Sharp sand = 5.94 × 0.63 = **3.76 t**.
4. Granite = 5.94 × 1.27 = **7.53 t**.
5. At an illustrative ₦11,500 a bag, the cement costs 38 × 11,500 = **₦437,000**.

> **Note:** The granite rule "sand × 2" is right for every mix in the table, because each has twice as much stone as sand. For a mix such as 1:2:3, work the granite out from its own share: V × (3 ÷ 6) × 1.54 × density.

**Common mistakes:**

- **Leaving out the dry-volume factor.** Applying 1:2:4 to the wet volume gives 4.3 bags/m³ instead of about 6.3, which under-orders cement by a third.
- **Confusing cement density with bags per m³ of concrete.** 1 m³ of cement weighs 1,440 kg, which is 28.8 bags. That is the bulk density of the cement itself, not the cement in a cubic metre of concrete. A bill that prints 28.8 bags/m³ for 1:2:4 has made exactly this mistake.

### Blinding

Blinding is a thin, lean concrete layer, usually 50 to 75 mm, under footings and slabs. Its volume is area × thickness, in m³.

QUIV, HERON and Rate Gen **Material Constants** treat blinding as a lean **1:4:8** mix:

| Per m³ of blinding (ADLM value) | Before waste | With 5% waste |
|---|---|---|
| Cement | 3.25 bags | 3.41 bags |
| Sharp sand | 0.65 t | 0.68 t |
| Granite | 1.30 t | 1.37 t |

**Worked example.** Blinding 50 mm thick under the strip footing:

1. Volume = 39.10 × 0.675 × 0.05 = **1.32 m³**.
2. Cement = 1.32 × 3.41 = 4.5, so **5 bags**.
3. Sharp sand = 1.32 × 0.68 = **0.90 t**.
4. Granite = 1.32 × 1.37 = **1.80 t**.

**Common mistakes:**

- **Costing blinding as 1:2:4.** That gives 6.3 bags/m³ for a layer that needs about 3.4.
- **Leaving out the granite.** Blinding at 1:4:8 or 1:10 still contains stone. QUIV, HERON and Rate Gen once carried about 0.9 bag/m³ and no granite; this was corrected in September 2026.

### Blockwork

Nigerian sandcrete blocks have a face of 450 × 225 mm. With 10 to 15 mm joints, a square metre of wall takes about 9.3 blocks, and practice orders **10 per m²** to cover breakage on delivery. The count is the same for 225 mm and 150 mm blocks, because the face size is the same.

**ADLM values (QUIV, HERON and Rate Gen Material Constants):**

| Per m² of wall | Value |
|---|---|
| Blocks | 10 nr |
| Blockwork waste factor | 1.03 (QUIV, Rate Gen); 1.05 (HERON) |
| Mortar cement | 0.20 bag |
| Mortar sharp sand | 0.055 t |

ADLM applies the mortar figure to every block thickness. A 150 mm wall uses less mortar than a 225 mm wall. A typical allowance is about **two-thirds** of the 225 mm figure, roughly 0.13 bag of cement and 0.036 t of sand per m², assuming the same 1:6 mortar and the same joint thickness. If you price a lot of 150 mm walling, set your own figure in **Material Constants**.

**Area to measure.** Measure the net face area of the wall, on its centre line, and deduct openings. SMM7 and NRM2 do not deduct voids of 0.5 m² or less. Check the rule in the method named in your contract, including BESMM4.

**Worked example.** Ground-floor 225 mm walls 3.00 m high on the 39.10 m centre line, with four 1.20 × 1.20 m windows and two 0.90 × 2.10 m doors.

1. Gross area = 39.10 × 3.00 = 117.30 m².
2. Openings = 4 × 1.44 + 2 × 1.89 = 5.76 + 3.78 = 9.54 m².
3. Net area = 117.30 − 9.54 = **107.76 m²**.
4. Blocks = 107.76 × 10 × 1.03 = **1,110 blocks**.
5. Cement = 107.76 × 0.20 = 21.6, so **22 bags**.
6. Sharp sand = 107.76 × 0.055 = **5.93 t**.
7. At an illustrative ₦1,300 a block, the blocks cost 1,110 × 1,300 = **₦1,443,000**.

**Common mistake:** using the outside perimeter instead of the centre line. On this building that adds 0.90 × 3.00 = 2.7 m² of walling that does not exist, and on a large building the error grows with every corner.

### Plaster, render and screed

**ADLM per m² values (QUIV, HERON and Rate Gen Material Constants):**

| Work | Cement per m² | Sand per m² |
|---|---|---|
| Render or plaster, one face | 0.13 bag | 0.05 t plaster sand |
| Floor screed (40 mm, 1:3) | 0.40 bag | 0.057 t sharp sand |
| Tile bed (floor) | 0.40 bag | 0.057 t sharp sand |
| POP wall screeding | 0.04 bag | none |

These are per m² of the face measured, the way Nigerian bills state them. The render figure includes the usual allowance for dubbing out uneven blockwork.

**From first principles**, using HERON's method:

Cement (bags) = area × thickness × dry factor × waste × (c ÷ (c + s)) × 28.8

The 28.8 is the number of 50 kg bags in a cubic metre of cement (1,440 ÷ 50). HERON's defaults are:

- **Screed:** 40 mm, 1:3, dry factor 1.30, waste 1.05.
- **Render:** 12 mm, 1:6, dry factor 1.30, waste 1.05.

For screed: 1 × 0.040 × 1.30 × 1.05 × 0.25 × 28.8 = 0.39 bag/m², which agrees with the 0.40 in the table.

For a 12 mm 1:6 render, the same sum gives about 0.07 bag/m² before any dubbing out. That is why the bill figure of 0.13 is higher.

**Worked example.** Screed 40 mm thick to the 87.20 m² floor:

1. Cement = 87.20 × 0.40 = 34.9, so **35 bags**.
2. Sharp sand = 87.20 × 0.057 = **4.97 t**.

For a different screed thickness, scale it: about **0.01 bag of cement per mm per m²** at 1:3.

**Common mistake:** pricing render on both faces of a wall from one face area, or the reverse. Measure each face you will plaster.

### Reinforcement weight, laps, cutting lengths and bends

**Unit weight.** Steel weighs 7,850 kg/m³, so a bar of diameter d mm weighs:

kg/m = d² ÷ 162 (exactly 0.006165 × d²)

QUIV, HERON and Rate Gen **Material Constants** all use a coefficient of **0.00617 kg/m per mm²**, which is the same rule. Many ADLM templates write it as (d² ÷ 36) × 0.2222, which is d² ÷ 162 in another form.

**Bar schedule table** (12 m bars):

| Bar | kg/m (d² ÷ 162) | kg/m (BS exact) | kg per 12 m bar | Bars per tonne |
|---|---|---|---|---|
| 6 mm | 0.222 | 0.222 | 2.67 | 375 |
| 8 mm | 0.395 | 0.395 | 4.74 | 211 |
| 10 mm | 0.617 | 0.617 | 7.41 | 135 |
| 12 mm | 0.889 | 0.888 | 10.67 | 94 |
| 16 mm | 1.580 | 1.578 | 18.96 | 53 |
| 20 mm | 2.469 | 2.466 | 29.63 | 34 |
| 25 mm | 3.858 | 3.853 | 46.30 | 22 |
| 32 mm | 6.321 | 6.313 | 75.85 | 13 |

Bars per tonne are rounded. When you order, round up to whole bars for each diameter.

**Stock length.** ADLM's standard stock length is **12 m** (QUIV, HERON and Rate Gen **Material Constants**). Some mills deliver bars a little short of 12 m. That is why some ADLM bar counts use a usable length of 11 to 11.7 m.

**Laps.** Where a run is longer than a stock bar, bars are lapped. A typical tension lap is **40 to 50 bar diameters** (40d for a Y16 is 640 mm). The real figure depends on concrete grade, bar type and position, and the structural drawings state it.

**Waste and lap allowances held by ADLM:**

| Allowance | Value | Product |
|---|---|---|
| General reinforcement waste | 1.05 | QUIV, Rate Gen Material Constants |
| General reinforcement waste | 1.10 | HERON |
| Beam main bars, laps and waste | 1.15 | QUIV |
| Staircase bars, laps and waste | 1.10 | QUIV |
| Lap/bend extra on column and pile bars | 0.30 m per bar | HERON templates |
| Lap/bend extra on beam bars | 1.20 m per bar | HERON templates |
| Binding wire | 0.01 kg per kg of steel (10 kg/t) | QUIV, HERON, Rate Gen Material Constants |

**Rates per m³ of concrete.** When there is no bar schedule yet, an estimate can price steel as kilograms per m³ of concrete. Typical starting rates, used by ADLM as defaults, are:

| Element | Typical starting rate |
|---|---|
| Strip footing | 40 kg/m³ |
| Slab | 80 kg/m³ |
| Beam | 160 kg/m³ |
| Column | 180 kg/m³ |

Replace them with the engineer's bar schedule as soon as you have it. Real rates vary widely with spans, loads and the designer's detailing.

**Link cutting length.** HERON's beam and column link templates use:

link length = 2 × ((b − 2c) + (h − 2c)) + 0.15 m

where b and h are the member's width and depth and c is the cover. The 0.15 m allows for the two hooks. The number of links is (length ÷ spacing) + 1.

**Bends.** Under BS 8666 (shape code 11, an L-bar), total length = A + B − 0.5r − d, where r is the bending radius. With the standard radius of 2d for bars up to 16 mm, this works out as a deduction of **2d for each 90° bend**. Larger bars use a larger radius, so take the length from the bar schedule.

**Worked example.** A beam 225 × 450 mm, 6.00 m long. It has 3 Y16 bottom bars and 2 Y16 top bars, with R10 links at 200 mm centres and 50 mm cover (HERON's default).

1. Main bars = 5 × 6.00 × 1.580 × 1.15 (QUIV's beam laps and waste) = **54.5 kg**.
2. Link length = 2 × ((0.225 − 0.10) + (0.45 − 0.10)) + 0.15 = 2 × 0.475 + 0.15 = **1.10 m**.
3. Number of links = 6.00 ÷ 0.20 + 1 = **31**.
4. Links = 31 × 1.10 × 0.617 = **21.0 kg**.
5. Total = 54.5 + 21.0 = **75.5 kg**, plus 0.76 kg of binding wire.

An L-bar Y12 with legs of 2.00 m and 0.30 m has a cutting length of 2.30 − 2 × 0.012 = **2.276 m**.

**Common mistakes:**

- **Mixing kilograms and tonnes.** 75.5 kg is 0.0755 t. A rate per tonne applied to a quantity in kg is a thousand times too high, and a tonne quantity read as kg is a thousand times too low. An older HERON build made this error when an item was measured in tonnes; it was corrected in September 2026.
- **Applying a lap allowance twice.** That happens when you add laps bar by bar and then also apply a percentage on top.

### Formwork areas

Formwork is measured as the area of concrete face in contact with it, in m².

| Member | Formwork area |
|---|---|
| Beam (soffit and two sides) | (2h + w) × L |
| Column | 2 × (a + b) × h |
| Pad footing sides | 2 × (L + B) × h |
| Suspended slab soffit | net soffit area |
| Slab edges | perimeter × slab thickness |
| Pile casing (if used) | π × d × depth |

QUIV uses (2h + w) × L for beams and 2 × (w + d) × h for columns.

**Board and sundries (ADLM values, QUIV, HERON and Rate Gen Material Constants):**

| Item | Value |
|---|---|
| Board coverage | 2.88 m² per sheet (2.4 × 1.2 m) |
| Nails | 0.0576 bag per sheet, about 0.02 bag per m² (QUIV, HERON, Rate Gen). HERON stores 0.0524 per sheet because it already adds 10% board waste, which comes to the same 0.02 bag per m². |
| Bracing timber | 6.3 m per sheet (QUIV, Rate Gen); 0.60 piece per m² (HERON) |
| Formwork waste | 1.10 (HERON) |

**Worked example.** Formwork to the 225 × 450 mm beam, 6.00 m long:

1. Area = (2 × 0.45 + 0.225) × 6.00 = 1.125 × 6.00 = **6.75 m²**.
2. Sheets = 6.75 ÷ 2.88 = **2.34 sheets**.
3. Nails = 2.34 × 0.0576 = **0.13 bag**.
4. Bracing = 2.34 × 6.3 = **14.8 m**.

> **Tip:** If your beam depth is the overall depth including a slab cast with it, deduct the slab thickness from h for the sides. The slab soffit formwork already covers that strip.

**Common mistake:** measuring formwork to the top face of a slab or footing. Only the faces the concrete is cast against are measured.

### Roofing: pitch factor, rafter length and sheets

**Pitch factor.** The area on the slope = plan area × pitch factor, where pitch factor = 1 ÷ cos(pitch). This works for gable and hipped roofs, as long as every slope has the same pitch. Use the plan area measured over the eaves.

| Pitch | Pitch factor | Slope (%) |
|---|---|---|
| 10° | 1.015 | 17.6 |
| 15° | 1.035 | 26.8 |
| 20° | 1.064 | 36.4 |
| 22.5° | 1.082 | 41.4 |
| 25° | 1.103 | 46.6 |
| 30° | 1.155 | 57.7 |
| 35° | 1.221 | 70.0 |
| 40° | 1.305 | 83.9 |
| 45° | 1.414 | 100.0 |

**Rafter length.** QUIV's roof module uses:

- rafter length = (half span + overhang) ÷ cos(pitch)
- rise = half span × tan(pitch)

The span is measured between wall plates.

**ADLM roof defaults:**

| Item | Value | Product |
|---|---|---|
| Rafter spacing | 1.2 m | HERON |
| Purlin spacing | 0.9 m | HERON |
| Eaves overhang | 0.6 m | HERON |
| Timber stock length | 3.6 m | QUIV, HERON |
| Covering per sheet | 2.0 m² | QUIV, HERON |
| Nails per sheet or bundle | 30 | QUIV, HERON |
| Ridge cap cover per piece | 0.8 m | HERON |
| Roof sheet per m² of covered area | 1.0 m²/m² | Rate Gen Material Constants |

**Worked example.** The 12.00 × 8.00 m bungalow (wall plates 8.00 m apart), a 0.60 m overhang all round, and a 30° pitch.

1. Plan over eaves = 13.20 × 9.20 = 121.44 m².
2. Area on slope = 121.44 × 1.155 = **140.2 m²**.
3. Rafter length = (4.00 + 0.60) ÷ cos 30° = 4.60 ÷ 0.866 = **5.31 m**.
4. Rise = 4.00 × tan 30° = **2.31 m**.
5. At 2.0 m² of cover per sheet, 140.2 ÷ 2.0 = 70.1, so **71 sheets**.

**Laps on long-span sheets.** Rate Gen's 1.0 m² per m² assumes your measured area already covers the laps, or that the sheet is priced per m² of cover. If you buy by sheet width, allow for the side lap: a sheet about 1.0 m wide typically covers 0.85 to 0.9 m. Allow an end lap of about 150 to 200 mm where sheets join along the slope. Together these usually add **10 to 15%** to the net area on the slope. Check the manufacturer's effective cover width.

**Common mistake:** pricing roof covering on the plan area. At 30°, that leaves out 15.5% of the roof.

### Painting coverage

**ADLM values:**

| Product | Value |
|---|---|
| QUIV, Rate Gen Material Constants | 0.026 drum (20 L) per m², all coats, which is 0.52 L/m² |
| HERON | 2.0 m² per litre, all coats (0.5 L/m²), plus 5% waste |
| HERON primer | 3.57 m² per litre, plus 5% waste |

**Typical.** A good emulsion covers about 10 to 12 m² per litre per coat on smooth, sealed plaster. Expect less on rough render. A mist coat plus two full coats on new render comes close to ADLM's 0.5 L per m².

**Worked example.** 250 m² of emulsion:

- QUIV and Rate Gen: 250 × 0.026 = **6.5 drums** (130 L).
- HERON: 250 × 1.05 ÷ 2.0 = 131.25, so **132 L**.

**Common mistake:** applying a per-coat coverage figure (10 m²/L) to a total that needs three coats. That under-orders paint by about two-thirds.

### Tiling with wastage

**ADLM values:**

| Item | Value | Product |
|---|---|---|
| Tiles per m² of floor or wall | 1.10 m² (10% cutting waste) | QUIV, HERON, Rate Gen Material Constants |
| Tile pack coverage | 1.44 m² per pack | QUIV, HERON |
| Bed (cement) | 0.40 bag per m² | QUIV, Rate Gen Material Constants |
| Bed (sharp sand) | 0.057 t per m² | QUIV, Rate Gen Material Constants |
| White cement grout | 0.02 bag per m² (about 1 kg) | QUIV, HERON, Rate Gen Material Constants |
| Floor tile bed | 40 mm, 1:3 | HERON |
| Wall tile bed | 25 mm, 1:3 | HERON |

A pack of 1.44 m² is four 600 × 600 mm tiles. To count individual tiles: number = area × waste factor ÷ area of one tile.

**Worked example.** 600 × 600 mm floor tiles to 87.20 m²:

1. Tiles = 87.20 × 1.10 = **95.92 m²**.
2. Packs = 95.92 ÷ 1.44 = 66.6, so **67 packs**.
3. Bed = 87.20 × 0.40 = **35 bags** of cement and 87.20 × 0.057 = **4.97 t** of sand.
4. Grout = 87.20 × 0.02 = **1.74 bags** of white cement.

Allow more waste (12 to 15%) for small rooms, diagonal laying or large-format tiles.

**Common mistake:** ordering exactly the net area. Cuts at walls and around fittings always produce offcuts you cannot use.

### Earthworks volumes: average end area and prismoidal

For cuttings, embankments and road works, take cross-sections at regular intervals and calculate the volume between them.

| Method | Formula |
|---|---|
| Average end area (two sections) | V = L × (A1 + A2) ÷ 2 |
| Average end area (series, spacing d) | V = d × (A1 ÷ 2 + A2 + A3 + … + An ÷ 2) |
| Prismoidal (end areas A1, A2, true mid-section Am) | V = L ÷ 6 × (A1 + 4Am + A2) |
| Simpson's rule (odd number of sections, spacing d) | V = d ÷ 3 × (A1 + 4(A2 + A4 + …) + 2(A3 + A5 + …) + An) |
| Spot levels on a grid (cell area a) | V = a ÷ 4 × (Σh1 + 2Σh2 + 3Σh3 + 4Σh4) |

In the grid formula, h1 to h4 are depths at points shared by 1, 2, 3 and 4 grid cells.

**Worked example.** Three cross-sections 20 m apart: 12.5 m², 15.0 m² and 18.2 m².

1. Average end area: 20 × (12.5 ÷ 2 + 15.0 + 18.2 ÷ 2) = 20 × 30.35 = **607 m³**.
2. Prismoidal over 40 m, with 15.0 m² as the mid-section: 40 ÷ 6 × (12.5 + 4 × 15.0 + 18.2) = 6.667 × 90.7 = **605 m³**.

Average end area usually gives slightly more than prismoidal. The difference grows where the sections change shape sharply.

**Common mistake:** using a mid-section in the prismoidal formula that was averaged from the two end sections. It must be a surveyed section at the true midpoint, or the formula gives the same answer as average end area.

### Pipework and cable lengths with fittings allowances

**Lengths.** Measure along the run, including the vertical drops to each outlet, switch or fitting. BESMM and SMM measure pipework and cable in metres, with fittings counted as extra over the pipe.

**Stock lengths and connectors.** These are ADLM values from the Rate Gen **Service Constants** on the website:

| Service | Standard length | Connectors |
|---|---|---|
| Pipe | 6 m | one per joint (lengths − 1) |
| Conduit | 3 m | one per joint |
| Cable tray or trunking | 3 m | one per joint |
| Duct | 1.2 m | one per joint |
| Cable | 100 m drum | none |

The fittings allowance in **Service Constants** is **0%** by default. Rate Gen adds nothing for fittings unless you set a percentage. ADLM's MEP plugin takes lengths from the Revit model and adds no fittings allowance of its own.

**Typical allowances** where fittings are not measured separately:

- Pipework fittings: 10 to 15% of the pipe cost.
- Cable: 5 to 10% on length, for terminations, loops and snaking.
- Conduit: about 10% for bends and boxes.

These are rules of thumb for early estimates. A priced bill should measure fittings.

**Worked example.**

1. 47 m of 20 mm conduit: 47 ÷ 3 = 15.7, so **16 lengths** and **15 couplers**.
2. 64 m of pipe: 64 ÷ 6 = 10.7, so **11 lengths** and **10 couplings**.
3. 230 m of 2.5 mm² cable with a 10% allowance: 230 × 1.10 = **253 m**, which is 3 drums of 100 m.

**Common mistake:** counting one coupler per length. A straight run of n lengths has n − 1 joints.

## Formula library

One row for each formula in this handbook.

| Item | Formula | Units | Notes |
|---|---|---|---|
| Rectangle | L × B | m² | |
| Triangle | ½ × base × height | m² | |
| Trapezium | ½ × (a + b) × h | m² | |
| Circle | π × d² ÷ 4 | m² | d is the diameter |
| Cylinder | π × d² ÷ 4 × h | m³ | Piles, round columns |
| Cone or pyramid | ⅓ × base area × h | m³ | |
| Frustum | h ÷ 3 × (A1 + A2 + √(A1 × A2)) | m³ | Tapered pads |
| Centre-line girth (external dims) | 2(L + B) − 4t | m | Rectangle; any plan loses 4t net |
| Centre-line girth (internal dims) | 2(L + B) + 4t | m | |
| Trench excavation | (w + 2ws) × d × L | m³ | ws = working space, typically 0.30 m |
| Earthwork support | 2 × d × L | m² | Both sides of a trench |
| Loose volume | in-situ × (1 + bulking) | m³ | Bulking 10 to 70% by soil type |
| Fill to order | compacted × 1.2 to 1.3 | m³ | Typical compaction factor |
| Fill weight | m³ × 1.6 | t | ADLM value |
| Concrete cement | V × c ÷ Σ × 1.54 × 1,440 ÷ 50 | bags | ADLM; 6.34 bags/m³ for 1:2:4 |
| Concrete sand | V × s ÷ Σ × 1.54 × 1.44 | t | ADLM |
| Concrete granite | sand t × 2 | t | ADLM; valid when g = 2s |
| Blinding (1:4:8) | V × 1.05 × (3.25 bags, 0.65 t, 1.30 t) | bags, t | ADLM |
| Blocks | area × 10 × 1.03 | nr | ADLM; same for 225 and 150 |
| Blockwork mortar | area × 0.20 bag + area × 0.055 t | bags, t | ADLM, 225 mm |
| Render | area × 0.13 bag + area × 0.05 t | bags, t | ADLM, per face |
| Screed (40 mm 1:3) | area × 0.40 bag + area × 0.057 t | bags, t | ADLM |
| Mortar (first principles) | A × t × dry × waste × c ÷ (c + s) × 28.8 | bags | HERON method |
| Rebar weight | d² ÷ 162 × length | kg | d in mm |
| Bars per tonne | 1,000 ÷ (d² ÷ 162 × 12) | nr | 12 m bars |
| Lap length | 40d to 50d | mm | Typical; drawings govern |
| Link length | 2((b − 2c) + (h − 2c)) + 0.15 | m | HERON template |
| Number of links | L ÷ spacing + 1 | nr | |
| L-bar cutting length | A + B − 0.5r − d | m | BS 8666 shape 11; 2d per 90° bend for d ≤ 16 mm |
| Binding wire | steel kg × 0.01 | kg | ADLM |
| Beam formwork | (2h + w) × L | m² | QUIV |
| Column formwork | 2(a + b) × h | m² | QUIV |
| Formwork sheets | area ÷ 2.88 | sheets | ADLM |
| Pitch factor | 1 ÷ cos(pitch) | factor | |
| Roof slope area | plan area over eaves × pitch factor | m² | Uniform pitch |
| Rafter length | (½ span + overhang) ÷ cos(pitch) | m | QUIV |
| Roof rise | ½ span × tan(pitch) | m | QUIV |
| Roof sheets | slope area ÷ 2.0 | sheets | QUIV, HERON |
| Paint | area × 0.026 | 20 L drums | QUIV, Rate Gen; 0.52 L/m² all coats |
| Tiles | area × 1.10 | m² | QUIV, Rate Gen |
| Tile packs | area × 1.10 ÷ 1.44 | packs | QUIV, HERON |
| Average end area | L × (A1 + A2) ÷ 2 | m³ | |
| Prismoidal | L ÷ 6 × (A1 + 4Am + A2) | m³ | Am measured, not averaged |
| Pipe lengths | run ÷ stock length, rounded up | nr | 6 m pipe, 3 m conduit |
| Couplers | lengths − 1 | nr | Per straight run |
| Material carbon, A1-A5 | kg × (factor + A4 + wf × (factor + A4 + 0.005 + 0.013)) | kgCO2e | Rate Gen method (IStructE 2020) |
| Carbon waste factor | w ÷ (1 − w) | factor | 5% waste gives 0.053 |
| Site fuel carbon (A5a) | litres × 2.66 | kgCO2e | Diesel; ADLM value |
| Tonnes of carbon | kgCO2e ÷ 1,000 | tCO2e | |
| Cement carbon | bags × 45.4 (low end 31.7) | kgCO2e | Worked from ADLM values, A1-A5 |
| Rebar carbon | tonnes × 899 | kgCO2e | Worked from ADLM values, A1-A5 |
| 225 mm block carbon | blocks × 2.31 | kgCO2e | Worked from ADLM values; assumed mass |
| 1:2:4 concrete carbon | m³ × 317 (low end 230) | kgCO2e | Worked from ADLM values |
| Carbon coverage | cost with a carbon figure ÷ total cost | % | ICMS export |
| Cost per m² (ICMS 3) | total construction cost ÷ IPMS 2 (or IPMS 1) area | ₦/m² | State which area |
| Carbon per m² (ICMS 3) | total kgCO2e ÷ IPMS 2 (or IPMS 1) area | kgCO2e/m² | State which area |
| ICMS Group 08 | (measured + PC and provisional sums) × preliminaries % | ₦ | ADLM Cloud |
| ICMS 09.020 | (measured + sums + preliminaries) × contingency % | ₦ | ADLM Cloud |
| ICMS 10.020 | (subtotal + contingency) × VAT % | ₦ | ADLM Cloud |

## Constants

### Material densities and conversions

| Material | Value | Source |
|---|---|---|
| Cement, bulk | 1,440 kg/m³ | ADLM (QUIV, HERON, Rate Gen Material Constants) |
| Sharp sand, for concrete conversion | 1,440 kg/m³ | ADLM (QUIV, HERON, Rate Gen Material Constants) |
| Hardcore, laterite, general fill | 1.6 t/m³ | ADLM (QUIV, HERON, Rate Gen Material Constants) |
| Sharp sand and granite, for rate conversion | 1.6 t/m³ | ADLM (QUIV rate conversion) |
| Dry volume factor, concrete | 1.54 | ADLM (QUIV, HERON, Rate Gen Material Constants) |
| Dry volume factor, mortar, screed, render | 1.30 | ADLM (HERON) |
| Dry volume factor, tile beds | 1.20 | ADLM (HERON) |
| Plain concrete | 2,400 kg/m³ | Typical |
| Reinforced concrete | 2,500 kg/m³ | Typical (about 2% steel) |
| Steel | 7,850 kg/m³ | Typical |
| Water | 1,000 kg/m³ | Typical |
| Loose sand, dry | 1,450 to 1,600 kg/m³ | Typical; varies with moisture |
| Granite chippings, loose | 1,450 to 1,600 kg/m³ | Typical |
| Compacted laterite | 1,800 to 2,000 kg/m³ | Typical |

> **Note:** ADLM uses 1,440 kg/m³ for sharp sand because that is the median of the trip-to-tonne conversions Nigerian firms use in their own bills (they range from 1.36 to 1.67 t/m³). Damp sand bulks and weighs differently, so check what your supplier means by a tonne.

### Bag, roll and pack sizes

| Item | Size | Source |
|---|---|---|
| Cement bag | 50 kg | ADLM |
| Emulsion paint drum | 20 L | ADLM |
| POP glue (Top Bond) | 10 kg | ADLM |
| Formwork board | 2.4 × 1.2 m (2.88 m²) | ADLM |
| BRC mesh roll | 48 m² gross, 45.7 m² net of 5% laps | ADLM |
| DPM roll | 50 m² gross, 45.5 m² net of 10% laps | ADLM |
| DPC roll | 50 m | ADLM (HERON) |
| Waterproofing felt roll | 40 m² | ADLM (Rate Gen Material Constants) |
| Tile pack | 1.44 m² | ADLM (QUIV, HERON) |
| Reinforcement bar | 12 m | ADLM |
| Roof timber | 3.6 m | ADLM |
| Conduit, trunking | 3 m | ADLM (Rate Gen) |
| Pipe | 6 m | ADLM (Rate Gen) |
| Cable drum | 100 m | ADLM (Rate Gen) |

### Wastage allowances

| Work | Factor | Source |
|---|---|---|
| Concrete (on top of 1.54) | 1.00 | ADLM (QUIV, HERON, Rate Gen Material Constants) |
| Blinding | 1.05 | ADLM |
| Blockwork | 1.03 | ADLM (QUIV, HERON, Rate Gen Material Constants) |
| Reinforcement | 1.05 | ADLM (QUIV, Rate Gen Material Constants) |
| Reinforcement (on the number of 12 m bars, covering laps and offcuts) | 1.10 | ADLM (HERON) |
| Beam main bars, laps and waste | 1.15 | ADLM (QUIV) |
| Staircase bars, laps and waste | 1.10 | ADLM (QUIV) |
| Finishes (render, screed) | 1.05 | ADLM |
| Formwork (whole plywood sheets, cutting and striking loss) | 1.10 | ADLM (HERON) |
| Tiles | 1.10 | ADLM (QUIV, HERON, Rate Gen Material Constants) |
| Paint and primer | 1.05 | ADLM (HERON) |
| Roofing sheets, laps | 1.10 to 1.15 | Typical |
| Timber | 1.10 | Typical |

> **Tip:** Never stack waste factors. If a factor already carries waste (like the 1.54 dry-volume factor for concrete), adding 5% on top counts it twice. That is exactly why ADLM moved its concrete waste factor from 1.05 to 1.00.

### Labour outputs per day

HERON holds these outputs per gang for an 8-hour working day. It works out the labour rate per unit as the gang's cost per day divided by its output per day.

| Work | Output per day |
|---|---|
| Concrete | 10 m³ |
| Filling | 15 m³ |
| Blockwork | 12 m² |
| Reinforcement | 250 kg |
| Formwork | 12 m² |
| Rendering | 20 m² |
| Plastering | 20 m² |
| Screeding | 25 m² |
| Painting | 40 m² |
| Floor tiling | 8 m² |
| Wall tiling | 7 m² |
| Skirting | 30 m |
| Wall plate | 30 m |
| Roof | 15 m² |
| Surface treatment | 50 m² |
| DPC | 30 m |
| DPM | 50 m² |
| Wire mesh | 50 m² |

**Worked example.** A blockwork gang of one mason and two labourers costs, say, ₦45,000 a day (an illustrative figure). At 12 m² a day, the labour rate is 45,000 ÷ 12 = **₦3,750 per m²**.

Rate Gen **Material Constants** and QUIV also hold labour rates per unit as defaults: for example ₦5,500 per m³ of concrete, ₦600 per m² of blockwork, ₦1,300 per m² of rendering and ₦50,000 per tonne of reinforcement. Treat these as placeholders and set your own in **Material Constants**; labour rates vary widely between states and between labour-only and gang rates.

### Plant outputs

ADLM's plant allowances are **zero by default** in Rate Gen **Material Constants**. Nobody can defend a plant figure that nobody set, so plant is costed only when you enter your own.

Typical outputs for planning:

| Plant | Typical output | Assumption |
|---|---|---|
| Small drum mixer (one-bag) | 10 to 15 m³ per day | Hand-fed, with a full gang |
| Backhoe loader, trench digging | 15 to 25 m³ per hour | Ordinary soil, good access |
| Plate compactor | 100 to 200 m² per hour per layer | 150 mm layers of laterite |
| Tipper, local haul | 6 to 10 trips per day | Under 10 km, no queues |

Plant outputs depend heavily on site conditions. Check them against your own records before you price.

## Grade and unit conversion

### Concrete grades and nominal mixes

| Grade | Characteristic strength at 28 days | Nominal mix commonly equated | Typical use |
|---|---|---|---|
| C7.5 to C10 | 7.5 to 10 N/mm² | 1:4:8 | Blinding, mass fill |
| C15 | 15 N/mm² | 1:3:6 | Oversite, plain strip footings |
| C20 | 20 N/mm² | 1:2:4 | General reinforced work in houses |
| C25 | 25 N/mm² | 1:1.5:3 | Suspended slabs, beams, columns |
| C30 | 30 N/mm² | 1:1:2 | Heavier structural work, water-retaining |

> **Important:** These pairings are a rough guide only. A nominal mix batched by volume on site often falls short of the grade it is equated with, especially when sand is damp or the water is not controlled. Where the specification calls for a grade (C25, for example), a design mix tested by cube results governs, and its cement content comes from the mix design, not from this table.

### Reinforcement grades and notation

| Notation | Meaning | Typical yield strength |
|---|---|---|
| R | Plain round mild steel | 250 N/mm² |
| Y or T | High yield deformed bar (ribbed) | 410 to 460 N/mm² under BS 8110; 500 N/mm² under BS 4449:2005 |
| H | High yield bar in BS 8666 schedules | 500 N/mm² |

How to read the notation:

- **4Y16** means four high yield bars, 16 mm in diameter.
- **R10-200** means plain 10 mm bars (usually links) at 200 mm centres.

High yield bars carry more load per kilogram than mild steel, so never substitute mild steel without the engineer's approval.

### Block sizes

| Common name | Size (L × H × W) | Typical use |
|---|---|---|
| 9 inch block | 450 × 225 × 225 mm | External and load-bearing walls |
| 6 inch block | 450 × 225 × 150 mm | Internal partitions |
| 5 inch block | 450 × 225 × 125 mm | Light partitions, where available |
| 4 inch block | 450 × 225 × 100 mm | Infill, fences, where available |

Each block has a 450 × 225 mm face, so the count per m² is the same for every thickness: about 9.3 laid, 10 ordered.

### Imperial to metric

| Imperial | Metric |
|---|---|
| 1 inch | 25.4 mm |
| 1 foot | 0.3048 m |
| 1 yard | 0.9144 m |
| 1 ft² | 0.0929 m² |
| 1 yd² | 0.8361 m² |
| 1 ft³ | 0.0283 m³ |
| 1 yd³ | 0.7646 m³ |
| 1 acre | 4,046.9 m² |
| 1 lb | 0.4536 kg |
| 1 long ton (UK) | 1,016 kg |
| 1 imperial gallon | 4.546 L |
| 1 US gallon | 3.785 L |

A standard Nigerian plot of 60 × 120 ft is 7,200 ft², which is **668.9 m²** (about 18.29 × 36.58 m).

To go back from metric: 1 m = 3.281 ft, 1 m² = 10.764 ft², 1 m³ = 35.315 ft³, 1 kg = 2.205 lb.

### Tonnes and trips of sand, laterite and granite

Suppliers sell sand, laterite and granite by the trip, named after the truck's nominal capacity. The volume in a trip depends on the truck and on how full it is loaded.

| Typical truck | Typical load |
|---|---|
| 5-tonne tipper | about 3.5 m³ |
| 10-tonne tipper (6-wheeler) | about 6 to 7 m³ |
| 20-tonne tipper (10-wheeler) | about 12 to 14 m³ |
| 30-tonne trailer | about 18 to 20 m³ |

These volumes are typical, not fixed. Confirm what a trip means with your supplier before you price.

**Conversions:**

- Tonnes = m³ × density (1.6 t/m³ for fill, 1.44 t/m³ for sharp sand, as ADLM uses).
- m³ = tonnes ÷ density.
- Trips = loose m³ ÷ m³ per trip.

QUIV's **Material Constants** count hardcore and laterite at **5 m³ per truckload trip** by default.

**Worked example.** You need 20.93 t of hardcore and the quarry sends 10-tonne trucks:

1. Volume = 20.93 ÷ 1.6 = 13.1 m³.
2. At about 6.5 m³ a trip, 13.1 ÷ 6.5 = 2.0, so **2 trips**.

> **Important:** Keep the three units apart: tonnes, cubic metres and trips. Most expensive filling errors come from a factor in one unit being read as another.

### Cement bag conversions

| From | To |
|---|---|
| 1 bag | 50 kg |
| 1 tonne | 20 bags |
| 1 m³ of cement (1,440 kg) | 28.8 bags |
| 1 bag | 0.0347 m³ (34.7 L) |
| 1 head pan of cement | about 0.6 bag (typical 20 L pan, level) |

A level head pan holds about 20 L, so 20 ÷ 34.7 = 0.58 bag. Head pans vary, so measure the one on your site before you rely on it.

### Percentages and slopes

**Percentages:**

- Waste factor = 1 + waste % ÷ 100. For example, 5% gives 1.05.
- Markup and margin are different. A 25% markup on cost is a 20% margin on price: margin = markup ÷ (1 + markup).
- Percentage change = (new − old) ÷ old × 100.

**Slopes.** Slope % = rise ÷ run × 100 = tan(angle) × 100. A gradient of 1 in n is 100 ÷ n percent.

| Gradient | Percent | Degrees | Typical use |
|---|---|---|---|
| 1 in 100 | 1.0% | 0.57° | Drain fall, minimum |
| 1 in 80 | 1.25% | 0.72° | Floor and drain falls |
| 1 in 60 | 1.67% | 0.95° | Flat roof falls |
| 1 in 40 | 2.5% | 1.43° | Paving falls, foul drains |
| 1 in 20 | 5.0% | 2.86° | Gentle ramps |
| 1 in 12 | 8.33% | 4.76° | Accessible ramp, maximum |
| 1 in 10 | 10.0% | 5.71° | Driveways |
| 1 in 4 | 25.0% | 14.04° | Steep drive |
| 1 in 2 | 50.0% | 26.57° | Roof pitch |
| 1 in 1 | 100% | 45.0° | Steep roof |

**Common mistake:** reading a 100% slope as vertical. A 100% slope is 45°: one metre up for every metre across.

## ICMS 3: International Cost Management Standard

ICMS is a standard way of grouping and reporting construction costs so that projects can be compared, wherever they were built and however their bills were laid out. The third edition, ICMS 3, came out in November 2021 and added carbon: the same codes now report a project's carbon emissions beside its cost.

ICMS is published by the ICMS Coalition, a group of professional bodies from around the world that includes RICS. It does not replace your method of measurement. You still measure and bill to BESMM4 or NRM2. ICMS is a layer on top: a fixed set of headings that every bill can be sorted into for reporting.

### Why it matters

- **Comparing like with like.** Two Nigerian bills for similar duplexes can be laid out quite differently, and a bill from Accra or London differently again. Sorted into ICMS Groups, they line up heading by heading, so you can compare substructure with substructure and services with services.
- **Clients and funders ask for it.** International clients, development banks and cost consultants increasingly want cost reports in ICMS form, and carbon beside the cost.
- **Benchmarking.** A firm that reports every job in ICMS builds up its own cost and carbon per m² by building type, which is the start of a cost database.

### How ICMS 3 is built

ICMS 3 codes a cost by levels, joined with full points. **01.2.03.030** reads Buildings : Construction : Structure : Frames and slabs.

| Level | What it is | Examples |
|---|---|---|
| 1 | Project type | 01 Buildings, 02 Roads and runways, 04 Bridges, 08 Pipelines (19 types in all) |
| 2 | Cost category (life cycle stage) | 1 Acquisition, 2 Construction, 3 Renewal, 4 Operation, 5 Maintenance, 6 End of life |
| 3 | Group | 01 to 13 (below) |
| 4 | Sub-Group | 03.030 Frames and slabs, 05.020 Electrical services |

Levels 1 to 3 are required. Level 4 is optional, and is where the detail of a bill goes.

**Project and sub-project.** ICMS lets you report a project as a whole, or split it into sub-projects, each with its own project type. An estate could be reported as one project, or as each house type plus the estate road. ADLM's export reports each ADLM Cloud project as one project.

**The 13 Groups of Construction (Level 2, category 2):**

| Group | Title | Carbon reported? |
|---|---|---|
| 01 | Demolition, site preparation and formation | Yes |
| 02 | Substructure | Yes |
| 03 | Structure | Yes |
| 04 | Architectural works, non-structural works | Yes |
| 05 | Services and equipment | Yes |
| 06 | Surface and underground drainage | Yes |
| 07 | External and ancillary works | Yes |
| 08 | Preliminaries, constructors' site overheads, general requirements | Yes |
| 09 | Risk allowances | Yes |
| 10 | Taxes and levies | Not used |
| 11 | Work and utilities off-site | Not used |
| 12 | Production and loose furniture, fittings and equipment | Yes |
| 13 | Construction-related consultants and supervision | Not used |

**Cost and carbon share the codes.** Construction Costs and Construction Carbon Emissions use the same Groups and Sub-Groups, so one table can carry both. Groups 10, 11 and 13 are not used for carbon: a tax or a consultant's fee has a cost but no material carbon in this sense.

**Floor areas come from IPMS.** ICMS 3 pairs with the International Property Measurement Standards for the floor area that cost and carbon per m² are divided by:

- **IPMS 1** is the external floor area, measured to the outer face of the external walls. It is close to a gross external area.
- **IPMS 2** is the internal floor area, measured to the inside of the external walls (the "internal dominant face"). It is close to a gross internal area.

Cost per m² = total construction cost ÷ floor area. Carbon per m² = total kgCO2e ÷ floor area. Always say which area you divided by, because the two give different answers for the same building.

> **Note:** This section covers the parts of ICMS 3 that a cost report for a building uses. The standard itself has much more: other project types, life cycle costs, and detailed rules on what each Group includes. Read the standard before you issue an ICMS report you will be held to, and check with your client which edition and which level of detail they want.

### Mapping a Nigerian bill into ICMS 3 Groups

A BESMM4 or NRM2 bill is arranged by work section (excavation, concrete, blockwork, finishes). ICMS is arranged by part of the building (substructure, structure, architectural works). So mapping means reading each line and asking which part of the building it builds.

Two rules settle most lines:

- **Keep the parts of an item together.** The concrete, reinforcement and formwork of a column all go where the column goes, in 03.030. They are not split into a "concrete" heading and a "formwork" heading as a work-section bill does.
- **The lowest floor slab is substructure.** ICMS 02.020 runs up to the top of the lowest floor slab. The ground floor slab, its hardcore, DPM and mesh are all Group 02, not Group 03.

**Common bill sections against ICMS 3 Groups (typical; check every line):**

| Bill section or item | ICMS 3 Group and Sub-Group |
|---|---|
| Preliminaries and general items | 08. Staff and supervision 08.010, hoarding and security 08.030, plant 08.040, scaffolding 08.050, temporary water, power and accommodation 08.060, insurances 08.110, testing 08.130 |
| Site clearance, topsoil strip | 01.060 |
| Demolition | 01.050 |
| Soil investigation | 01.010 |
| Dewatering | 01.090 |
| Piling | 02.010 |
| Excavation, disposal, anti-termite, blinding, foundation concrete, blockwork below DPC, hardcore, DPM, ground floor slab | 02.020 |
| Basement walls and floor | 02.030 |
| Columns, beams, suspended slabs, roof beams, staircases (concrete, reinforcement and formwork) | 03.030 |
| Roof timbers: trusses, rafters, purlins, wall plates | 03.030 |
| Roof covering, ridge, fascia, gutters, rainwater goods | 04.030 |
| External blockwork walls | 04.020 |
| Internal blockwork walls and partitions | 04.040 |
| Windows and external doors | 04.020 |
| Internal doors | 04.040 |
| Ironmongery, burglar bars, balustrades, fitted cupboards | 04.050 |
| Plaster, screed, tiling, ceilings, painting (inside) | 04.060 |
| External render and external wall finishes | 04.020 |
| Air conditioning and ventilation | 05.010 |
| Electrical installation | 05.020 |
| Light fittings | 05.030 |
| CCTV, intercom, data | 05.040 |
| Plumbing and water supply | 05.050 |
| Sanitary fittings | 05.060 |
| Fire services | 05.080 |
| Lifts | 05.100 |
| Generators | 05.130 |
| Solar and inverters | 05.140 |
| Septic tank, soakaway, manholes, foul drains | 06.030 |
| Storm water drains and culverts | 06.020 |
| Fencing, gates, boundary wall | 07.020 |
| Paving, kerbs, driveways | 07.040 |
| Landscaping | 07.050 |
| External lighting, borehole, external services | 07.070 |
| PC and provisional sums | The Group of the work the sum covers |
| Contingency | 09.020 Construction contingencies |
| VAT paid by the client on the contract | 10.020 |
| Loose furniture | 12.010 |
| Public utility connections beyond the site | 11.010 |
| Consultants' fees | 13.010 (not usually in a contractor's bill) |

> **Important:** ICMS says mapping needs a cost professional's judgement. A lintel, a parapet or a boundary wall can sit in different Groups depending on what it does. When a line is genuinely unclear, decide it yourself and note why, rather than forcing it into the nearest heading.

### How ADLM does it: the ICMS 3 export on ADLM Cloud

ADLM Cloud turns any priced QUIV, HERON or SERVIQ project into an ICMS 3 cost and carbon report. Open the project, click **More actions** > **Open the classic workspace**, click **Export**, and look for the **ICMS 3** group, described as "international cost and carbon report". The project page's own **Export** menu does not have it. It has two entries:

| Entry | What you get |
|---|---|
| **ICMS 3 cost and carbon (Excel)** | Cost and upfront carbon (A1-A5) by ICMS 3 Group, with every line's code, where its carbon came from, and the lines not yet placed |
| **ICMS 3 cost and carbon (JSON)** | The same report as data, for software that reads the RICS Data Standard 3.3.3 |

It works on any project you can export, including the [sample projects](/guides/samples).

**How each line is placed.** The export reads every bill line in this order and stops at the first thing that settles it:

1. **Words that win anywhere.** Railings, balustrades, burglar bars and ironmongery go to 04.050, preliminaries to 08, contingency to 09.020 and VAT to 10.020, wherever they appear.
2. **The QUIV element.** "Columns – Reinforcement" was measured on the Columns element, so it goes to 03.030 with the column's concrete and formwork.
3. **The line's own words.** "WC", "septic tank", "interlocking paving", "clear site" and many more.
4. **The HERON section heading** the line sits under, such as "--- Sub ---".
5. **The bill category** the plugin gave the line, such as Substructure or Frames.

A SERVIQ line is always a building service, so it goes to Group 05 unless its words say drainage or external works. A "Ditto" line follows the line above. A line that none of these settles is **left unplaced**. The export never guesses a Group, because the standard says that call belongs to a cost professional.

**How the money is placed.** The report total is the contract sum, worked out the same way as the bill's own **Summary**:

| Part of the contract sum | Where it goes |
|---|---|
| Measured lines | Their Group, as above |
| PC and provisional sums | Their Group, read from their description like a bill line |
| Preliminaries (**Preliminaries %** of measured work and the sums) | Group 08, shared between your preliminary items by their **Alloc %**. Each item's name picks its Sub-Group where it can, for example "Insurances" goes to 08.110. With no items, one line in 08. |
| Contingency (on measured work, sums and preliminaries) | 09.020 Construction contingencies |
| VAT (on the subtotal plus contingency) | 10.020 |

Approved variations are not in the report. It follows the contract sum, not the estimated final cost.

**Where the carbon comes from.** Each line's carbon comes from your own Rate Gen rates, firmest match first. The **Carbon from** column on the **Lines** sheet says which:

| Carbon from | Meaning |
|---|---|
| **applied** | The Rate Gen rate the plugin priced the line with |
| **same** | A rate with the line's own description and unit |
| **work** | A rate for the work the line measures (concrete by mix, rebar by size, blockwork by thickness), with any unit converted and anything the bill does not say listed under **Assumed** |
| **direct** | A SERVIQ line that names its own size, such as a cable "4×95 mm²", weighed from the line itself |
| **matched** | Your closest rate for the wording, offered for you to check |
| **none** | No rate fits. The line has no carbon figure and lowers the coverage |

Preliminaries, contingency and VAT carry no carbon in the report.

**The Excel workbook** has five sheets:

| Sheet | What is on it |
|---|---|
| **ICMS 3 report** | The project details ICMS asks for (project type, country, currency, base date, price basis, status, floor areas, carbon boundary, factor sources), each marked **Stated** or **Assumed**, plus the carbon method, the carbon coverage and how much of the cost is placed |
| **Cost by Group (G-2)** | Construction Costs by Group, % of total and cost per m² when a floor area is given, with any unplaced cost shown in red |
| **Carbon by Group (H-1, H-2)** | Upfront carbon by Group in tCO2e, with the low end and kgCO2e per m². Groups 10, 11 and 13 read **Not used** |
| **Lines** | Every line with its ICMS code, Sub-Group, quantity, rate, cost, kgCO2e, **Carbon from**, the Rate Gen rate used, **Assumed**, **Placed by** and **Why** |
| **Not placed** | The lines you still need to place in a Group, largest first |

**"Assumed" details.** Where a project does not state a detail, the report fills in a default and marks it **Assumed**: project type 01 Buildings, country NG, currency NGN, base date the day you export, carbon boundary A1-A5 and quantity source "Bills of quantities". Project status is taken from the project: Estimate, Tender, Contract awarded or Final account.

> **Note:** The screen where you enter a project's ICMS details (floor areas, base date, location) and move a line to another Group is not on ADLM Cloud yet. Until it arrives, those details show as **Assumed**, the per-m² columns are blank, and you divide by the floor area yourself.

**The JSON file** is the same report in the layout of the RICS Data Standard (RDS) 3.3.3, the data format RICS publishes for ICMS 3 cost and carbon. Cost and carbon go in one entry per Group and Sub-Group, carbon in kgCO2e with the low end beside it. The line detail, cost per m², the assumed details and the unplaced cost are kept in an extra ADLM section of the file. Send the JSON when a client or cost consultant has software that reads RDS. Send the Excel workbook to people.

### Worked example: the raft duplex

The **5-Bedroom Duplex - Raft Foundation** sample has a contract sum of about ₦209.0m: ₦161.4m of measured work, ₦10.9m of PC and provisional sums, 7.5% preliminaries, 5% contingency and 7.5% VAT. Exported from the QUIV sample, **Cost by Group (G-2)** reads:

| Code | Group | Cost | % |
|---|---|---|---|
| 2.01 | Demolition, site preparation and formation | ₦0.24m | 0.1% |
| 2.02 | Substructure | ₦52.98m | 25.3% |
| 2.03 | Structure | ₦30.92m | 14.8% |
| 2.04 | Architectural works | ₦77.22m | 36.9% |
| 2.05 | Services and equipment | ₦8.30m | 4.0% |
| 2.06 | Surface and underground drainage | ₦2.60m | 1.2% |
| 2.08 | Preliminaries | ₦12.92m | 6.2% |
| 2.09 | Risk allowances | ₦9.26m | 4.4% |
| 2.10 | Taxes and levies | ₦14.58m | 7.0% |
| 2 | Total Construction Costs | ₦209.03m | 100% |

What to read from it:

1. **The total equals the contract sum.** Nothing is lost or double counted.
2. **Substructure is a quarter of the cost**, as you would expect for a raft on soft clay. On the strip foundation duplex it is about 12%.
3. **Group 05 is the two PC sums**, electrical (₦4.5m) and plumbing (₦3.8m). The services are not measured in this bill. The SERVIQ sample of the same building carries them.
4. **Group 06 is the soakaway and septic tank sum.**
5. **Group 08 is shared between the 22 preliminary items**, so **Lines** shows 08.010 for supervision, 08.110 for insurances, 08.060 for site accommodation, and so on.
6. **Check the Lines sheet before you issue it.** In this sample the export puts the roof beam lines (about ₦9.9m) and the roof carpentry (about ₦2.8m) under 04.030 Roof finishes, because their QUIV element is named "Roof Beams" and "Roofs". ICMS 3 puts roof beams and roof timbers in 03.030 Frames and slabs. Moved there, Structure becomes about ₦43.7m (20.9%), the same as the HERON sample of this duplex. This is exactly the judgement the standard leaves to you.

**Per m².** The sample does not state a floor area. Suppose the gross internal area (IPMS 2) is 420 m², an assumed figure for this example only. Cost per m² = 209,030,000 ÷ 420 = **₦497,700 per m²** (IPMS 2). Do the same with the total tCO2e from **Carbon by Group** for carbon per m².

The carbon figures depend on your own Rate Gen library, so they differ from one account to another. On the duplex samples, a subscriber with a Rate Gen library gets a carbon figure on about 90 to 98% of the cost.

## Carbon in cost planning

A cost plan says what a building will cost. A carbon figure beside it says how much greenhouse gas its materials and construction will release. Clients, banks and planners now ask for both, and the best time to cut carbon is the same as the best time to cut cost: at the design stage, while the specification can still change.

### Upfront embodied carbon

**Embodied carbon** is the carbon released in making, moving, building, maintaining and finally removing a building's materials, as opposed to the energy used to run it. Whole-life carbon assessments split it into stages, following EN 15978 and the RICS professional standard *Whole life carbon assessment for the built environment* (2nd edition, 2023):

| Stage | What it covers |
|---|---|
| A1-A3 | Product: raw materials, transport to the factory and manufacture ("cradle to gate") |
| A4 | Transport of the product to site |
| A5 | Construction: site waste and fuel and energy used on site |
| B1-B7 | Use: maintenance, repair, replacement and operational energy and water |
| C1-C4 | End of life: demolition, transport, waste processing and disposal |

**Upfront carbon** is A1 to A5: everything up to practical completion. It is what a bill of quantities can measure, because the bill already lists the materials. ADLM reports upfront carbon only.

**Units.** Carbon is reported as carbon dioxide equivalent: other greenhouse gases are converted to the amount of CO2 that would warm the planet as much. **kgCO2e** is kilograms. **tCO2e** is tonnes: 1 tCO2e = 1,000 kgCO2e.

**Carbon factors.** A factor is the carbon per kg of a material, cradle to gate (A1-A3). Multiply the mass of material by the factor, then add transport and site waste:

carbon (kgCO2e) = mass (kg) × (factor + A4 + wf × (factor + A4 + C2 + C3-C4))

- **A4** is transport per kg: 0.005 kgCO2e/kg for local materials (about 50 km by road) and 0.032 for national ones (about 300 km).
- **wf** is the waste factor: the extra material bought to cover what is wasted. For a waste rate w, wf = w ÷ (1 − w), so 5% waste gives 0.053.
- **C2** and **C3-C4** are the transport and disposal of that waste: 0.005 and 0.013 kgCO2e/kg (1.77 for timber).
- Fuel burnt on site (A5a) is litres × the fuel's factor, for example 2.66 kgCO2e per litre of diesel.

This is the calculation in the Institution of Structural Engineers' *How to calculate embodied carbon* (2020), and it is the one Rate Gen uses.

### How Rate Gen 3.0.x gives every rate a carbon figure

From Rate Gen 3.0, every built-up rate has a carbon figure, worked out from the same materials and quantities as its price. Open **Carbon & Others** in Rate Gen. The screen is titled **Carbon Computation**, and its table shows each rate's **TRADE**, **TOTAL COST**, **KGCO2E / UNIT** and **COVERAGE**.

- **It follows the build-up.** Change a quantity in a rate's trade and its carbon changes with it. Open a rate to see each material's kgCO2e, and hover over a figure for its factor and source.
- **Labour and plant hire carry no material carbon.** Site fuel in a build-up is counted as A5a.
- **Cement gives a range.** A rate with cement shows a low end and a high end. The high end takes the full cradle-to-gate cement factor. The low end takes the Nigerian producers' own reported figure, which covers only the kiln and its fuel, so it is a floor.
- **An asterisk (*) marks an assumed mass**, for example a sandcrete block weighed from its standard size rather than from a stated weight.
- **Services cables and pipes, from Rate Gen 3.0, build 3.0.2610.1.** Copper cable and earth conductor are weighed from the cores and size in their own names, counting the copper only. PP-R pressure pipe and 110 mm uPVC soil pipe are weighed from their standard sizes. Manufactured items such as air conditioners, pumps, sanitaryware and light fittings are left without carbon in Rate Gen, on purpose, because they need the maker's own figure.

**The factor sources** Rate Gen names are: CIDB Malaysia (2021) *Embodied Carbon Inventory Data for Construction Materials*; IStructE (2020) Table 2.3 (from ICE v3.0 and product EPDs); the UK Government GHG Conversion Factors 2024 for fuels; CARES EPD 0060 (2026) for rebar; and the Dangote Cement and Lafarge Africa 2024 annual reports for the cement low end.

**On ADLM Cloud**, the same calculation runs on every rate in your library, for the state you price in. ADLM Cloud also holds factors for building services that SERVIQ measures: air conditioners, pumps, distribution boards and similar products at the CIBSE TM65 (2021) figure of 9 kgCO2e per kg of product where the item has no EPD, LED light fittings at 43.1 kgCO2e each (the median of six panel EPDs), sanitaryware, ductwork, cable tray and more. These feed the ICMS export and the sample cards.

### How the carbon flows into the ICMS export

1. Rate Gen works out kgCO2e per unit for each rate in your library.
2. The ICMS export finds the rate behind each bill line (see **Carbon from** above) and multiplies its kgCO2e per unit by the line's quantity, converting units where needed (rebar in kg against a rate in tonnes, for example).
3. The lines add up to a carbon total for each Group, in tCO2e, with a low end from the cement range.
4. The cover sheet states the **carbon coverage**: the share of the cost that has a carbon figure behind it.
5. With a floor area, carbon per m² = total kgCO2e ÷ IPMS 2 (or IPMS 1) area.

**Read the coverage first.** A report that covers 60% of the cost understates the building's carbon by roughly the carbon of the other 40%. Look at the lines with **Carbon from** "none" on the **Lines** sheet. They are usually PC sums, manufactured services items or lines with no matching rate.

### Typical carbon factors

**Factors per kg (ADLM values, from Rate Gen):**

| Material | Factor, A1-A3 (kgCO2e/kg) | Source named in Rate Gen |
|---|---|---|
| Cement | 0.83 (low end 0.57) | CIDB 2021; low end from Dangote and Lafarge 2024 reports |
| Reinforcement bar | 0.821 | CARES EPD 0060, scrap-based electric arc furnace steel |
| Structural steel sections | 1.55 | IStructE 2020 |
| Steel fabric mesh | 0.77 | CIDB 2021 |
| Binding wire, nails | 2.27 | CIDB 2021 |
| Sandcrete hollow blocks | 0.0781 (low end 0.0545) | CIDB 2021, concrete block 10 MPa |
| Sand, hardcore, laterite | 0.0049 | CIDB 2021 |
| Granite, crushed rock | 0.010 | CIDB 2021 |
| Sawn softwood | 0.263 | IStructE 2020 |
| Sawn hardwood | 0.31 | CIDB 2021 |
| Plywood | 0.681 | IStructE 2020 |
| Aluminium roofing sheet | 13.0 | IStructE 2020 |
| Sheet glass | 1.44 | IStructE 2020 |
| Ceramic and vitrified tiles | 0.78 | CIDB 2021 |
| Emulsion paint | 2.54 | CIDB 2021 |
| Diesel burnt on site | 2.66 per litre | UK GHG Conversion Factors 2024 |

**Per unit you buy (worked from the ADLM values, A1-A5, including transport and site waste):**

| Item | kgCO2e | Low end | Mass used |
|---|---|---|---|
| Cement, 50 kg bag | 45.4 | 31.7 | 50 kg |
| Reinforcement, per tonne | 899 | | 1,000 kg |
| Structural steel, per tonne | 1,598 | | 1,000 kg |
| 225 mm sandcrete block | 2.31 | 1.66 | 27.5 kg (assumed) |
| 150 mm sandcrete block | 1.53 | 1.10 | 18.2 kg (assumed) |
| Sharp sand, per tonne | 11.4 | | 1,000 kg |
| Granite, per tonne | 16.7 | | 1,000 kg |
| A142 mesh, per m² | 1.88 | | 2.22 kg/m² |

**Concrete has no single factor in Rate Gen.** Its carbon comes from the cement, sand and granite in its build-up. Using the mix quantities from the concrete section of this handbook:

| Mix | kgCO2e per m³ | Low end |
|---|---|---|
| 1:1.5:3 | 393 | 283 |
| 1:2:4 | 317 | 230 |
| 1:3:6 | 232 | 171 |

These are worked from ADLM values, not read from Rate Gen. Your own Rate Gen concrete rate can differ a little, because its build-up may include other items, such as fuel for plant.

A few points about these figures:

- **Cement does most of the work.** In 1:2:4 concrete, the cement is about 90% of the carbon. Cutting cement content, or using a lower grade where the design allows, is the biggest single lever on a Nigerian building's upfront carbon.
- **The rebar factor is chosen for Nigeria.** Nigerian rebar mills melt scrap in electric furnaces, and much imported rebar comes from Turkish scrap-based mills, so Rate Gen uses a scrap-based EPD (0.821). The world-average figure in IStructE 2020, mostly from blast furnace steel, is 1.99. Using it would more than double the rebar carbon.
- **Block masses are assumed.** They come from the NIS 87:2007 block sizes at 1,920 kg/m³. A block from your supplier may weigh more or less.

**Worked example.** 100 m² of 225 mm sandcrete blockwork, using the ADLM block and mortar constants from this handbook:

1. Blocks = 100 × 10 × 1.03 = 1,030 blocks × 2.31 = **2,383 kgCO2e**.
2. Mortar cement = 100 × 0.20 = 20 bags × 45.4 = **909 kgCO2e**.
3. Mortar sand = 100 × 0.055 = 5.5 t × 11.4 = **63 kgCO2e**.
4. Total = 3,355 kgCO2e = **3.36 tCO2e**, or about **33.5 kgCO2e per m²** of wall. At the low end it is about 2.40 tCO2e.

> **Important:** Upfront carbon is not whole-life carbon. It leaves out maintenance, replacement, the energy used to run the building and end of life. Say "upfront carbon (A1-A5)" on every report, and state the coverage and the factor sources, so nobody reads it as more than it is.

This part of the handbook follows real jobs from start to finish. Each use case shows which ADLM products to use, in what order, and where one product hands over to the next. The button names are the ones you see on screen. For the full detail on any product, follow the link to its own guide.

## Which ADLM tool for which job

Start here when you are not sure which product to open. Most jobs use two or three products together, with ADLM Cloud as the place the project ends up.

| The job | Use this | Where it ends up |
|---|---|---|
| Check whether a Revit model is ready to measure | [QUIV for Revit](/guides/quiv): **Model Checker** | A readiness score, an issues list and a **QS Query Report** |
| Measure the building from a Revit model | [QUIV for Revit](/guides/quiv) | A bill and a budget in Revit, saved to ADLM Cloud |
| Measure from PDF drawings | [ADLM HERON](/guides/heron) with PlanSwift 10 or 11 and the ADLM templates | A priced bill, a budget and an Excel bill, saved to ADLM Cloud |
| Measure MEP services from a Revit model | [SERVIQ for Revit MEP](/guides/mep) | A priced services bill and material schedule, saved to ADLM Cloud |
| Price a bill someone sent you in Excel | ADLM Cloud: **Import Excel BoQ · HERON**, then [HERON](/guides/heron) to measure it | A HERON project with your measurements behind the client's lines |
| Build and keep your own rates | [ADLM Rate Gen](/guides/rategen) | One rate library on your account, read by QUIV, HERON, SERVIQ and ADLM Cloud |
| Plan durations and crew sizes | [ADLM Time Pro](/guides/timepro) | An Excel record and a Microsoft Project programme |
| Plan the budget and purchases | [ADLM Cloud](/guides/cloud): **Budget** | A material, labour and plant breakdown, and a buy schedule |
| Value work and issue payment certificates | [ADLM Cloud](/guides/cloud): **Valuation** | Interim payment applications, certificates, variations and a final account |
| Report to a client | [ADLM Cloud](/guides/cloud): **Share dashboard**, **Project report**, **Export** | A public read-only dashboard, PDF reports and Excel workbooks |
| Work with a colleague on one project | [ADLM Cloud](/guides/cloud): **Collaborators** | Shared access at **View only** or **Full access** |
| Report cost and carbon to ICMS 3 | ADLM Cloud, classic workspace: **Export**, then **ICMS 3 cost and carbon (Excel)** | Cost and upfront carbon by ICMS 3 Group, adding up to the contract sum |

> **Note:** Each product is a separate subscription. QUIV does not include SERVIQ, and HERON does not include Rate Gen. Pricing from the rate library in any product needs a Rate Gen subscription on the same account.

## Use case 1: A bungalow BoQ from a Revit model

### Scenario

An architect sends you the Revit model of a three-bedroom bungalow on strip foundations. The client wants a priced bill of quantities by the end of the week.

| Who it is for | Tools used |
|---|---|
| Quantity surveyors and estimators who receive Revit models | QUIV for Revit, ADLM Rate Gen, ADLM Cloud |

### Steps

In Revit, check the model first:

1. Open the model in Revit.
2. On the **ADLM Calculator** tab, click **Model Checker**.
3. Under **Select Model Type**, choose **Architectural Model**.
4. Tick **Check for Overlapping Elements**, then click **Run Model Check**.
5. Read the **Readiness Score** and the **Element Categories**. Click each row under **Issues** to find the element in Revit, and fix duplicates before you measure.
6. If parts of the model are missing or unclear, click **View QS Query** and send the **QS Query Report** to the architect with **Export PDF**.

Measure with QUIV:

1. On the **ADLM Calculator** tab, click **ADLM Calculator** and sign in if asked.
2. On the dashboard, under **Ready for a new project?**, click **Bungalow**.
3. On the **Take off List**, tick the items this job needs and click **Continue**.
4. Work down the sidebar from **Oversite Qty** and **Strip Qty** to **Finishes Qty**. In each module, choose the level and type, check the **Model Quantities**, enter your own inputs (bar sizes, spacing, thicknesses), then click **Save**.
5. The first time you save, type the **Project name** in the **Save Takeoff** window. Use a clear name, for example the client and the building.

> **Tip:** To measure everything in one go, click **✦ Run the whole takeoff** under the take-off list, then **Let QUIV run the whole takeoff**. Items that start with a pick in Revit are listed under **Still needs you**, and you measure those yourself.

Check the bill and save it to the cloud:

1. Click **BoQ** under **Database** in the sidebar.
2. Read down the **Bill of Quantities**. Use the **Done** tick for each line you have checked.
3. Click **Save To Cloud** and confirm the **Project name**.

Price the bill on ADLM Cloud:

1. Sign in at adlmstudio.net and open your QUIV projects (`/projects/revit`). Click **Refresh projects** if the job is not there yet.
2. Open the project and click **Bill of Quantity** under **Views**.
3. On the ribbon, open the **Rates** tab and click **Load RateGen rates**.
4. On the **Home** tab, tick **Only fill empty rates**, then on the **Rates** tab click **Sync rates**. Rate Gen fills every line it can match.
5. For each line still without a rate, click its **Rate** cell and type part of a rate's name. Pick a rate from your library, or type a figure.
6. In the **Summary** box at the foot of the bill, set **Contingency** and **VAT**. On the **Contract** tab, set **Preliminaries %**.
7. Click **Save changes**.

Send the bill out:

1. Click **Export** in the top bar.
2. Choose **Bungalow** under **Elemental BoQ** for a bill by building element, or **Bungalow (Trade format)** for a bill by work section.
3. When the bill goes to the client, click **Mark as tendered** in the **Summary** box, and turn **Follow RateGen changes** off on the **Rates** tab.

### What you get at the end

A measured and priced bill on ADLM Cloud, an elemental or trade bill in Excel, and a budget behind every line that you can use later for purchasing and valuations.

### Tips

- You can also price inside Revit: on the QUIV Bill, click **Load RateGen Prices**, or **View Rates** and **Map** for one line. Pricing on the cloud is easier to share and to change later.
- Rates you type or pick on the cloud are kept when you re-save the project from QUIV.
- If a quantity looks double, run the **Model Checker** again with **Check for Overlapping Elements** ticked, and check that no linked model is placed twice.

## Use case 2: Pricing a tender from PDF drawings

### Scenario

A contractor sends you a tender set of PDF drawings for a two-storey office block. There is no model. You need a priced bill in Excel by the tender date.

| Who it is for | Tools used |
|---|---|
| Estimators and quantity surveyors working from 2D drawings | ADLM HERON with PlanSwift, the ADLM templates, ADLM Rate Gen, Microsoft Excel, ADLM Cloud |

### Steps

Set up the job in PlanSwift:

1. Open **ADLM HERON** and sign in, so the ADLM templates are switched on. If this is the first sign-in on the PC, restart PlanSwift.
2. In PlanSwift, create a new job and set it to metric.
3. Import the PDF drawings, rename each page (for example "Ground Floor Plan") and group the pages into folders by drawing set.
4. Scale every page you will measure on, using a long grid dimension. Check the scale on a dimension running the other way with PlanSwift's Dimension tool.

> **Important:** The scale is set for each page, not the whole job. An unscaled page gives wrong quantities on every line measured on it.

Measure with the ADLM templates:

1. In PlanSwift's templates panel, choose **Complete ADLM TakeOff Plugin**.
2. Work trade by trade: SUBSTRUCTURE, FRAME, BLOCKWORK AND OPENINGS, FINISHES, ROOFING, then the services if they are in your scope.
3. Name each item after the room or element, for example "Offices" or "225 Wall Area". The names become the descriptions on your bill.
4. Organise the folders the way you want the bill to read, for example by storey: "Office Sub", "Office GF", "Office FF".

Read and price the takeoff in HERON:

1. In HERON, on the **Dashboard**, click **Start New**.
2. Click **Quantity Take Off**. Check the **Take Off Items** and the **Take Off Breakdown** for each folder.
3. Double-click concrete items to add reinforcement with **+ Bars** and **+ Links**, then click **Apply Reinforcement**.
4. Click **Save / Export**. The **Review Takeoff Before Saving** screen opens.
5. Type the job name in **Project Name:**.
6. Click **Load rates**. HERON prices the bill from your Rate Gen library and shows how many items matched.
7. For lines with no rate, select the row, type in **Search Rate:** and double-click a result, or type a rate in the **Rate** cell.
8. Check any row shaded amber. Its rate is below the material and labour cost HERON worked out.
9. Use **Up** and **Down** to put the bill in the order you want it printed.

Export and save:

1. Click **Export All** for one workbook with every folder, or **Export Folder(s)** to choose.
2. Click **Save to Cloud** so the job is kept on your account and can be opened on the website.
3. On the **Budget** page in HERON, pick a folder, click **Load rates**, then **Export** for the linked budget workbook.

### What you get at the end

An Excel bill of quantities with one sheet per folder, QS item lettering and a **GEN SUMMARY** sheet, a linked budget workbook with a **Basic Prices** sheet, and the same job on ADLM Cloud.

### Tips

- If you rescale a page after measuring, click **Reload** in **Quantity Take Off** before you save.
- Avoid two items with the same name in one folder. HERON merges them.
- For steelwork, name items with the full designation (for example UKB 305x165x40) and run **Steel Tonnage** to get the tonnage.
- If your firm has its own tender template in Excel, use **Connect Excel** and the **Takeoff Link** pane to link HERON's figures into your own cells instead of exporting.

## Use case 3: Your firm's own rate library

### Scenario

Your firm prices excavation, concrete and blockwork its own way, with its own gang sizes, and hires an excavator for bulk digging. You want every estimator to price QUIV and HERON jobs from the same rates.

| Who it is for | Tools used |
|---|---|
| Senior quantity surveyors and practice leads who set the firm's rates | ADLM Rate Gen (desktop and the RateGen pages on the website), QUIV for Revit, ADLM HERON, ADLM Cloud |

### Steps

Set up the library once:

1. On the ADLM website, open **Profile** and set your **Pricing location (State)**. Rate Gen prices from the zone your state belongs to.
2. Open **ADLM RateGen** and sign in. Click **Yes** if it asks to update your prices to your zone.
3. Click **Library** in the sidebar. Check the location line at the top.
4. On the **Material** tab, click **Edit** on each material you buy at a different price, type your price and click **Update Library**. Do the same on the **Labour** tab for day rates and plant hire.
5. Add anything missing with **Add Material +** or **Add Labour +**, then **Save to Database**. Plant goes in the **Labour** list.

Adjust the shipped rates:

1. Open a work section, for example **Concrete**.
2. Set the **Overhead** and **Profit** boxes to your firm's percentages.
3. Click a rate's **Description** to open its **Rate Composition**.
4. Double-click a **Quantity** cell and type your figure, for example your own mix or gang output.
5. Click **Save**. You will see **Rate saved successfully. Your edits will sync to QUIV and HERON.**

Build custom rates, with plant:

1. Click **Add Custom Rate +** in any section.
2. Type the **Name of Rate** and the **Description**, and set **Overhead** and **Profit**.
3. Under **Materials**, click **Add Material** and pick each material by name, with its **Quantity** per unit.
4. Under **Labour**, click **Add Labour** for the gang. Add the plant here too, for example the excavator, because plant is in the labour library.
5. Check the **Grand Total** and click **Save**.
6. Click **Sync from Cloud** in the header to send the rate to your account.

Check the rate reached your account:

1. On the website, open **RateGen** in the left-hand menu (`/rategen`).
2. Open **My Custom Rates**, then **Effective Rates**. Your rate shows with a **Source** of `user-custom`.

Use the rates on jobs:

1. **HERON:** on the review screen, click **Load rates**, or use **Search Rate:** to apply one rate to a row. In the **Budget**, type a name in a **Price** cell to search your library.
2. **QUIV:** save the job to the cloud, open it on ADLM Cloud, and pick your rates in the **Bill of Quantity** by typing part of the name in the **Rate** cell. Picking a rate also writes its materials, labour and plant into the **Budget**.
3. **Any ADLM Cloud bill:** use **Sync rates** on the **Rates** tab to fill empty lines from your library.

### What you get at the end

One library on your account, priced for your location, with your own build-ups and custom rates. QUIV, HERON and ADLM Cloud all price from it, so two estimators pricing the same item get the same rate.

### Tips

> **Important:** Rates are built only in the ADLM Rate Gen desktop app. The website shows your library and every rate's build-up, but it cannot build, edit or delete a rate or change a price. From Rate Gen 3.0, build 3.0.2610.1 your custom rates download to every PC you sign in on, so a rate built on one PC appears on the others.

- Change prices in the library, and quantities in the build-up. A price is shared by every rate that uses it. A quantity belongs to one rate.
- A project you have already priced keeps its rates. A library change reaches it only when the line is priced again, or when **Follow RateGen changes** is on.

## Use case 4: A budget for a client

### Scenario

A private client is building a duplex and wants to know what it will cost before committing, split into what goes on materials and what goes on labour. You have measured the building in QUIV or HERON and saved it to the cloud.

| Who it is for | Tools used |
|---|---|
| Quantity surveyors advising a client or a developer; contractors planning their own costs | QUIV for Revit or ADLM HERON, ADLM Rate Gen, ADLM Cloud |

### Steps

Price the bill so the budget fills itself:

1. On ADLM Cloud, open the project and click **Bill of Quantity** under **Views**.
2. Click a line's **Rate** cell, type part of a rate's name and pick a Rate Gen rate. ADLM writes that line's materials, labour and plant into the **Budget** at the same time, so the bill and the budget agree.
3. Repeat for each line, or use **Sync rates** on the **Rates** tab with **Only fill empty rates** ticked.
4. Click **Save changes**.

Check the budget:

1. Click **Budget** under **Views**. Each bill item is broken down into rows of **Material**, **Labour**, **Plant**, **Equipment** or **Consumable**.
2. Price any row still at zero by typing a rate, a `=` formula, or a Rate Gen name in its rate cell.
3. Under **Global Overhead & Profit**, type your percentages and click **Apply to all**.
4. Click **Save changes**. The new bill rates flow up to the **Bill of Quantity**.

Plan the purchases:

1. Build the programme first on the **PM Dashboard** (click **Generate from BoQ**, or import one as in Use case 6).
2. In the **Budget**, switch from **Breakdown** to **Buy schedule**. Read **Should already be bought**, **Buy this week** and **Not yet scheduled**, and set the **Lead time** for each material.

Give the client the figures:

1. Click **Export** in the top bar and choose **Export bill & budget workbook**. The workbook has your bill plus separate Material, Labour and Plant schedules, a Schedule of Current Prices and a Material Summary.
2. Click **Project report** for a PDF progress report, then **Download PDF**.
3. To let the client follow the job without an account, open **Dashboard**, click **Share dashboard**, tick **Enable public link** and click **Copy link**.

### What you get at the end

A budget for every bill item, a workbook that shows materials, labour and plant on separate schedules, and a buy schedule tied to the programme.

### Tips

- In QUIV you can see the same split inside Revit: open **Budget** under **Database** and use the **All**, **Material** and **Labour** filters. Tick **Bought** as items are bought.
- In HERON, the **Budget** page shows **Project cost (material + labour)** against the **Take-off value (BoQ)**, with the **Margin**. **Over budget** marks an item whose cost is higher than its rate.
- A bill item counts as complete only when every line under it is marked. Buying the materials is not enough until the labour is done too.
- If a picked rate did not price the Budget, the rate has no build-up in Rate Gen. Price the budget rows yourself, or pick a rate that has one.

## Use case 5: Monthly interim valuations and payment certificates

### Scenario

The contract is signed on a priced bill. You are the QS on site and must value the work every month, issue an interim certificate, and handle variations as the client changes things.

| Who it is for | Tools used |
|---|---|
| Consultant and contractor quantity surveyors running a live contract | ADLM Cloud (any QUIV or HERON project) |

### Steps

Before the first valuation, set the contract up once:

1. Open the project and click **Valuation** under **Views**. Click **Show valuation settings**.
2. Fill in **Client / Employer**, **Retention %**, **VAT %** and **Withholding tax %**. The defaults are 5, 7.5 and 2.5.
3. Choose the **Valuation basis**: **By Bill of Quantity** (each line valued by its own % complete) or **By Budget (Material & Labour)**.
4. Open the **Bill of Quantity**, click the **Contract** tab on the ribbon, then **Lock contract**. Choose a 4-digit PIN and type it twice.
5. Click **Save changes**.

> **Important:** Keep the PIN safe. You need the same 4 digits to unlock the contract, and a lost PIN can only be reset by ADLM support.

Each month, record progress:

1. Walk the site with the bill.
2. On the **Bill of Quantity**, tick a line's box for work fully done (**Mark as completed**), or type a percentage in its **Done** box for part-done work.
3. Tick executed PC and provisional sums on the **Provisional** tab, and tick **Done** against preliminary items as they are executed.
4. Click **Save changes**. The save is logged against that day.

Prepare the valuation:

1. Open **Valuation** and click **Show daily valuation log**.
2. Choose the day in **Valuation date**.
3. Read down **Gross value of works to date**, **Net valuation to date**, **Less previous payments**, **Subtotal before taxes** and **Total amount due for payment**.
4. Click **Print valuation** for the formal Interim Payment Application, or **Export Excel** for an editable workbook.

Issue the certificate:

1. Under **Contract administration**, open **Certificates**.
2. Click **Issue certificate**. It certifies the current value to date as the next IPC.
3. Set its status as it moves along: **Draft**, then **Approved**, then **Paid**.
4. Download the certificate as an Excel workbook for the client.

Handle variations:

1. Open **Variations** and click **Add variation**.
2. Fill in **What changed**, the **Instruction reference**, the **Type** (**Addition** or **Omission**) and the **Value (₦)**.
3. When the instruction is agreed, open the variation and click **Approve**. Only approved variations change the project total.

At the end of the job:

1. Open **Final account** and check the movement against the **Contract sum**.
2. Click **Close the final account** and confirm. Then click **Download** for the final account workbook.

### What you get at the end

A dated valuation for every month, a numbered run of interim certificates with retention, VAT and withholding tax worked out the same way each time, a variations register, and a final account.

### Tips

- Lock the contract before the first certificate, so every certificate is measured against the same baseline.
- Only the latest certificate can be deleted, which keeps the sequence honest.
- If the model or drawings are re-measured after the lock, re-save from QUIV or HERON. Re-measured quantities are recorded as actuals and new lines are raised as variations, so the contract sum does not move. HERON shows a red **CONTRACT LOCKED** chip when this applies.
- Changes are kept only when you click **Save changes**. Save before you leave the page.

## Use case 6: A programme from the bill

### Scenario

The client asks how long the bungalow from Use case 1 will take, and how many workers you need to finish in 20 weeks. Your site team has been logging gang outputs on another job for a month.

| Who it is for | Tools used |
|---|---|
| Site quantity surveyors, site engineers and project managers | ADLM Time Pro, Microsoft Project, ADLM Cloud |

### Steps

Build up output history in Time Pro (before you need it):

1. Open **ADLM Time Pro** and sign in.
2. Each morning, click **Current Weather**, search your town, choose it under **SELECT CITY** and click **Fetch Weather**.
3. Click **Task Log**, then **Add Task** for each gang: the **Item of Work**, the **Trade**, **Skilled Labour** and **Unskilled Labour**, **Hours Worked** and **Break Hours**, the **Output** and **Output Unit**. Click **Save Task**.
4. Record one row per gang per day, and type the item names exactly the same way every time.

> **Important:** A new Time Pro has no history, so every expected duration shows 0. Start recording on site before you need the forecast. A week of honest records is enough to begin.

Turn bill quantities into durations:

1. Keep the bill open beside you, for example the Excel export from ADLM Cloud.
2. In Time Pro, click **Duration Summary**.
3. For each item, click **Click to enter BOQ Qty…** and type the quantity from the bill, in the same unit you recorded output in. Press <kbd>Enter</kbd>.
4. Read **Expected Duration (days)** and the crew under **Required Skilled / Day** and **Required Unskilled / Day**.
5. Where the programme must be shorter, type the days you want in **Planned Duration (days)**. The crew changes to match.

Export the programme:

1. Click **Excel** to keep a record of where every duration came from.
2. Click **MS Project**. Set the **Project Start Date**, choose the **Currency** and type the resource rates (or 0 to fill them in later).
3. Click **Export** and save the `.xml` file.
4. Open the file in Microsoft Project from **File**, then **Open**. Adjust the links where trades can overlap, and set a baseline.

Bring the programme into the project on ADLM Cloud (optional):

1. Save the programme from Microsoft Project.
2. On ADLM Cloud, open the project's **PM Dashboard** and click **Import MS Project**. Choose the `.xml` or `.mpp` file.
3. Track progress with each task's **%** and status, and read **CPI** and **SPI** on the dashboard.

### What you get at the end

Durations and crew sizes based on what your own gangs produce, a Microsoft Project programme with tasks, links, resources and costs, and (if you import it) a programme on ADLM Cloud tied to the bill and the buy schedule.

### Tips

> **Important:** In Time Pro 1.0 (build 1.0.2610.1) the figures you type on the **Duration Summary** clear when you leave that screen, change the Task Log or close the app. Enter your quantities and export in one sitting.

- Keep the output unit the same as the bill unit. Blockwork recorded in m2 must be forecast against a quantity in m2.
- If you only need a quick programme without site records, use **Generate from BoQ** on the **PM Dashboard**, which creates one task per bill item, and set the dates yourself.
- When quantities change, export from Time Pro again and use **Update MS Project** on the **PM Dashboard**. It refreshes the schedule and keeps your progress and links.

## Use case 7: MEP services for a commercial building

### Scenario

You are pricing the mechanical and electrical package on a four-storey office building. The services engineer has a Revit MEP model. The building itself was measured separately in QUIV.

| Who it is for | Tools used |
|---|---|
| Services quantity surveyors and main-contract QSs pricing an M&E package | SERVIQ for Revit MEP (the **ADLM Revit MEP Plugin** in the Installer Hub, the **ADLM MEP & HVAC** tab in Revit), ADLM Rate Gen, ADLM Cloud |

### Steps

Measure the services:

1. Open the services model in Revit. If the services sit in a linked file, open that file directly.
2. On the **ADLM MEP & HVAC** tab, click **Sign In** on the **Tools** panel.
3. Start with HVAC. Click **Duct Quantity**, choose a level under **Select Level**, then a type under **Select Duct Type**.
4. Check the schedule, click **Result Info**, then **Save to Take-Off**.
5. Repeat for each level, then for **Duct Fitting Quantity**, **Air Terminal Quantity** and **HVAC Equipment Quantity**.
6. Move on to **Pipe Works Quantity** and **Plumbing Fixture Quantity**, then **Lighting Quantity**, **Power Quantity** and **Cable Quantity**.

Price inside Revit:

1. Click **Show Takeoff Database** on the **Tools** panel and open **Take-Off Data**.
2. Type a **Unit Rate** on lines you price as a single figure.
3. For lines you want built up, click the **ƒ** button. In the **Rate Build-Up** window, use **SEARCH RATEGEN LIBRARY** to add materials and labour, adjust **Qty/unit** for waste, and click **Done**.
4. Click **Apply to similar lines** to copy a build-up to other lines in the same service.
5. Type your **Overhead %** and **Profit %** at the bottom of **Take-Off Data**.
6. Open **Budget** to see the **COST COMPOSITION** (material, labour and rate-only lines), and **Material Schedule** for the procurement list.

Save and combine on ADLM Cloud:

1. Under **PROJECT**, replace "Untitled" with the job name and "Services", then click **Save to Cloud**.
2. On the website, open your Revit MEP projects (`/projects/mep`, or click **View Projects** on the **ADLM** panel).
3. Open the project. On its **Dashboard**, click **Price services** under **Price services from RateGen** to price the services bill from your library. The lengths, joints and fittings it allows for come from your Services Constants.
4. Open the building project (the QUIV job). On its **Dashboard**, under **Linked Services & Works**, click **+ Link a project**, choose the services project from **Select a project…** and click **Link**. The **Linked total** now shows the whole job.

### What you get at the end

A services bill measured from the model, a material schedule for procurement, a "Complete MEP BoQ" Excel workbook from **Export to Excel**, and one figure for building and services together on ADLM Cloud.

### Tips

- Set your house standards for services once at `/rategen/services-constants`: standard lengths, how joints are counted and the fitting uplift. Click **Save constants**.
- Keep the services and the building as separate projects. They come from different models and are often valued as different packages.
- A service drawn as a single-line diagram or a note is not modelled, so it cannot be measured. Price it another way and say so in the bill.
- Every Revit session starts with an empty Take-Off Database. Click **Load Latest Local** to bring back your last take-off.

## Use case 8: Importing a client's Excel bill into HERON

### Scenario

A client sends you a bill of quantities in Excel, prepared by another firm. They want it checked and priced, and they want real measurements behind the main lines.

| Who it is for | Tools used |
|---|---|
| Quantity surveyors re-measuring or pricing someone else's bill | ADLM Cloud (**Import Excel BoQ · HERON**), ADLM HERON with PlanSwift, ADLM Rate Gen |

> **Note:** Excel bill import is switched on for your account by ADLM and needs a live HERON subscription. If you do not see **Import Excel BoQ · HERON** on your HERON projects page, contact ADLM support through [/support](/support). There is no import button inside HERON itself.

### Steps

Import the bill on the website:

1. Sign in at adlmstudio.net and open your HERON projects (`/projects/planswift`).
2. Click **Import Excel BoQ · HERON**.
3. Type a name in **Project name (optional)**, or leave it blank to use the file name.
4. Under **Excel workbook (.xlsx)**, choose the client's file, then click **Import project**.
5. Open the new project and read the bill. Where the workbook had no material and labour schedule, one has been built for you and priced from your material constants and Rate Gen.

Build the bill in PlanSwift:

1. In PlanSwift, create a job for the drawings and import and scale them.
2. In HERON, on the **Dashboard**, find the imported project under **Recent Projects** and click **Build in PlanSwift**.
3. In the **Build Bill in PlanSwift** window, check the **Template** chosen for each line and change any wrong match. Check **Measured as**, **Depth/Height**, **Width** and **Thickness** where the template needs them.
4. Click **Build in PlanSwift**. Each section becomes a take-off folder and each line a measurable item.

Measure, price and save:

1. Click **Measure** on a line in the **Build Bill in PlanSwift** window to send it to PlanSwift, then trace it on the drawing.
2. In HERON, go to **Quantity Take Off** and click **Reload**.
3. Click **Save / Export**, then **Load rates** to price from your library.
4. Click **Save to Cloud**. Your measurements land on the same lines that came from the client's file.

### What you get at the end

The client's bill, in their order and wording, with your measured quantities behind it, priced from your library and saved as a HERON project you can value and share like any other.

### Tips

- Click **Download the import template** if you want a workbook laid out the way the importer reads best.
- Upload the client's own bill, not one exported from the ADLM website. An ADLM export is refused.
- Building again is safe: lines already in the job are updated, never duplicated, and a line that already has a measurement keeps it. Use **Only lines not in the job** on a second run.
- If you only need to price the bill, not re-measure it, you can price it straight on ADLM Cloud after the import, as in Use case 4.

## Use case 9: Sharing a project with a client or collaborator

### Scenario

Your client wants to follow progress without learning the software. A structural engineer and a junior QS in another office need to work on the same project.

| Who it is for | Tools used |
|---|---|
| Project leads and consultants who report to clients or work with other firms | ADLM Cloud |

There are two ways to share, and they are not the same. A public dashboard link is for a client with no ADLM account: they open a summary dashboard without signing in, and cannot edit anything. A collaborator signs in with their own account and the matching product licence, and sees the whole project at **View only** or **Full access**.

### Steps

Share a dashboard with your client:

1. Open the project and click **Dashboard** under **Views**.
2. Click **Share dashboard**.
3. Tick **Enable public link**, then click **Copy link** and send it to the client.

The client sees a read-only Project Dashboard: overall status, progress, the contract sum and its make-up, cost to date and forecast, interim certificate totals, and planned and actual spend. The button now reads **Shared · link on**.

Invite a collaborator:

1. Open the project and click **Collaborators**.
2. Under **Access level**, choose **View only** or **Full access**.
3. Fill in **Label (optional)**, **Restrict to emails (optional)** and **Max uses (0 = unlimited)** if you want to limit who can join.
4. Click **Generate code**.
5. Under **Active codes**, click **Copy**, or **Link & QR** for a join link and a QR code.

Join as a collaborator:

1. Open the link and sign in, or open the project list for that product, click **Add shared project**, type the **Share code** and click **Add project**.
2. The project appears marked **Shared with you**.

### What each person can see and do

| | Owner | Full access | View only |
|---|---|---|---|
| Edit rates and progress | Yes | Yes | No |
| Download exports and reports | Yes | Yes | No |
| Invite people, delete, public link | Yes | No | No |
| See rates and money | Yes | Only with a Rate Gen licence | Only with a Rate Gen licence |

A collaborator without Rate Gen sees **Rates hidden. A RateGen subscription is required to view rates.** Rates and money totals show as a dash, bill and budget exports are refused, and they cannot raise variations, rebuild the schedule or price services.

### What you get at the end

A client who can check progress from a phone at any time, and colleagues who can work on the same project at the level of access you chose.

### Tips

> **Important:** Anyone who has the public link can open the dashboard. When you no longer want it shared, untick **Enable public link**. Ticking it again brings back the same link.

- A collaborator also needs a licence for the product the project came from, for example HERON for a HERON project. Without it they see **Subscription required**.
- Under **People with access**, change a person between **View only** and **Full access**, or click **Remove**. **Revoke** stops a code being used again.
- Give the client a **Project report** PDF each month alongside the link, so they have a dated record.

## Use case 10: Training a new estimator with the sample projects

### Scenario

A graduate joins your firm. You want them to understand what a finished, priced and valued ADLM project looks like before they touch a live job.

| Who it is for | Tools used |
|---|---|
| Practice leads, training managers and new users teaching themselves | ADLM Cloud learning samples, QUIV for Revit, ADLM HERON, SERVIQ for Revit MEP, ADLM Rate Gen |

### Steps

Week 1: read finished jobs:

1. Sign in at adlmstudio.net and open a product's project list, for example your QUIV projects (`/projects/revit`) or HERON projects (`/projects/planswift`).
2. Above your own projects, find **Learning samples**. If the strip is folded away, click the button that reads **Show** and the number of samples.
3. Open a sample. The banner reads **Sample project · Read-only learning material**. Read **What to look at in this sample** first.
4. Go through every view in order: **Dashboard**, **Bill of Quantity**, **Budget**, **Valuation**, then **PM Dashboard**. On QUIV samples, open **3D Model** and click bill lines to see the elements they were measured from.
5. Try every **Export** to see what each workbook looks like.

Week 2: compare foundations and methods:

1. Open the QUIV and HERON samples for the same foundation type. One was measured from a model, the other from PDF drawings.
2. Compare their bills line by line. Note where a model gives a quantity directly and where a drawing needs a measurement.
3. Open the SERVIQ samples to see how a services bill is laid out.

Week 3: measure a small job:

1. Give the trainee a small, finished job your firm has already measured by hand.
2. Have them run the **Model Checker** (QUIV) or scale the pages (HERON), measure, and save to the cloud under a clearly marked training name.
3. Compare their bill with the sample and with your own figures. Discuss every line more than a few per cent out.

Week 4: price and value:

1. Have the trainee price their bill on ADLM Cloud from Rate Gen, check the **Budget**, and export a bill.
2. Have them record some progress, prepare a valuation in the daily valuation log, and print it with **Print valuation**.
3. Delete the training project when you are done, so it does not use a storage slot.

### What you get at the end

A new estimator who has seen every stage of an ADLM job on a realistic project, measured and priced one of their own, and can tell a good bill from a doubtful one.

### Tips

- Samples are read-only. A trainee can open every tab, filter and export, and nothing can be broken.
- Samples appear for the products your account holds an active licence for.
- **Hide samples** only hides them in that browser. Click **Show N samples** to bring them back.
- Go through the [Rate Gen guide](/guides/rategen) section on reading a build-up together. An estimator who can read a rate's **Rate Composition** can defend every price on a bill.

## Use case 11: An ICMS 3 cost and carbon report for a client

### Scenario

A client's development bank wants the cost plan for a four-bedroom duplex in ICMS 3 form, with its upfront carbon, so it can compare the project with others in its portfolio.

| Who it is for | Tools used |
|---|---|
| Quantity surveyors reporting to international clients, funders and cost consultants | QUIV for Revit or ADLM HERON, ADLM Rate Gen, ADLM Cloud |

### Steps

Price the bill:

1. Measure the building in QUIV or HERON and save it to ADLM Cloud.
2. Price every line from your Rate Gen rates. The carbon comes from the same rates, so a line priced from a Rate Gen rate gets a firm carbon figure.
3. In Rate Gen, open **Carbon & Others** and check that your main rates (concrete, reinforcement, blockwork, roofing, finishes) show a figure under **KGCO2E / UNIT**.

Set the contract figures on ADLM Cloud:

1. Open the project.
2. On the **Contract** tab, set **Preliminaries %**.
3. Under the bill, set each preliminary item's **Alloc %**, or click **Even split**. Each item becomes its own line in Group 08.
4. In the **Summary** box at the foot of the bill, set the contingency and VAT percentages.
5. Click **Save changes**.

Export and check:

1. Click **More actions** > **Open the classic workspace**, then **Export**. Under **ICMS 3**, click **ICMS 3 cost and carbon (Excel)**.
2. On the **ICMS 3 report** sheet, read every detail marked **Assumed** and correct it in your covering letter, especially the base date and the floor area.
3. Check the carbon coverage on the same sheet. If it is well below 90%, look at the lines with **Carbon from** "none" on the **Lines** sheet and price them from Rate Gen rates where you can.
4. Open **Not placed** and decide a Group for each line it lists.
5. Sort **Lines** by **ICMS code** and read down the **Why** column. Note any line you would place differently, such as roof beams placed under roof finishes, and adjust the Group totals in your report.
6. Divide the totals by the floor area for cost and carbon per m², and say which IPMS area you used.
7. If the bank's cost team uses software that reads the RICS Data Standard, export **ICMS 3 cost and carbon (JSON)** as well.

### What you get at the end

A cost report in the 13 ICMS 3 Groups that adds up to the contract sum, an upfront carbon figure (A1-A5) for each Group in tCO2e with its low end, cost and carbon per m², and a line-by-line record of where every figure came from.

### Tips

- The report follows the contract sum. Approved variations are not in it, so issue a fresh report when the final account is agreed.
- Always quote carbon as "upfront carbon (A1-A5)" with the coverage and the factor sources from the cover sheet.
- Quote the low end too where cement dominates. It shows how much depends on the cement figure.
- Try it on a sample first. The [sample projects](/guides/samples) export to ICMS 3 just like your own.

## Good habits

These habits save the most time across all the ADLM products.

### Name projects clearly

- Use the same pattern everywhere, for example client, building and stage: "Adeyemi Duplex, Lekki, Tender". The name you type in QUIV, HERON or SERVIQ is the name on the website and on every export.
- Add the discipline to the name when one job has several projects, for example "Services" for the SERVIQ project, so you can find and link them.
- Mark training and trial projects clearly, and delete them when you finish. Each project uses a storage slot.

### Check the model or the drawings first

- Run the QUIV **Model Checker** before you measure a Revit model. Duplicated elements and links placed twice are the usual reason a quantity comes out double.
- In HERON, scale every page and check the scale on a second dimension before you measure anything.
- In SERVIQ, look at the counts on the model page first. A model with far fewer fittings than the drawings show is telling you something before you measure.

### Save to the cloud often

- Save to the cloud at the end of each working session, not only at the end of the job. Each save from QUIV and HERON updates the project or adds a new version, and does not wipe the rates or purchase marks you added on the website.
- QUIV's **✦ Run the whole takeoff** does not save to the cloud. Check the bill, then click **Save To Cloud** yourself.
- On ADLM Cloud, click **Save changes** before you leave a project. Rates, progress and settings are not kept until you do.

### Keep your rates in one place

- Keep one rate library for your firm, in Rate Gen, and price every job from it. Do not keep a second set of rates in a spreadsheet.
- Set your **Pricing location (State)** on your profile, so every product prices for the right zone.
- Build and edit every rate in the Rate Gen desktop app. The website is read-only for rates; use it to read build-ups and to pick rates onto your projects.
- Turn **Follow RateGen changes** off on a bill before it goes out, so the prices you issued do not move.
