# PUPPET SHOW texture assets

Generated with the built-in `image_gen` tool on 2026-11-19. The user's reference images guided the material and theatre mood; these are newly generated textures, not copies of the reference photos. Image generation did not require an API key or the fallback CLI.

- `aged-oak-v2.jpg`: generated 1774×887 PNG, exported as 1400×700 JPEG at quality 88 with macOS `sips`.
- `burgundy-velvet-v2.jpg`: generated 1024×1536 PNG, exported as 1024×1536 JPEG at quality 88 with macOS `sips`.

Both files are used by `../style.css`. The original generated PNG files remain in the Codex generated-images directory. Sign lettering, button, ropes, animation, drapes and stage interaction remain code driven. The generated textures contain no text.

## Final wood prompt

Use case: photorealistic-natural. Asset type: full-bleed wood surface texture for a vintage hanging wooden theatre sign in a website, not a website mockup. Generate an original straight-on photograph of a single aged honey-brown oak plank surface filling the entire rectangular image, wide landscape about 2:1. Strong beautiful organic horizontal wood grain, two natural knots away from the middle, small worn grooves, subtle roughness, handmade old theatre material, warm subdued amber light, matte rather than varnished. Center area moderately even and readable so cream PUPPET SHOW lettering can be overlaid by code later. Texture fills every pixel. Flat orthographic front view, no perspective. No text, no lettering, no painted marks, no border, no frame, no ropes, no nails, no background, no other objects, no UI, no watermark. This is the raw material for a rustic suspended sign.

## Final velvet prompt

Use case: photorealistic-natural. Asset type: full-bleed velvet curtain fabric texture used on separately animated left and right theatre curtain panels in a website, not a screenshot or complete stage. Generate an original straight-on close photograph of densely pleated heavy burgundy wine-red velvet stage curtains. Rich tangible plush velvet nap, many narrow and medium organic vertical folds of differing widths, deep near-black maroon shadow valleys and muted ruby highlights, a gentle warm tungsten light centered vertically. Luxurious old intimate cabaret theatre atmosphere, slightly aged not glossy plastic. Fill the entire portrait 2:3 image with fabric from edge to edge. No stage opening, no floor, no furniture, no microphone, no sign, no objects, no text, no UI, no logos or watermark. Do not use blue or navy. The fabric should remain convincingly detailed when used as a background material.

## Christine recast · v3

Built-in `image_gen` mode, using the user-supplied Christine marionette sheet as the identity/material reference. No API/CLI fallback. These PNG files retain the generated alpha channel. Runtime code crops the individual parts and gives them separate rig pivots; it does not animate a flattened character sheet. The final expression row begins slightly above the nominal 3×4 grid, so its boundary is explicitly recorded in `sprites.ts`.

Saved assets:

- `example-11/src/assets/christine-ivory-v3.png` — 1086×1448; separate head, corset, skirt, upper arm, forearm, hand, thigh, calf, shoe and three expression heads.
- `example-11/src/assets/christine-pink-v3.png` — same grid/identity and articulated structure, pink lace costume and cheerful expressions.
- `example-11/src/assets/audience-hands-v3.png` — 1024×1536; two clap poses for each of three skin tones, true alpha cutouts.

Christine atlas prompt set:

> Transform the attached Christine design sheet into a production animation cutout atlas preserving the exact face, warm wood grain, brown eyes, chestnut curls and ivory lace outfit. A single true transparent PNG, uniform 3 columns × 4 rows, ideally 1536×2048, separate isolated parts with generous padding, no labels, grid, strings, shadows or stage. Frontal orthographic views, softly lit dimensional 3D. Row 1: head with full hair and neck, closed neutral mouth; corset torso and shoulders without arms/head/skirt; full layered skirt, waistband to hem, without body or legs. Row 2: straight upper arm with ball joint and ivory sleeve cap; straight forearm with ivory lace cuff; elegant wooden hand, wrist up, fingers down. Row 3: straight thigh and ball joints; straight calf and ankle joint; ivory heeled shoe. Row 4: exact same head scale/alignment, half-open singing; wide-open singing; bright cheerful smile. Every item stays within its cell. Genuine alpha transparency.

Pink variant edit prompt:

> Edit this exact animation atlas. Preserve all 12 cells, positions, dimensions, white-space, alpha transparency, limb shapes, wood material, face, chestnut curls and anatomy. Change ONLY the ivory lace garments and shoes to delicate blush PINK lace for a cheerful Popular musical costume; the head expression should be brighter and playful but retain the same person. Remove any stray colored edge artifacts outside the parts; pure transparent surrounding background. Do not add background or text. Same 3 by 4 grid with precisely the same part arrangement.

Audience creation prompt set:

> A single portrait uniform 2 columns × 3 rows true transparent PNG, six isolated pairs of lifelike dimensional human hands and wrists, viewed from a seated audience behind/below. No faces, bodies, text or grid. Each row is the same pair in two poses: left column separated and angled inward, right column palm-to-palm clap, consistent scale, framing and lighting. Row 1 warm medium beige/golden skin, row 2 light ivory/peach skin, row 3 deep rich brown skin. Natural skin, nails and knuckles with soft warm theatre lighting. Dimensional 3D, not flat or wooden. Ideally 1024×1536, generous alpha padding.

Audience final background-extraction edit prompt:

> Remove the brown background completely from this hand animation atlas, preserving precisely the six pairs of realistic 3D clapping hands in the 2 column x 3 row arrangement, their scale and positions. True transparent alpha around each pair and BETWEEN fingers. Keep natural highlights and dark brown skin in bottom row, pale skin middle, golden beige top. No background lighting clouds, no shadows outside silhouettes, no text.

Visual checks: inspected the generated PNGs and their alpha, then rendered the assembled ivory/pink characters and audience offline with the same sprite draw transforms. No development/preview server was started. Source PNGs remain in their generation directory as well as these workspace copies.

## Wooden audience hands · v4

Built-in `image_gen` edit mode. Edit target: existing `audience-hands-v3.png`. The final selected asset was copied into the workspace as **`example-11/src/assets/audience-wooden-hands-v4.png`** (1024×1536, RGBA, genuine transparency verified). The v3 human-skin atlas remains on disk; the stage now loads only v4. No API/CLI fallback, manual painting, or audio/recording generation.

Final prompt:

> Use case: precise-object-edit. Edit this 2-column by 3-row clapping-hands sprite atlas into small THEATRE MARIONETTE HANDS. Replace human skin ONLY with dimensional carved wooden puppet material: elegant rounded wooden finger segments, clearly visible tiny ball and pin joints at every knuckle, segmented thumb and ball wrist. Natural subtle straight wood grain, satin matte finish, soft diffused warm theatre light, delicate 2.5D/3D miniature craftsmanship. Preserve all six pair positions and crop boundaries: open clap pose left column, closed palm-to-palm clap right column, same proportions and matching pair at each row. Row 1 warm honey maple, row 2 pale birch, row 3 deep walnut. Absolutely genuine transparent alpha outside silhouettes AND between fingers, no stage, background, clouds, cast shadows, text, grid or extra objects. Avoid glossy plastic and human flesh.

The v4 stage reuses the ivory/pink Christine atlases with corrected proportions and fixed head/torso/skirt geometry. A new bitmap character sheet was not needed. Curtain and sign photo textures also remain the same; muted colors, lower contrast, softer lighting, smaller sign and a matte walnut floor are implemented in this example's CSS and canvas code.

The earlier marquee used Rye from Google Fonts, with a local Latin WOFF2 fallback saved as `example-11/src/assets/Rye-Latin-v17.woff2`. Source: `https://fonts.gstatic.com/s/rye/v17/r05XGLJT86YzEZ7tfumh4g.woff2`; license: `Rye-OFL.txt`, from `https://github.com/google/fonts/blob/main/ofl/rye/OFL.txt`. The newer theatre typography below replaces its display role and removes the remote stylesheet.

## Walnut hanging sign / theatre programme update — 2026-11-19

- Mode: built-in image generation (`image_gen.imagegen`).
- Asset: `walnut-planks-v5.jpg` (1,800 × 600, JPEG quality 84).
- Original: `/Users/namsujin/.codex/generated_images/01a1ef5e-28c5-7e10-ab15-7f2a2ff1b5cb/exec-fa5190aa-e9ac-433d-9d4a-c0cb36d49980.png`.
- Used on the hanging sign and as a shared material for this example's floor and proscenium only. Frame, leaflet, lace heart and typography are native HTML/CSS/SVG.
- Font assets: Google Fonts Bodoni Moda italic 600 and Great Vibes, local Latin WOFF2 subsets with their adjacent SIL Open Font License files. No remote font request is required.

Exact prompt:

> Use case: photorealistic-natural. Asset type: full-bleed texture for a hanging wooden sign in an intimate vintage marionette theatre. Produce a wide, straight-on, high-resolution realistic photograph of THREE horizontal aged walnut/chestnut wooden planks joined tightly into a single sign surface. Composition aspect ratio 3:1, ideally 1536x512. Wood fills the ENTIRE image edge to edge with NO background, NO margin, NO ropes, NO frame and NO text. Subtle raised plank edges and two thin dark horizontal seams, authentic fine wood grain, a few small knots, softly worn scratches, restrained matte patina and irregular old carpentry. Neutral medium brown with a faint reddish cool undertone, no yellow/orange cast and no purple or pink paint. Soft warm theatrical key light from upper-left and delicate ambient fill, tactile depth yet readable low-contrast center for cream lettering. Match a deep red-brown velvet curtain behind it. This must look like real wood photographed under the same theatre lighting, not a flat painted illustration, no plastic, no glossy varnish, no logos or watermark.

## Ornate theatre surround and vintage programme · v6

Built-in `image_gen.imagegen` generation mode, not the CLI/API fallback. New original foreground theatre scenery inspired by the supplied antique theatre reference; no poster lettering, logos, characters or credits were copied.

- Saved asset: `example-11/src/assets/ornate-theatre-v6.png` (1536 × 1024 RGBA).
- Original: `/Users/namsujin/.codex/generated_images/01a1ef5e-28c5-7e10-ab15-7f2a2ff1b5cb/exec-ca1df761-a401-4a63-a258-37092a23ea00.png`.
- Centre alpha verified at multiple stage-opening positions: 0.0. The photograph supplies the carved proscenium, top swags, pulled-back side drapes, gold fringe, tassels and apron. The movable centre curtains, rear panel wall, live camera, singer, lighting, strings and controls remain independent layers.
- The vintage programme uses native HTML/CSS/SVG: burgundy header, antique-gold ornament/rules, warm ivory paper, three hand-control rows and a wine-red action button. No text is baked into a bitmap.

Final prompt:

> Use case: photorealistic-natural. Asset type: transparent foreground theatrical proscenium for an interactive marionette website. Generate an ORIGINAL richly dimensional ornate antique miniature opera theatre surround, straight-on front elevation, landscape 3:2 canvas, ideally 1920x1280. Genuine ALPHA transparency in the entire large stage opening: central opening from x=17% to83%, y=25% to90%, no backdrop at all. Also transparent wherever no physical frame or fabric exists. Symmetric composition: dark aged olive-black and bronze carved wooden outer arch and tall side pilasters, sculpted acanthus scrollwork in antique gold, softly worn ivory-gold crest at top center without lettering. Rich deep crimson/burgundy velvet festoon swags draped in three overlapping scallops across the top (top 5%-25%), dense tactile folds, fine antique golden fringe and small tassels. Layered gathered red velvet side drapes remain within outer 17% each side, side curtains pulled back and hanging down almost to bottom; recessed inner arch reveals authentic thickness and dark theatre wings. Bottom 9% is a shallow warm dark reddish walnut stage apron with a fine curved gold edge and carved trim, not a floor filling the center. Materials must look like a real small 19th-century theatre photographed with cinematic warm tungsten illumination, deep shadows in carving, muted olive/bronze frame, dark garnet velvet with luminous red folds and mellow gold trim. High craft detail and real spatial depth, elegant vintage storybook theatre but photoreal 3D rather than line art or flat shapes. The OPEN CENTER must be genuinely empty transparent, NOT black, NOT checkerboard, NO interior wall, no floor in opening, no furniture, no people, puppets, microphones, signs, text, logos, title cards, text overlays or watermark. Full proscenium fills canvas edge to edge, no white margins. Preserve ample stage opening for an animated singer. This is an ORIGINAL reusable theatre-frame asset, not a recreation of any poster or brand.

## Hanging title plaque · v7

- Mode: built-in `image_gen.imagegen` generation (no CLI/API fallback).
- Saved asset: `example-11/src/assets/gilded-plaque-v7.png`, 1600 × 533 RGBA, downsampled with macOS `sips` from the generated 2172 × 724 PNG; alpha preserved.
- Original: `/Users/namsujin/.codex/generated_images/01a1ef5e-28c5-7e10-ab15-7f2a2ff1b5cb/exec-9d354e03-bcb9-4a49-9c11-1c397cd6030b.png`.
- A new antique-gold mahogany theatre cartouche matching the v6 proscenium. Title, brass chains, admission-ticket button, focus/hover/press states and existing drop/lift motion remain native HTML/CSS. Only the opening sign and start button consume the new styles; performance controls are unchanged.

Final prompt:

> Use case: photorealistic-natural. Asset type: transparent antique theatre hanging title plaque for an interactive puppet opera website. Create an ORIGINAL richly sculpted antique wooden cartouche plaque, front-on symmetrical elevation, wide 3:1 canvas ideally 1536x512. An elegant single deep oxblood-mahogany wooden sign field, almost black wine red in the shadows, restrained fine real horizontal wood grain and satin aged finish. Surround it with a substantial dimensional ANTIQUE GOLD carved acanthus frame, bevelled inner moulding, flowing baroque scrolls at four corners, a small balanced crest at the top centre and a modest matching flourish below. Shape has gently arched shoulders and curved carved ends, harmoniously ornate rather than an uneven rustic plank. Keep the middle 76 percent of width and middle 48 percent of height DARK, CLEAR, FLAT AND EMPTY so a large single-line PUPPET SHOW title can be placed later by code. Physical gilded wood carving, not a thin drawn line or modern metal frame. Match an ornate old opera theatre: dark olive-bronze architectural frame, crimson velvet drapes, mellow golden fringe. Warm tungsten light from above left, rounded highlights on worn gold leaf, convincing small shadows within carving, softly aged craftsmanship, tactile photoreal miniature 3D. The entire complete plaque fits inside the image with small transparent margins. Genuine ALPHA transparency outside the physical plaque and between protruding scrolls. No background or room, no supporting wall, no ropes/chains, no cast shadow outside the object, no people, curtains, signs inside signs, NO TEXT, NO LETTERS, no logos, watermark, fake checkerboard or painted transparency. This is a reusable isolated theatre plaque, not a website mockup. No orange/yellow rough planks, no jewels or neon.

## Silver invitation frame · v8

- Mode: built-in `image_gen.imagegen` generation; no CLI/API fallback.
- Saved asset: `example-11/src/assets/silver-invitation-v8.png`, 960px wide RGBA, resized with macOS `sips`, with the generated alpha preserved.
- Original: `/Users/namsujin/.codex/generated_images/01a1ef5e-28c5-7e10-ab15-7f2a2ff1b5cb/exec-468a5fee-7146-45cd-ae72-673527e12eb5.png`.
- The silver frame is a newly generated prop inspired by the supplied invitation reference. The red envelope, cream paper, readable guide, film-perforation start button and heart-shaped score notation are native HTML/CSS/SVG/canvas. The title now uses the existing local Rye display font. No face, character or music bitmap was changed.

Final prompt:

> Use case: photorealistic-natural. Asset type: transparent foreground/background decorative frame for a vintage theatre invitation UI. Generate an ORIGINAL large antique SILVER OVAL SERVING TRAY RIM seen perfectly straight from above, portrait aspect 3:4, ideally 1024x1360. Genuine alpha transparency both in the large EMPTY inner oval AND outside the complete outer silhouette. ONLY the thick oval silver rim exists. Silversmith rococo craftsmanship: delicate raised acanthus leaves and small scrolls around an embossed rolled rim, aged tarnished silver in crevices, gently worn ivory-silver highlights, small oval cartouche details, symmetrical but hand crafted, elegant and tactile. The rim occupies the outer 9 percent of the oval width, keeping a huge empty transparent opening for a cream invitation card and a red envelope to be layered later by code. Full oval fits the image with 3 percent transparent margins. Soft warm directional theatre light from upper left, subtle dark patina, dimensional photoreal miniature prop. No gold, no copper, no colored jewels. ABSOLUTELY NO paper, cards, envelope, text, letters, food, table, fabric, stage, curtains, people, shadows outside the physical silver, checkerboard, painted background or watermark. This is only an isolated ornate oval silver frame with transparent middle, not a complete invitation mockup.

## Readable lace theatre programme · v9

- Mode: built-in `image_gen.imagegen` generation; no CLI/API fallback.
- Saved asset: `example-11/src/assets/lace-programme-v9.png` (1080 × 1440 RGBA; resized with macOS `sips`, retaining alpha).
- Original: `/Users/namsujin/.codex/generated_images/01a1ef5e-28c5-7e10-ab15-7f2a2ff1b5cb/exec-d337f303-e9df-484c-b978-232c4ea05729.png`.
- The lace paper is a new original material inspired by the supplied vintage leaflet references. All dark ink text, dividers, scrolling body and fixed action remain native HTML/CSS. The arched glass hall, upright vintage microphone, wooden controller and gemmed wand are native SVG/canvas; no new background/character bitmap or camera recording was required.

Final prompt:

> Use case: photorealistic-natural. Asset type: blank vintage lace-edged paper leaflet for a theatre guidance interface. Produce a full portrait rectangular antique IVORY PAPER SHEET with intricate genuine-looking ivory lace / doily cutwork along all four edges, rounded scalloped outer silhouette, restrained softly aged paper fibers, small floral filigree and pierced eyelets, like an elegant 1920s opera programme or Victorian invitation. The large central rectangular writing area must be LIGHT, CLEAN, PLAIN WARM CREAM with extremely subtle paper grain and no strong stains: at least 75% of image width and 82% of height reserved for highly readable live text later. Lace border occupies about 10% on each side and 7% top/bottom. Soft natural dimensional texture and tiny shadows within lace only, no dramatic lighting, no glossy material. Straight-on flat orthographic view, balanced and symmetric, portrait 3:4 aspect ideally 1024x1360. Genuine ALPHA transparency outside the scalloped paper and through the lace eyelets, preserving an opaque ivory writing area. This is ONE isolated complete paper sheet, no table, fabric, envelope, silver tray, gold frame, ribbons, flowers, ornaments in the centre, text, lettering, calligraphy, logos, watermarks, graphic UI or painted checkerboard. No letters anywhere. Avoid tan/yellow dark aging or busy central texture; readability is essential. Small transparent margins only.

