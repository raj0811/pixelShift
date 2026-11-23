# PixelShift

PixelShift converts images locally in your browser. Select multiple images, choose PNG, JPG, WebP, AVIF, GIF, BMP, TIFF, ICO, SVG, or PDF output, tune quality where the format supports it, and download files individually or as a ZIP. No image data is uploaded.

The **Resize** page at `/resize` applies one custom size or preset to a batch of images. You can preserve each image's aspect ratio and download resized files individually or together as a ZIP.

## Requirements

- Node.js 20.9 or newer
- npm

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

For a production build:

```bash
npm run build
npm run start
```

## Usage

1. Drop images into the upload area or choose files. You can add up to 50 images.
2. Choose an output format from the format panel. HEIC is shown as unavailable because browsers do not provide a built-in HEIC encoder.
3. Adjust quality from 1 to 100 (default: 82). PNG is lossless, so its output ignores the quality setting.
4. Select **Convert**. Each image is processed independently.
5. Download a converted image from its row or download all completed images together as a ZIP.

When PDF is selected, **Download all as one PDF** creates a single multi-page PDF directly from the readable selected images.

Common input formats such as PNG, JPEG, GIF, BMP, TIFF, AVIF, and WebP are accepted when the browser can decode them. AVIF output depends on browser canvas encoding support. SVG output embeds the raster image in an SVG wrapper; PDF output creates a single-page image document; ICO embeds a PNG icon. Animated inputs are converted from the frame exposed by the browser's image decoder.

The output keeps each original filename and replaces its extension with the selected format's extension. Dark and light themes are available; the selected theme is saved in local browser storage. All image processing uses browser APIs and stays on the user's device.
