# Art Made of Math

Fifteen animations computed live in the browser from equations: fractals, chaos, reaction-diffusion, four-dimensional shapes, colliding galaxies and a black hole. No footage, no image or video AI, no build step and no libraries. Plain HTML, CSS and JavaScript with WebGL2 shaders.

## Put it on GitHub Pages

1. Create a new public repository on GitHub, for example `art-made-of-math`.
2. Upload everything in this folder to the repository root, keeping the folder structure (`index.html`, `css/`, `js/`, `.nojekyll`). On github.com: **Add file → Upload files**, drag the folder contents in, then **Commit changes**.
3. Open **Settings → Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose **main** and **/ (root)**, then **Save**.
4. After a minute or two the site is live at `https://<your-username>.github.io/art-made-of-math/`.

Each scene has its own link, such as `.../art-made-of-math/#blackhole` or `#zeta`.

## Preview on your own computer

The scripts are ES modules, which browsers will not load from a `file://` address. Serve the folder instead:

    python3 -m http.server 8000

then open http://localhost:8000.

## Show it inside an Apps Script portal

Host it on GitHub Pages as above, then embed it from your Apps Script HTML:

    <iframe src="https://<your-username>.github.io/art-made-of-math/" style="width:100%;height:90vh;border:0" allow="fullscreen; autoplay"></iframe>

## Browser support

Needs WebGL2 with floating-point render targets (`EXT_color_buffer_float`): current Chrome, Edge, Firefox and Safari on desktop, and most recent phones. Resolution adapts to the device automatically; the quality menu can force **Sharp** or **Fast**. On phones the simulations use smaller grids.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Page layout and the long-form explanations |
| `css/site.css` | Styles |
| `js/main.js` | Player: loading scenes, animation loop, adaptive resolution, film mode, controls |
| `js/engine.js` | Small WebGL2 toolkit: render targets, bloom and tone mapping, glowing lines and points |
| `js/glsl.js` | Shader code shared between scenes (palettes, noise, complex numbers) |
| `js/audio.js` | Generative score synthesized live with the Web Audio API |
| `js/content.js` | Commentary for each scene: what you see, the math, how the code draws it |
| `js/scenes/*.js` | One file per scene, in film order (listed in `js/scenes/index.js`) |
| `js/data/euler.js` | Fourier coefficients for the pen path that writes e^{i&pi;}+1=0 |
| `tools/` | Python scripts that regenerate `js/data/euler.js` (needs numpy and matplotlib) |

## Editing

- **Change the words:** edit `js/content.js` (per-scene notes) or `index.html` (essays).
- **Change a scene:** each file in `js/scenes/` exports `init(ctx)`, `frame(ctx, t)` and `dispose(ctx)`, plus `title`, `hook`, `duration` (seconds) and `chord` (MIDI notes for the score).
- **Reorder or remove scenes:** edit the list in `js/scenes/index.js`. Scene numbers update automatically; the Volume I/II split comes from each scene's `vol` field.

## Notes on accuracy

- The zeta zeros labeled on screen are the true values, checked with the mpmath library.
- Graphics cards calculate with 32-bit numbers. The Mandelbrot zoom uses perturbation theory with a 64-bit reference orbit computed in JavaScript, so it can zoom about 8 &times; 10^11 deep.
- The formula scenes look the same on every device. The chaotic simulations (double pendulums, Lorenz) differ slightly between graphics cards because rounding differs, and chaos magnifies tiny differences.

Code written with Claude. No image or video AI was used to make any frame.
