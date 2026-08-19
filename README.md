# 🎬 MVRAD DIGITAL — Azerbaijani Subtitles for Stremio

A community Stremio addon providing carefully prepared **Azerbaijani (`AZE`) subtitles** for supported movies.

Our goal is simple: provide Azerbaijani-speaking Stremio users with subtitles that are:

* 🇦🇿 Naturally translated into Azerbaijani
* ⏱️ Properly synchronized with supported releases
* 🎬 Optimized for movie dialogue and scene timing
* ✍️ Reviewed for spelling, grammar and readability
* 🔄 Continuously expanded with new movies

---

## 🚀 Install in Stremio

### Addon URL

Once the addon is deployed, use:

`https://themurad.github.io/Stremio-Subtitle-Addon-Mvrad-Digital/manifest.json`

### Installation

1. Open **Stremio**.

2. Go to **Add-ons**.

3. Choose **Add Addon** or the custom addon URL option.

4. Paste:

   `https://themurad.github.io/Stremio-Subtitle-Addon-Mvrad-Digital/manifest.json`

5. Install **MVRAD DIGITAL Azerbaijani Subtitles**.

6. Open a supported movie.

7. Start playback.

8. Open **Subtitles / CC**.

9. Select the Azerbaijani subtitle provided by the addon.

You only need to install the addon **once**.

When new movies are added to the database, they become available through the same addon automatically.

---

## 🇦🇿 Subtitle Quality

Subtitles are prepared specifically for Azerbaijani viewers.

We aim to avoid:

* Literal word-for-word machine translation
* Incorrect Azerbaijani characters
* Dialogue appearing in the wrong scene
* Poorly divided sentences
* Unnatural expressions
* Inconsistent names and terminology

Where necessary, subtitles are synchronized individually for specific movie releases.

---

## ⏱️ Release Synchronization

Different releases of the same movie may use slightly different timing.

Examples:

* WEB-DL
* WEBRip
* BluRay
* YTS
* Different frame rates or cuts

For this reason, a subtitle may be prepared specifically for a particular release.

The addon supports independent timing corrections for each subtitle.

Example:

```json
"offset_ms": 750
```

means the subtitle is shifted:

`+0.750 seconds`

A negative value shifts subtitles earlier:

```json
"offset_ms": -750
```

---

## 🎥 Supported Movies

The library is continuously growing.

If a movie does not show an Azerbaijani subtitle, it most likely has not been added yet.

New titles can be added without requiring users to reinstall the addon.

---

## 🆕 How Updates Work

The addon is hosted through **GitHub Pages**.

When a new subtitle is added:

`New Azerbaijani SRT → database updated → GitHub deploys → Stremio receives it`

Users do not need to download a new version of the addon.

---

## 🛠️ For Maintainers — Adding a New Movie

### 1. Prepare the subtitle

Use a properly synchronized Azerbaijani `.srt` file encoded in UTF-8.

### 2. Find the IMDb ID

Example:

`tt1375666`

### 3. Upload the SRT

Place it inside:

```text
source_srt/
```

Example:

```text
source_srt/Inception.2010.Azerbaijani.srt
```

### 4. Edit

```text
data/movies.json
```

Add:

```json
"tt1375666": {
  "title": "Inception (2010)",
  "type": "movie",
  "subtitles": [
    {
      "id": "aze-main",
      "lang": "aze",
      "source": "source_srt/Inception.2010.Azerbaijani.srt",
      "output_name": "Inception.2010.Azerbaijani.srt",
      "offset_ms": 0
    }
  ]
}
```

### 5. Commit

Commit the new SRT and database change to the `main` branch.

GitHub Actions will automatically rebuild and deploy the addon.

---

## 💻 Optional Windows Tool

The repository also includes:

```text
add_movie.py
```

Example:

```bat
python add_movie.py tt1375666 "Inception (2010)" "C:\Subtitles\Inception.az.srt"
```

With a `+750 ms` timing correction:

```bat
python add_movie.py tt1375666 "Inception (2010)" "C:\Subtitles\Inception.az.srt" --offset-ms 750
```

Then commit and push the generated changes.

---

## 📂 Project Structure

```text
Stremio-Subtitle-Addon-Mvrad-Digital/
│
├── .github/
│   └── workflows/
│       └── pages.yml
│
├── data/
│   └── movies.json
│
├── source_srt/
│   └── Azerbaijani subtitle files
│
├── add_movie.py
├── build.py
├── manifest.template.json
└── README.md
```

---

## ❓ Subtitle Not Synchronized?

First make sure you are using the intended movie release.

If the subtitle is consistently early or late, a timing correction can be added for that release.

If the timing gradually becomes worse throughout the movie, the subtitle is probably synchronized for a different cut, frame rate, or release and should be retimed separately.

---

## 💬 Requests & Problems

Found a synchronization issue, translation mistake or want to request a movie?

Use the repository's **Issues** section.

When reporting synchronization problems, please include:

* Movie name
* Year
* IMDb ID
* Release name
* Example timestamp where the issue occurs

Example:

```text
Movie: Example Movie (2026)
IMDb: tt12345678
Release: 1080p WEBRip YTS
Problem: Subtitle is approximately 1.2 seconds late at 00:34:20
```

This information makes synchronization fixes much faster.

---

## ❤️ MVRAD DIGITAL

Made for Azerbaijani movie viewers.

**MVRAD DIGITAL**
Better subtitles. Better timing. Better viewing.
