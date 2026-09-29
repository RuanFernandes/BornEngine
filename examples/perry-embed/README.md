# Perry Embed — BornEngine rendering inside a Perry UI app

![screenshot](screenshot.png)

A normal Perry UI app whose viewport is a live BornEngine 3D scene. The title
label and stack are plain Perry UI; the viewport uses Perry's `BloomView` host
widget.

```bash
perry compile main.ts -o perry-embed && ./perry-embed
```

This example requires Perry **0.5.1520 or newer**, which provides `BloomView`
and `bloomViewGetNativeHandle` in `perry/ui` ([upstream declarations](https://github.com/PerryTS/perry/blob/v0.5.1520/types/perry/ui/index.d.ts)). The local Perry build is independent of
BornEngine; no Perry fork is required.

Perry exposes the `BloomView` widget on native platforms, while live rendering
depends on the target's BornEngine backend. Surface attachment is implemented
for Windows, macOS, iOS, tvOS, visionOS and Android. Linux/GTK and watchOS do
not attach a live BornEngine surface yet; `attachNativeSurface()` reports
failure there. The web target uses its canvas window path instead.

## How it fits together

Perry UI owns the window and the run loop. `BloomView(w, h)` reserves a native
view in Perry's own view tree; `bloomViewGetNativeHandle(view)` hands out that
view's platform handle (`HWND` / `NSView*` / `UIView*` / `GtkWidget*` /
`ANativeWindow*`). BornEngine attaches its GPU surface to the handle with
`game.window.attachNativeSurface()` and renders into it.

**Perry UI does not link, or know about, BornEngine.** It reserves a native view and
exposes a handle; anything can render into it, and apps that never call
`BloomView` pull in nothing extra. It is the same shape as Flutter's
PlatformView — Flutter never learns about Flame.

## Three rules, each easy to get wrong

1. **The host owns the run loop.** Drive BornEngine's frame from `onFrame` (re-armed
   each frame) with `game.runFrame()`. Embedded games use the host scheduler rather
   than starting a second loop with `game.run()`.
2. **Attach on the first frame the handle is non-zero**, not merely the first
   tick. The native view exists immediately; its handle is only usable once the
   window is actually on screen.
3. **Use `game.window.attachNativeSurface`.** It accepts the native view handle,
   dimensions and returns whether the surface attached successfully.

## Related

Perry ships a smaller 2D version of this at `examples/bloomview_embed_demo.ts`
in the Perry tree. This one is the 3D counterpart: lighting, a camera, and depth.
