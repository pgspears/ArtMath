// Small WebGL2 toolkit shared by every scene: programs, render targets, a bloom +
// tone-map pipeline, and instanced renderers for glowing lines and points.

export const FSQ_VS = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('This page needs WebGL2, which this browser does not provide.');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('This page needs floating-point render targets (EXT_color_buffer_float), which this device does not provide.');
    gl.getExtension('EXT_float_blend');
    this.gl = gl;
    this.vao = gl.createVertexArray();
    this.cache = new Map();
  }
  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }

  program(vs, fs) {
    const key = vs + '\u0000' + fs;
    if (this.cache.has(key)) return this.cache.get(key);
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
        console.error(log + '\n' + lines);
        throw new Error('Shader compile failed: ' + log);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
    const prog = new Program(gl, p);
    this.cache.set(key, prog);
    return prog;
  }
  fs(src) { return this.program(FSQ_VS, src); }

  texture(w, h, { internal = 'RGBA16F', filter = 'LINEAR', data = null, wrap = 'CLAMP_TO_EDGE' } = {}) {
    const gl = this.gl;
    const fmt = {
      RGBA16F: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT], RGBA32F: [gl.RGBA32F, gl.RGBA, gl.FLOAT],
      RG32F: [gl.RG32F, gl.RG, gl.FLOAT], RG16F: [gl.RG16F, gl.RG, gl.HALF_FLOAT], RGBA8: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE],
    }[internal];
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt[0], w, h, 0, fmt[1], fmt[2], data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl[filter]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl[filter]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl[wrap]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl[wrap]);
    return t;
  }
  // render target with one or more color attachments
  target(w, h, opts = {}) {
    const gl = this.gl;
    const count = opts.count || 1;
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const tex = [];
    const bufs = [];
    for (let i = 0; i < count; i++) {
      const t = this.texture(w, h, { ...opts, data: opts.data ? opts.data[i] : null });
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      tex.push(t); bufs.push(gl.COLOR_ATTACHMENT0 + i);
    }
    gl.drawBuffers(bufs);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer incomplete: ' + st);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
  }
  freeTarget(t) {
    if (!t) return;
    const gl = this.gl;
    gl.deleteFramebuffer(t.fb);
    t.tex.forEach((x) => gl.deleteTexture(x));
  }
  pingpong(w, h, opts) {
    const a = this.target(w, h, opts), b = this.target(w, h, opts);
    return { src: a, dst: b, swap() { const t = this.src; this.src = this.dst; this.dst = t; } };
  }
  bind(t) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null);
    gl.viewport(0, 0, t ? t.w : this.W, t ? t.h : this.H);
  }
  drawFS() {
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }
  additive(on) {
    const gl = this.gl;
    if (on) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.blendEquation(gl.FUNC_ADD); } else gl.disable(gl.BLEND);
  }
}

class Program {
  constructor(gl, p) { this.gl = gl; this.p = p; this.loc = new Map(); this.unit = 0; }
  use() { this.gl.useProgram(this.p); this.unit = 0; return this; }
  l(n) { if (!this.loc.has(n)) this.loc.set(n, this.gl.getUniformLocation(this.p, n)); return this.loc.get(n); }
  f(n, v) { this.gl.uniform1f(this.l(n), v); return this; }
  i(n, v) { this.gl.uniform1i(this.l(n), v); return this; }
  v2(n, a, b) { this.gl.uniform2f(this.l(n), a, b); return this; }
  v3(n, a, b, c) { this.gl.uniform3f(this.l(n), a, b, c); return this; }
  v4(n, a, b, c, d) { this.gl.uniform4f(this.l(n), a, b, c, d); return this; }
  fv(n, arr) { this.gl.uniform1fv(this.l(n), arr); return this; }
  tex(n, t) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + this.unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(this.l(n), this.unit++);
    return this;
  }
}

// HDR light buffer + two-level bloom + 1 - exp(-x) tone map (same look as the C renderer)
const DOWN_FS = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D src; uniform vec2 texel; out vec4 o;
void main() {
  vec4 s = texture(src, uv + texel * vec2(-1.0, -1.0)) + texture(src, uv + texel * vec2(1.0, -1.0))
         + texture(src, uv + texel * vec2(-1.0, 1.0)) + texture(src, uv + texel * vec2(1.0, 1.0));
  o = s * 0.25;
}`;
const BLUR_FS = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D src; uniform vec2 dir; uniform float sigma; out vec4 o;
void main() {
  vec4 acc = vec4(0.0); float wsum = 0.0;
  for (int i = -8; i <= 8; i++) {
    float x = float(i);
    float w = exp(-x * x / (2.0 * sigma * sigma));
    acc += texture(src, uv + dir * x) * w; wsum += w;
  }
  o = acc / wsum;
}`;
const COMP_FS = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D hdr, b1, b2; uniform float s1, s2, exposure, gam; uniform vec3 bg; out vec4 o;
void main() {
  vec3 c = texture(hdr, uv).rgb + s1 * texture(b1, uv).rgb + s2 * texture(b2, uv).rgb;
  c = max(c, 0.0);
  c = 1.0 - exp(-pow(c * exposure, vec3(gam)));
  o = vec4(bg + c, 1.0);
}`;

export class Post {
  constructor(eng) {
    this.eng = eng;
    this.down = eng.fs(DOWN_FS); this.blur = eng.fs(BLUR_FS); this.comp = eng.fs(COMP_FS);
    this.w = 0; this.h = 0;
  }
  ensure() {
    const e = this.eng;
    if (this.w === e.W && this.h === e.H) return;
    [this.hdr, this.a1, this.t1, this.a2, this.t2].forEach((t) => e.freeTarget(t));
    this.w = e.W; this.h = e.H;
    this.hdr = e.target(this.w, this.h);
    const w1 = Math.max(2, this.w >> 2), h1 = Math.max(2, this.h >> 2), w2 = Math.max(2, this.w >> 3), h2 = Math.max(2, this.h >> 3);
    this.a1 = e.target(w1, h1); this.t1 = e.target(w1, h1); this.a2 = e.target(w2, h2); this.t2 = e.target(w2, h2);
    this.clear(true);
  }
  clear(force) {
    const gl = this.eng.gl;
    this.eng.bind(this.hdr); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  }
  // start a frame: decay = 0 clears, otherwise the previous frame fades by that factor (trails)
  begin(decay = 0) {
    this.ensure();
    const gl = this.eng.gl;
    this.eng.bind(this.hdr);
    if (decay <= 0) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    else {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.CONSTANT_ALPHA); gl.blendColor(0, 0, 0, decay);
      this.eng.fs(`#version 300 es
precision highp float; out vec4 o; void main(){ o = vec4(0.0); }`).use();
      this.eng.drawFS();
    }
    this.eng.additive(true);
  }
  finish({ exposure = 1, bloom1 = 0.8, bloom2 = 0.6, gamma = 1, bg = [0, 0, 0] } = {}) {
    const e = this.eng, gl = e.gl;
    e.additive(false);
    const pass = (prog, out, fn) => { e.bind(out); prog.use(); fn(prog); e.drawFS(); };
    pass(this.down, this.t1, (p) => p.tex('src', this.hdr.tex[0]).v2('texel', 1.5 / this.w, 1.5 / this.h));
    const sc = this.w / 1920;
    pass(this.blur, this.a1, (p) => p.tex('src', this.t1.tex[0]).v2('dir', 1 / this.a1.w, 0).f('sigma', 3.0 * Math.max(sc, 0.4)));
    pass(this.blur, this.t1, (p) => p.tex('src', this.a1.tex[0]).v2('dir', 0, 1 / this.a1.h).f('sigma', 3.0 * Math.max(sc, 0.4)));
    pass(this.down, this.t2, (p) => p.tex('src', this.t1.tex[0]).v2('texel', 0.5 / this.t1.w, 0.5 / this.t1.h));
    for (let k = 0; k < 2; k++) {
      pass(this.blur, this.a2, (p) => p.tex('src', this.t2.tex[0]).v2('dir', 1.2 / this.a2.w, 0).f('sigma', 3.0));
      pass(this.blur, this.t2, (p) => p.tex('src', this.a2.tex[0]).v2('dir', 0, 1.2 / this.a2.h).f('sigma', 3.0));
    }
    e.bind(null);
    this.comp.use().tex('hdr', this.hdr.tex[0]).tex('b1', this.t1.tex[0]).tex('b2', this.t2.tex[0])
      .f('s1', bloom1).f('s2', bloom2).f('exposure', exposure).f('gam', gamma).v3('bg', bg[0], bg[1], bg[2]);
    e.drawFS();
  }
}

// Instanced glowing line segments, pixel coordinates (y down). Color = energy per pixel of length.
const LINE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 seg;
layout(location = 1) in vec3 col;
uniform vec2 res; uniform float hw;
out vec3 vcol; out vec2 vq; out float vlen;
void main() {
  vec2 a = seg.xy, b = seg.zw, d = b - a;
  float L = length(d);
  vec2 t = L > 1e-5 ? d / L : vec2(1.0, 0.0);
  vec2 n = vec2(-t.y, t.x);
  int id = gl_VertexID;
  float cx = (id == 1 || id == 2 || id == 4) ? 1.0 : 0.0;
  float cy = (id == 2 || id == 4 || id == 5) ? 1.0 : 0.0;
  float e = hw * 2.5 + 1.0;
  float u = mix(-1.0, L + 1.0, cx), v = mix(-e, e, cy);
  vec2 p = a + t * u + n * v;
  vq = vec2(u, v); vlen = L; vcol = col;
  gl_Position = vec4(p.x / res.x * 2.0 - 1.0, 1.0 - p.y / res.y * 2.0, 0.0, 1.0);
}`;
const LINE_FS = `#version 300 es
precision highp float;
in vec3 vcol; in vec2 vq; in float vlen; uniform float hw; out vec4 o;
void main() {
  float s = max(hw, 0.55);
  float across = exp(-vq.y * vq.y / (2.0 * s * s)) / (s * 2.5066);
  float along = clamp(vq.x + 0.5, 0.0, 1.0) * clamp(vlen - vq.x + 0.5, 0.0, 1.0);
  o = vec4(vcol * across * along, 1.0);
}`;

export class Lines {
  constructor(eng) {
    this.eng = eng; const gl = eng.gl;
    this.prog = eng.program(LINE_VS, LINE_FS);
    this.cap = 65536; this.data = new Float32Array(this.cap * 7); this.n = 0;
    this.vao = gl.createVertexArray(); this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 28, 0); gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 16); gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
  }
  reset() { this.n = 0; }
  add(x0, y0, x1, y1, r, g, b) {
    if (!(Math.abs(x1 - x0) + Math.abs(y1 - y0) < 6000)) return;
    if (this.n >= this.cap) { const d = new Float32Array(this.cap * 2 * 7); d.set(this.data); this.data = d; this.cap *= 2; }
    const o = this.n++ * 7, d = this.data;
    d[o] = x0; d[o + 1] = y0; d[o + 2] = x1; d[o + 3] = y1; d[o + 4] = r; d[o + 5] = g; d[o + 6] = b;
  }
  draw(width = 1.2) {
    if (!this.n) return;
    const gl = this.eng.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.n * 7), gl.STREAM_DRAW);
    this.prog.use().v2('res', this.eng.W, this.eng.H).f('hw', width * 0.5);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.n);
    gl.bindVertexArray(null);
    this.n = 0;
  }
}

// Soft round points, pixel coordinates. Color = total energy of the point.
const PT_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 pos;
layout(location = 1) in vec3 col;
uniform vec2 res;
out vec3 vcol;
void main() {
  vcol = col;
  gl_PointSize = pos.z;
  gl_Position = vec4(pos.x / res.x * 2.0 - 1.0, 1.0 - pos.y / res.y * 2.0, 0.0, 1.0);
}`;
const PT_FS = `#version 300 es
precision highp float;
in vec3 vcol; out vec4 o;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d) * 16.0;
  o = vec4(vcol * exp(-r2 * 1.5), 1.0);
}`;
export class Points {
  constructor(eng) {
    this.eng = eng; const gl = eng.gl;
    this.prog = eng.program(PT_VS, PT_FS);
    this.cap = 65536; this.data = new Float32Array(this.cap * 6); this.n = 0;
    this.vao = gl.createVertexArray(); this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);
  }
  add(x, y, size, r, g, b) {
    if (this.n >= this.cap) { const d = new Float32Array(this.cap * 2 * 6); d.set(this.data); this.data = d; this.cap *= 2; }
    const o = this.n++ * 6, d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = size; d[o + 3] = r; d[o + 4] = g; d[o + 5] = b;
  }
  draw() {
    if (!this.n) return;
    const gl = this.eng.gl;
    gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.n * 6), gl.STREAM_DRAW);
    this.prog.use().v2('res', this.eng.W, this.eng.H);
    gl.drawArrays(gl.POINTS, 0, this.n);
    gl.bindVertexArray(null);
    this.n = 0;
  }
}
