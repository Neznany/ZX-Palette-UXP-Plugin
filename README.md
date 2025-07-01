# ZX Palette UXP Plugin

This project is an Adobe Photoshop plugin that converts images to the classic ZX Spectrum 16‑color palette. It offers several dithering options and allows exporting the result as a `.scr` file.

## Features

- Preview of the filtered image with adjustable scale
- Multiple dithering algorithms (Bayer, Dot diffusion, Floyd–Steinberg, JJN, Sierra‑3, Stucki, Burkes, Atkinson, Blue‑noise, Clustered ordered, Random threshold)
- Adjustable dithering strength
- Brightness mode (on / off / auto)
- Export to ZX Spectrum screen format (`.scr`)

## Installation

1. Enable **Developer Mode** in Photoshop's UXP Plugins panel.
2. Choose **Load Plugin** and select this repository folder.

The panel will appear under the name *ZX Palette*.

## Usage

1. Open an image in Photoshop. It should not exceed `512x384` pixels and both dimensions must be a multiple of `8`.
2. Open the **ZX Palette** panel (`Plugins → ZX Palette → Open ZX Palette`).
3. Adjust the scale, dithering algorithm and strength, and brightness mode.
4. Click **Додати шар** (Add Layer) to apply the effect on a new layer.
5. Optionally use **Save .scr** to export the image in the ZX Spectrum screen format.

## License

This project is provided as-is under the MIT license.
