# Offline layout-test fonts

These are the application's existing font families, vendored only for Playwright geometry checks. Tests block external requests, so the Google Fonts imports otherwise fall back to different Thai fonts on Linux and macOS. `testFonts.ts` loads these faces before measuring text; it does not alter application CSS, font sizes, spacing, or assertion thresholds. The production build does not include this directory.

Downloaded from the official [Google Fonts repository](https://github.com/google/fonts) on 2026-10-26. Each family is redistributed under its included SIL Open Font License 1.1 file. Font files are unmodified.

| File | Official source | SHA-256 |
|---|---|---|
| IBMPlexSansThai-Regular.ttf | [IBM Plex Sans Thai Regular](https://github.com/google/fonts/blob/main/ofl/ibmplexsansthai/IBMPlexSansThai-Regular.ttf) | `eee061d1bac39be40f9bb94498898cd1894f5d3d9a2f0ee6cbd48a6bd03d052b` |
| IBMPlexSansThai-Medium.ttf | [IBM Plex Sans Thai Medium](https://github.com/google/fonts/blob/main/ofl/ibmplexsansthai/IBMPlexSansThai-Medium.ttf) | `46ba1b7365cc2c583914f23914cce46e836a72662e34f6e3029b15aaa10b792e` |
| IBMPlexSansThai-SemiBold.ttf | [IBM Plex Sans Thai Semibold](https://github.com/google/fonts/blob/main/ofl/ibmplexsansthai/IBMPlexSansThai-SemiBold.ttf) | `9d7526a0c8dfad63c49815d0cce9eea1026f018468b81c579997e953620a67d3` |
| NotoSansThaiLooped.ttf | [Noto Sans Thai Looped variable](https://github.com/google/fonts/blob/main/ofl/notosansthailooped/NotoSansThaiLooped%5Bwdth%2Cwght%5D.ttf) | `a6d220ea215bc2c4bfcd5c5efc4103e20302443f87f6dca7a9ce733a11f2cfbd` |

Licenses: [IBM-Plex-OFL.txt](IBM-Plex-OFL.txt), [Noto-Thai-Looped-OFL.txt](Noto-Thai-Looped-OFL.txt).
