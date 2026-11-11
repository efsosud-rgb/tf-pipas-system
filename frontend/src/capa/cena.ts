/**
 * Cena animada da capa: a foto da praia com a pipa da TF Pipas ao vento.
 *
 * Camadas (WebGL + um canvas 2D por cima):
 * 1. Fundo: foto sem a pipa, com o mar ondulando (máscara do mar), espuma que
 *    avança para a praia, brilhos do sol na água e nuvens "respirando".
 * 2. Pipa: recortada da foto, desenhada numa malha que balança (rolagem,
 *    guinada e arfagem com perspectiva) e ondula o tecido com as rajadas.
 * 3. Canvas 2D: a linha (do ombro do menino até a pipa, com barriga que muda
 *    com a tensão), riscos de vento no céu e areia levantada nas rajadas.
 *
 * O movimento do cursor desloca as camadas em profundidades diferentes
 * (paralaxe). Sem WebGL, a capa mostra a foto parada.
 */
import fundoUrl from "../assets/capa-fundo.jpg";
import mascarasUrl from "../assets/capa-mascaras.png";
import pipaUrl from "../assets/capa-pipa.png";
import meta from "../assets/capa.json";

export interface Cena {
  parar(): void;
  /** Posição do cursor normalizada (-1 a 1). */
  apontar(x: number, y: number): void;
  /** Dá um "empurrão" de vento (ao entrar no sistema). */
  rajada(): void;
}

const EXT = meta.extensao;
const LARG = meta.fundo.largura;
const ALT = meta.fundo.altura;
const RET = [meta.pipa.x + EXT, meta.pipa.y, meta.pipa.largura, meta.pipa.altura] as const;
const PIVO = [meta.pivo[0]! + EXT, meta.pivo[1]!] as const;
const LINHA_INICIO = [meta.linha.inicio[0]! + EXT, meta.linha.inicio[1]!] as const;
const LINHA_FIM = [meta.linha.fim[0]! + EXT, meta.linha.fim[1]!] as const;

const VERT_FUNDO = `
attribute vec2 a_pos;
uniform vec2 u_vista;
varying vec2 v_px;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_px = vec2((a_pos.x * 0.5 + 0.5) * u_vista.x, (0.5 - a_pos.y * 0.5) * u_vista.y);
}`;

const FRAG_FUNDO = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_px;
uniform sampler2D u_fundo;
uniform sampler2D u_masc;
uniform vec2 u_cena;
uniform vec3 u_map;
uniform float u_t;
uniform float u_ext;
uniform vec2 u_horiz;
uniform vec4 u_praia;
uniform float u_luz;
uniform float u_rajada;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruido(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 s = (v_px - u_map.yz) / u_map.x;
  vec3 m = texture2D(u_masc, clamp(s / u_cena, 0.0, 1.0)).rgb;
  float mar = m.r;
  float ceu = m.g;
  float molhada = m.b;
  float t = u_t;

  // profundidade no mar: 0 no horizonte, 1 na beira da praia
  float xf = (s.x - u_ext);
  float xn = xf / 1000.0;
  float hy = u_horiz.x * xf + u_horiz.y;
  float py = ((u_praia.x * xn + u_praia.y) * xn + u_praia.z) * xn + u_praia.w;
  float prof = clamp((s.y - hy) / max(py - hy, 1.0), 0.0, 1.0);

  vec2 d = vec2(0.0);
  float amp = mix(0.45, 3.1, prof) * (0.85 + 0.35 * u_rajada);
  float fase = s.y * 0.21 - t * 1.7 + sin(s.x * 0.012 + t * 0.35) * 1.4;
  d.y += amp * 0.6 * sin(fase);
  d.x += amp * 0.9 * sin(s.x * 0.018 - t * 1.05 + s.y * 0.07);
  d *= mar;
  vec2 dc = vec2(2.4 * sin(s.y * 0.018 + t * 0.11) + 1.2 * sin(s.x * 0.006 - t * 0.07) + 1.6 * sin(t * 0.05),
                 0.9 * sin(s.x * 0.012 + t * 0.09));
  d += dc * ceu;

  vec3 cor = texture2D(u_fundo, clamp((s + d) / u_cena, vec2(0.0005), vec2(0.9995))).rgb;
  float lum = dot(cor, vec3(0.299, 0.587, 0.114));

  // espuma avançando para a praia
  float onda = sin((s.y - hy) * 0.16 - t * 2.3 + ruido(vec2(s.x * 0.02, t * 0.2)) * 3.0);
  float espuma = smoothstep(0.55, 1.0, onda) * smoothstep(0.42, 0.85, lum);
  cor += vec3(0.10, 0.11, 0.12) * espuma * mar;
  // brilhos do sol na água escura
  float br = ruido(vec2(s.x * 0.35, s.y * 1.1 - t * 1.2));
  cor += vec3(0.9) * pow(br, 18.0) * mar * (1.0 - smoothstep(0.5, 0.8, lum)) * 0.55;
  // areia molhada cintilando
  cor += vec3(0.06, 0.06, 0.05) * molhada * (0.5 + 0.5 * sin(s.x * 0.045 - t * 1.3));

  gl_FragColor = vec4(cor * u_luz, 1.0);
}`;

const VERT_PIPA = `
attribute vec2 a_uv;
uniform vec4 u_ret;
uniform vec2 u_pivo;
uniform vec3 u_map;
uniform vec2 u_vista;
uniform float u_t;
uniform float u_rot;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_rajada;
uniform vec2 u_desl;
varying vec2 v_uv;
varying float v_luz;
void main() {
  vec2 p = u_ret.xy + a_uv * u_ret.zw;
  vec2 q = p - u_pivo;
  float forca = 1.0 + 2.4 * u_rajada;
  float fa = a_uv.x * 6.0 + a_uv.y * 3.5 - u_t * 5.2;
  float fb = a_uv.x * 11.0 - a_uv.y * 7.0 - u_t * 7.3;
  float borda = smoothstep(0.05, 0.55, length(a_uv - vec2(0.5)));
  float z = (sin(fa) * 0.6 + sin(fb) * 0.25) * forca * (0.35 + 0.65 * borda);
  float cy = cos(u_yaw); float sy = sin(u_yaw);
  float cp = cos(u_pitch); float sp = sin(u_pitch);
  vec3 r = vec3(q, z);
  r = vec3(cy * r.x + sy * r.z, r.y, -sy * r.x + cy * r.z);
  r = vec3(r.x, cp * r.y - sp * r.z, sp * r.y + cp * r.z);
  float esc = 1600.0 / (1600.0 + r.z);
  vec2 q2 = r.xy * esc + vec2(z * 0.35, z * 0.55);
  float c = cos(u_rot); float s = sin(u_rot);
  q2 = vec2(c * q2.x - s * q2.y, s * q2.x + c * q2.y);
  vec2 cena = u_pivo + q2 + u_desl;
  vec2 px = cena * u_map.x + u_map.yz;
  vec2 clip = px / u_vista * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
  v_luz = 1.0 + 0.055 * (cos(fa) * 0.8 + cos(fb) * 0.3) * forca * (0.35 + 0.65 * borda);
}`;

const FRAG_PIPA = `
precision mediump float;
uniform sampler2D u_pipa;
uniform float u_luz;
varying vec2 v_uv;
varying float v_luz;
void main() {
  vec4 c = texture2D(u_pipa, v_uv);
  gl_FragColor = vec4(c.rgb * v_luz * u_luz, c.a * u_luz);
}`;

function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error(`Imagem da capa não carregou: ${url}`));
    img.src = url;
  });
}

function compilar(gl: WebGLRenderingContext, vert: string, frag: string): WebGLProgram {
  const prog = gl.createProgram()!;
  for (const [tipo, fonte] of [
    [gl.VERTEX_SHADER, vert],
    [gl.FRAGMENT_SHADER, frag],
  ] as const) {
    const sh = gl.createShader(tipo)!;
    gl.shaderSource(sh, fonte);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "erro no shader");
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "erro no programa");
  return prog;
}

function textura(gl: WebGLRenderingContext, img: HTMLImageElement, premultiplicar: boolean): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplicar);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** Soma de senos com frequências "desencontradas": parece aleatório, mas é suave. */
function onda(t: number, f: number[], fase: number[], peso: number[]): number {
  let v = 0;
  for (let i = 0; i < f.length; i++) v += Math.sin(t * f[i]! + fase[i]!) * peso[i]!;
  return v;
}

interface Risco {
  x: number;
  y: number;
  comp: number;
  vel: number;
  alfa: number;
  fase: number;
  vida: number;
}
interface Grao {
  x: number;
  y: number;
  vel: number;
  alfa: number;
  r: number;
  fase: number;
}

export async function criarCena(
  canvasGl: HTMLCanvasElement,
  canvas2d: HTMLCanvasElement,
  opcoes: { reduzido: boolean },
): Promise<Cena | null> {
  const gl = canvasGl.getContext("webgl", { alpha: false, antialias: true, premultipliedAlpha: true, powerPreference: "low-power" });
  const ctx = canvas2d.getContext("2d");
  if (!gl || !ctx) return null;

  const [imgFundo, imgMasc, imgPipa] = await Promise.all([carregarImagem(fundoUrl), carregarImagem(mascarasUrl), carregarImagem(pipaUrl)]);

  const progFundo = compilar(gl, VERT_FUNDO, FRAG_FUNDO);
  const progPipa = compilar(gl, VERT_PIPA, FRAG_PIPA);
  const texFundo = textura(gl, imgFundo, false);
  const texMasc = textura(gl, imgMasc, false);
  const texPipa = textura(gl, imgPipa, true);

  // triângulo que cobre a tela
  const bufTela = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, bufTela);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  // malha da pipa (N x N quadrados)
  const N = 22;
  const verts: number[] = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N, v0 = j / N, v1 = (j + 1) / N;
      verts.push(u0, v0, u1, v0, u0, v1, u1, v0, u1, v1, u0, v1);
    }
  }
  const bufMalha = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, bufMalha);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const totalVerts = verts.length / 2;

  const uf = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const U = {
    f: {
      vista: uf(progFundo, "u_vista"), cena: uf(progFundo, "u_cena"), map: uf(progFundo, "u_map"), t: uf(progFundo, "u_t"),
      ext: uf(progFundo, "u_ext"), horiz: uf(progFundo, "u_horiz"), praia: uf(progFundo, "u_praia"), luz: uf(progFundo, "u_luz"),
      rajada: uf(progFundo, "u_rajada"), fundo: uf(progFundo, "u_fundo"), masc: uf(progFundo, "u_masc"),
    },
    p: {
      ret: uf(progPipa, "u_ret"), pivo: uf(progPipa, "u_pivo"), map: uf(progPipa, "u_map"), vista: uf(progPipa, "u_vista"),
      t: uf(progPipa, "u_t"), rot: uf(progPipa, "u_rot"), yaw: uf(progPipa, "u_yaw"), pitch: uf(progPipa, "u_pitch"),
      rajada: uf(progPipa, "u_rajada"), desl: uf(progPipa, "u_desl"), pipa: uf(progPipa, "u_pipa"), luz: uf(progPipa, "u_luz"),
    },
  };
  const aPos = gl.getAttribLocation(progFundo, "a_pos");
  const aUv = gl.getAttribLocation(progPipa, "a_uv");

  // ---- tamanho e mapeamento cena → tela -----------------------------------
  let vw = 1, vh = 1, dprGl = 1, dpr2d = 1;
  function redimensionar() {
    const r = canvasGl.getBoundingClientRect();
    vw = Math.max(1, r.width);
    vh = Math.max(1, r.height);
    dprGl = Math.min(window.devicePixelRatio || 1, 1.5);
    dpr2d = Math.min(window.devicePixelRatio || 1, 2);
    canvasGl.width = Math.round(vw * dprGl);
    canvasGl.height = Math.round(vh * dprGl);
    canvas2d.width = Math.round(vw * dpr2d);
    canvas2d.height = Math.round(vh * dpr2d);
  }
  redimensionar();
  const observador = new ResizeObserver(redimensionar);
  observador.observe(canvasGl);

  /** k = px por unidade da cena; (ox, oy) = deslocamento. A foto encosta na direita, ocupando a altura. */
  function mapa(sobra: number, parX: number, parY: number) {
    const k = (vh / ALT) * sobra;
    const corteX = (ALT - ALT / sobra) / 2;
    let ox = vw - (LARG - corteX) * k;
    // janela estreita: centraliza menino + pipa em vez de cortar o menino
    const esquerdaFoto = ox + EXT * k;
    if (esquerdaFoto < 0) {
      const centroAlvo = (EXT + 560) * k;
      ox = Math.min(Math.max(vw * 0.5 - centroAlvo, vw - LARG * k), 0);
    }
    // corta mais embaixo (areia) do que em cima (topo da pipa)
    const sobraY = vh - ALT * k;
    const oy = sobraY * 0.22;
    return { k, ox: ox + parX, oy: oy + parY };
  }

  // ---- estado da animação ---------------------------------------------------
  let rodando = true;
  let quadro = 0;
  const inicio = performance.now();
  let ultimo = inicio;
  let mira = { x: 0, y: 0 };
  const cursor = { x: 0, y: 0 };
  let empurrao = 0;
  const riscos: Risco[] = [];
  const graos: Grao[] = [];
  let acumRisco = 0;
  let acumGrao = 0;

  function desenhar(agora: number) {
    if (!rodando) return;
    const dt = Math.min(0.05, (agora - ultimo) / 1000);
    ultimo = agora;
    const t = (agora - inicio) / 1000 + 12.0;
    const entrada = Math.min(1, (agora - inicio) / 900);
    const facil = 1 - Math.pow(1 - Math.min(1, (agora - inicio) / 2400), 3);
    const sobra = 1.045 + 0.06 * (1 - facil);

    cursor.x += (mira.x - cursor.x) * Math.min(1, dt * 3.2);
    cursor.y += (mira.y - cursor.y) * Math.min(1, dt * 3.2);
    empurrao = Math.max(0, empurrao - dt * 0.9);

    // rajada de vento (0..1): lenta, com picos ocasionais
    const r0 = 0.5 + 0.5 * onda(t, [0.31, 0.17, 0.53], [0, 1.1, 2.3], [0.55, 0.3, 0.15]);
    const rajada = Math.min(1, Math.pow(Math.max(0, r0), 2.2) + empurrao);

    // movimentos da pipa
    const rot = 0.045 * onda(t, [0.53, 1.27, 2.9], [0, 1.3, 0.4], [0.6, 0.3, 0.1]) + 0.02 * empurrao;
    const yaw = 0.11 * onda(t, [0.45, 0.93], [2.0, 0.7], [0.75, 0.25]);
    const pitch = 0.07 * onda(t, [0.7, 1.6], [0.2, 1.9], [0.7, 0.3]) - 0.05 * rajada;
    const deslX = 9 * Math.sin(t * 0.37 + 0.5) + 3 * Math.sin(t * 1.1) + 6 * empurrao;
    const deslY = -5 * Math.sin(t * 0.61 + 1.0) - 2 * Math.sin(t * 1.9) - 8 * rajada;

    const mf = mapa(sobra, -cursor.x * 10, -cursor.y * 6);
    const mp = mapa(sobra, -cursor.x * 6, -cursor.y * 4);

    gl!.viewport(0, 0, canvasGl.width, canvasGl.height);
    gl!.disable(gl!.BLEND);
    gl!.useProgram(progFundo);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, bufTela);
    gl!.enableVertexAttribArray(aPos);
    gl!.vertexAttribPointer(aPos, 2, gl!.FLOAT, false, 0, 0);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, texFundo);
    gl!.uniform1i(U.f.fundo, 0);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, texMasc);
    gl!.uniform1i(U.f.masc, 1);
    gl!.uniform2f(U.f.vista, vw, vh);
    gl!.uniform2f(U.f.cena, LARG, ALT);
    gl!.uniform3f(U.f.map, mf.k, mf.ox, mf.oy);
    gl!.uniform1f(U.f.t, t);
    gl!.uniform1f(U.f.ext, EXT);
    gl!.uniform2f(U.f.horiz, meta.horizonte[0]!, meta.horizonte[1]!);
    gl!.uniform4f(U.f.praia, meta.praia_norm[0]!, meta.praia_norm[1]!, meta.praia_norm[2]!, meta.praia_norm[3]!);
    gl!.uniform1f(U.f.luz, 0.35 + 0.65 * entrada);
    gl!.uniform1f(U.f.rajada, rajada);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    gl!.disableVertexAttribArray(aPos);

    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA);
    gl!.useProgram(progPipa);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, bufMalha);
    gl!.enableVertexAttribArray(aUv);
    gl!.vertexAttribPointer(aUv, 2, gl!.FLOAT, false, 0, 0);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, texPipa);
    gl!.uniform1i(U.p.pipa, 0);
    gl!.uniform4f(U.p.ret, RET[0], RET[1], RET[2], RET[3]);
    gl!.uniform2f(U.p.pivo, PIVO[0], PIVO[1]);
    gl!.uniform3f(U.p.map, mp.k, mp.ox, mp.oy);
    gl!.uniform2f(U.p.vista, vw, vh);
    gl!.uniform1f(U.p.t, t);
    gl!.uniform1f(U.p.rot, rot);
    gl!.uniform1f(U.p.yaw, yaw);
    gl!.uniform1f(U.p.pitch, pitch);
    gl!.uniform1f(U.p.rajada, rajada);
    gl!.uniform2f(U.p.desl, deslX, deslY);
    gl!.uniform1f(U.p.luz, entrada);
    gl!.drawArrays(gl!.TRIANGLES, 0, totalVerts);
    gl!.disableVertexAttribArray(aUv);

    // ---- camada 2D: linha, vento e areia ----------------------------------
    const c = ctx!;
    c.setTransform(dpr2d, 0, 0, dpr2d, 0, 0);
    c.clearRect(0, 0, vw, vh);

    // ponta da linha na pipa: mesma transformação do shader (sem a ondulação)
    const qx = LINHA_FIM[0] - PIVO[0];
    const qy = LINHA_FIM[1] - PIVO[1];
    let rx = Math.cos(yaw) * qx;
    let rz = -Math.sin(yaw) * qx;
    let ry = Math.cos(pitch) * qy - Math.sin(pitch) * rz;
    rz = Math.sin(pitch) * qy + Math.cos(pitch) * rz;
    const esc = 1600 / (1600 + rz);
    rx *= esc;
    ry *= esc;
    const fx = PIVO[0] + Math.cos(rot) * rx - Math.sin(rot) * ry + deslX;
    const fy = PIVO[1] + Math.sin(rot) * rx + Math.cos(rot) * ry + deslY;
    const ax = LINHA_INICIO[0] * mf.k + mf.ox;
    const ay = LINHA_INICIO[1] * mf.k + mf.oy;
    const bx = fx * mp.k + mp.ox;
    const by = fy * mp.k + mp.oy;
    const barriga = (9 + 9 * (1 - rajada)) * mf.k;
    const mx = (ax + bx) / 2 + barriga * 0.55;
    const my = (ay + by) / 2 + barriga;
    c.lineCap = "round";
    c.strokeStyle = `rgba(238,241,244,${0.82 * entrada})`;
    c.lineWidth = Math.max(0.85, 1.12 * mf.k);
    c.beginPath();
    c.moveTo(ax, ay);
    c.quadraticCurveTo(mx, my, bx, by);
    c.stroke();

    if (!opcoes.reduzido) {
      // riscos de vento (da esquerda para a direita, mais nas rajadas)
      acumRisco += dt * (0.9 + 3.2 * rajada);
      while (acumRisco > 1) {
        acumRisco -= 1;
        if (riscos.length < 14) {
          riscos.push({
            x: -260 - Math.random() * 200,
            y: vh * (0.06 + Math.random() * 0.5),
            comp: 90 + Math.random() * 170,
            vel: 380 + Math.random() * 420,
            alfa: 0.1 + Math.random() * 0.2,
            fase: Math.random() * 6.28,
            vida: 0,
          });
        }
      }
      for (let i = riscos.length - 1; i >= 0; i--) {
        const r = riscos[i]!;
        r.x += r.vel * dt * (0.8 + 0.6 * rajada);
        r.vida += dt;
        if (r.x - r.comp > vw + 40) {
          riscos.splice(i, 1);
          continue;
        }
        const px = r.x - cursor.x * 16;
        const py = r.y + Math.sin(r.vida * 1.7 + r.fase) * 8 - cursor.y * 10;
        const g = c.createLinearGradient(px - r.comp, py, px, py);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.7, `rgba(255,255,255,${r.alfa})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.strokeStyle = g;
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(px - r.comp, py + Math.sin(r.fase) * 4);
        c.bezierCurveTo(px - r.comp * 0.66, py - 7, px - r.comp * 0.33, py + 6, px, py);
        c.stroke();
      }

      // areia levantada nas rajadas, rente ao chão
      acumGrao += dt * 70 * Math.max(0, rajada - 0.35);
      while (acumGrao > 1) {
        acumGrao -= 1;
        if (graos.length < 70) {
          const chao = (meta.praia_norm[3]! + 30) * mf.k + mf.oy;
          graos.push({
            x: -10 + Math.random() * vw * 0.6,
            y: chao + Math.random() * Math.max(10, vh - chao),
            vel: 420 + Math.random() * 520,
            alfa: 0.18 + Math.random() * 0.32,
            r: 0.6 + Math.random() * 1.1,
            fase: Math.random() * 6.28,
          });
        }
      }
      c.fillStyle = "#f6ead0";
      for (let i = graos.length - 1; i >= 0; i--) {
        const g = graos[i]!;
        g.x += g.vel * dt;
        g.y += Math.sin(g.x * 0.02 + g.fase) * 0.6 - 10 * dt;
        if (g.x > vw + 10) {
          graos.splice(i, 1);
          continue;
        }
        c.globalAlpha = g.alfa;
        c.fillRect(g.x - cursor.x * 12, g.y - cursor.y * 8, g.r * 2.4, g.r);
      }
      c.globalAlpha = 1;
    }

    quadro++;
    if (opcoes.reduzido && quadro > 2) return;
    requestAnimationFrame(desenhar);
  }

  const perdido = (e: Event) => {
    e.preventDefault();
    rodando = false;
  };
  canvasGl.addEventListener("webglcontextlost", perdido);
  requestAnimationFrame(desenhar);

  return {
    parar() {
      rodando = false;
      observador.disconnect();
      canvasGl.removeEventListener("webglcontextlost", perdido);
      // não derruba o contexto: o mesmo canvas pode ser reaproveitado (React em modo estrito monta duas vezes)
      gl.deleteTexture(texFundo);
      gl.deleteTexture(texMasc);
      gl.deleteTexture(texPipa);
    },
    apontar(x: number, y: number) {
      mira = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    },
    rajada() {
      empurrao = 0.9;
    },
  };
}
