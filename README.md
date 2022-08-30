# Learning WebRTC for games ☋

## audio

Sound effects: [jsfxr](https://github.com/chr15m/jsfxr) | [Online generator](https://sfxr.me/)

Track music editor: [soundbox](https://sb.bitsnbites.eu/)

## Assets

External [Twemoji Mozilla](https://github.com/mozilla/twemoji-colr/releases) is used for cross-platform emoji rendering.



## Zip

### advance zip

`brew install advancecomp`

## Minimal requirements

- `AudioContext` support is required (available from Safari iOS 14.5, April 2021)

- `webgl2` context is required
- Modern JS syntax support

## JS

strict `boolean` to 0/1 conversion: `+(boolean expr)`

strict `undefined|null|number|boolean` to 0/1: `(expr)|0`


## Shaders

Shaders are minified by [GLSLX - online minifier](https://evanw.github.io/glslx/)

# TODO

- [x] disable mobile safari select canvas on long touch
- [x] fix capturing already captured v-pad
- [x] fix unsafe minification broke connecting

----

- [ ] DESYNC detected. Possible need to load initial state with F64
- [ ] change shoot sound
- [ ] Add particles --- XL
- [ ] Make Gun / Shot-gun / Machine-gun / Plasma Gun / Rail Gun / .
- [ ] Make damage effect (hit player or barrel or static-tree)
- [ ] ...

