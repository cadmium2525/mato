import { Color, ShaderMaterial, Vector3 } from 'three';

/**
 * 尿（黄色い水）のシェーダー群。高価な透過/屈折の代わりに、
 * フレネル（縁ほど明るく不透明）・鋭い鏡面ハイライト・流れの筋・厚みによる色の濃淡で「液体らしさ」を出す。
 */

const LIGHT_DIR = new Vector3(0.35, 0.9, 0.55).normalize();

const COMMON_UNIFORMS = () => ({
  uTime: { value: 0 },
  uColor: { value: new Color(0xffd83a) },
  uDeep: { value: new Color(0xb87808) },
  uLightDir: { value: LIGHT_DIR.clone() },
  uOpacity: { value: 0.9 },
});

const WATER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uDeep;
  uniform vec3 uLightDir;
  uniform float uOpacity;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vFlow;

  void main() {
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(vViewW);
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 3.0);

    // 流れの筋（尿流に沿ってスクロールするさざなみ）
    float ripple = sin(vUv.y * 160.0 - uTime * 55.0 * vFlow + sin(vUv.x * 6.2831) * 2.5);
    float ripple2 = sin(vUv.y * 67.0 - uTime * 31.0 * vFlow + vUv.x * 12.566);
    float streak = smoothstep(0.55, 1.0, ripple * 0.6 + ripple2 * 0.4) * 0.35 * vFlow;

    // 厚みの見え方: 正面（中心）は光が長く通るので濃い琥珀色、縁は薄く明るい
    vec3 col = mix(uColor, uDeep, pow(ndv, 1.5) * 0.85);
    // 中心に沿った明るい芯（円柱の水が光を集める「コースティクス」風）
    float core = pow(ndv, 8.0) * 0.35;
    col += core * vec3(1.0, 0.92, 0.5);
    col += streak * vec3(1.0, 0.95, 0.75);

    vec3 h = normalize(uLightDir + v);
    float nh = max(dot(n, h), 0.0);
    float spec = pow(nh, 140.0) * 1.6 + pow(nh, 18.0) * 0.18;
    // 蛍光灯の映り込み（上方向の反射を明るく）
    float sky = smoothstep(0.4, 1.0, reflect(-v, n).y) * 0.15;
    col += vec3(1.0, 0.99, 0.94) * (spec + sky) + fres * vec3(1.0, 0.96, 0.78) * 0.55;

    float a = uOpacity * (0.72 + 0.28 * fres + streak) * vAlpha;
    gl_FragColor = vec4(col, clamp(a + spec * 0.6, 0.0, 1.0));
    // 尿は彩度を保ちたいのでトーンマッピングしない（ACES だと白っぽくくすむ）
    #include <colorspace_fragment>
  }
`;

/** 連続した尿流（チューブ）用。aAlpha / aFlow は頂点ごと */
export function createStreamMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: COMMON_UNIFORMS(),
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      attribute float aFlow;
      varying vec3 vNormalW;
      varying vec3 vViewW;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vFlow;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewW = cameraPosition - wp.xyz;
        vUv = uv;
        vAlpha = aAlpha;
        vFlow = aFlow;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
}

/** 水滴・飛沫（InstancedMesh）用 */
export function createDropletMaterial(opacity = 0.85): ShaderMaterial {
  const m = new ShaderMaterial({
    uniforms: COMMON_UNIFORMS(),
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewW;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vFlow;
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vec4 wp = m * vec4(position, 1.0);
        vNormalW = normalize(mat3(m) * normal);
        vViewW = cameraPosition - wp.xyz;
        vUv = uv;
        vAlpha = 1.0;
        vFlow = 0.0;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  m.uniforms.uOpacity.value = opacity;
  return m;
}

/**
 * 着弾の水跡（InstancedMesh の円）。aActive=1 の間は判定円そのものをくっきり表示し、
 * その後は波紋が広がって消える。aAge は 0→1。
 */
export function createSplatMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(0xf5d63c) },
      uEdge: { value: new Color(0xfff6c2) },
    },
    vertexShader: /* glsl */ `
      attribute float aAge;
      attribute float aActive;
      varying vec2 vUv;
      varying float vAge;
      varying float vActive;
      void main() {
        vUv = uv;
        vAge = aAge;
        vActive = aActive;
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uEdge;
      varying vec2 vUv;
      varying float vAge;
      varying float vActive;
      void main() {
        float r = length(vUv * 2.0 - 1.0);
        if (r > 1.0) discard;
        float a;
        vec3 col;
        if (vActive > 0.5) {
          // 判定中: 中は半透明の水、縁（判定半径）は明るい線
          float edge = smoothstep(0.78, 0.95, r) * (1.0 - smoothstep(0.97, 1.0, r));
          a = 0.5 + 0.25 * (1.0 - r) + edge * 0.45;
          col = mix(uColor, uEdge, edge + (1.0 - r) * 0.25);
        } else {
          // 判定後: 広がる波紋と、薄く残る濡れ
          float ring = 1.0 - smoothstep(0.0, 0.12, abs(r - (0.35 + vAge * 0.6)));
          a = (ring * 0.55 + (1.0 - r) * 0.18) * (1.0 - vAge);
          col = mix(uColor, uEdge, ring * 0.6);
        }
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
}

/** 着弾予告マーカー（オレンジ）。白い陶器の上でも見えるよう通常合成 */
export function createWarningMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(0xff5a1f) }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aProgress;
      varying vec2 vUv;
      varying float vP;
      void main() {
        vUv = uv;
        vP = aProgress;
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec2 vUv;
      varying float vP;
      void main() {
        float r = length(vUv * 2.0 - 1.0);
        if (r > 1.0) discard;
        float ring = smoothstep(0.74, 0.82, r) * (1.0 - smoothstep(0.94, 1.0, r));
        // 中心へ向かう斜線ハッチで「ここに落ちる」を示す。着弾直前ほど濃い
        float hatch = step(0.5, fract((vUv.x + vUv.y) * 7.0 - uTime * 2.0)) * 0.22 * vP * (1.0 - smoothstep(0.7, 0.8, r));
        float blink = 0.75 + 0.25 * sin(uTime * 30.0);
        gl_FragColor = vec4(uColor, (ring * 0.95 + hatch) * blink);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

/** 壁を伝って流れ落ちる水の膜。uv.y=1 が着弾点（上）、0 が下端 */
export function createRunoffMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new Color(0xf2c832) },
      uHighlight: { value: new Color(0xfff4c4) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uHighlight;
      varying vec2 vUv;
      void main() {
        float x = vUv.x * 2.0 - 1.0;
        // 下へ行くほど細く、筋に分かれて流れる
        float width = mix(0.35, 1.0, vUv.y);
        float body = exp(-pow(x / width, 2.0) * 3.0);
        float rivulet = 0.6 + 0.4 * sin(x * 9.0 + sin(vUv.y * 7.0) * 1.5);
        float flow = sin(vUv.y * 46.0 + uTime * 26.0 + x * 3.0) * 0.5 + 0.5;
        float a = body * rivulet * smoothstep(0.0, 0.45, vUv.y) * (0.45 + 0.3 * flow);
        vec3 col = mix(uColor, uHighlight, flow * 0.5 * body);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  });
}
