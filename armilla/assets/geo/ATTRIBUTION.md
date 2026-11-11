# Attribution — offline place data

## GeoNames (CC BY 4.0)

`cities.tsv`, `admin.tsv` and `countries.tsv` are derived from the [GeoNames](https://www.geonames.org/) geographical
database (export dump: `cities15000`, `cities1000`, `admin1CodesASCII`, `admin2Codes`, `countryInfo`,
`alternateNamesV2`, and the `CN`, `TW`, `HK` country files; versions and SHA-256 in `sources.json`), licensed under the
[Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/).

**Changes made**: places selected and de-duplicated; Chinese names selected, shortened, borrowed from divisions or
corrected by hand; Traditional Chinese names partly generated with OpenCC; English names of division features shortened;
coordinates rounded to 4 decimals; time zones normalized (mainland China → Asia/Shanghai); search aliases added.
GeoNames provides the data "as is", without warranty.

What CC BY 4.0 requires of us, and what it allows:

- **Allowed**: copying, redistribution and adaptation for any purpose, **including commercial use** — bundling the
  derived files inside paid / subscription apps on the App Store, Google Play and the web is permitted.
- **Required**: (1) credit GeoNames, (2) link the license, (3) state that the data was modified, wherever the data is
  distributed — i.e. a licenses / acknowledgements screen in each app and on the web.
- **Not allowed**: imposing extra terms that restrict others' use of the GeoNames-derived data itself (our EULA must
  not claim ownership of it), or implying GeoNames endorses the product.

## OpenCC (Apache License 2.0)

The Traditional ↔ Simplified character mappings in `fold.tsv` and the converted zh-Hant names were produced with
[OpenCC](https://github.com/BYVoid/OpenCC) dictionaries via [opencc-js](https://github.com/nk2028/opencc-js)
(MIT; dictionary data Apache License 2.0) at build time. opencc-js is a dev dependency only; nothing of it runs in the apps.

## Snippet for the clients' licenses page

Show verbatim (one per UI language) next to the other open-source notices on iOS, Android and the web:

- **zh-Hans**：地点数据来自 GeoNames（https://www.geonames.org/），依 CC BY 4.0 许可（https://creativecommons.org/licenses/by/4.0/）使用；已做筛选、中文名称整理与繁简转换、坐标取整及时区规范化。繁简字表取自 OpenCC（Apache License 2.0）。
- **zh-Hant**：地點資料來自 GeoNames（https://www.geonames.org/），依 CC BY 4.0 授權（https://creativecommons.org/licenses/by/4.0/）使用；已進行篩選、中文名稱整理與繁簡轉換、座標取整及時區規範化。繁簡字表取自 OpenCC（Apache License 2.0）。
- **en**: Place data © GeoNames (https://www.geonames.org/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Modified: places selected, Chinese names curated and converted between scripts, coordinates rounded, time zones normalized. Character tables from OpenCC (Apache License 2.0).

The strings belong in `packages/i18n` (key suggestion: `about.licenses.geonames`) when the licenses screen is built.
