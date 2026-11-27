// Texture alpha carries the ink density. Pale wash, dark strokes, and red ink
// have separate reveal intervals so a new seed can vary the brushwork.
const fragment = `
precision highp float;
uniform sampler2D painting;
uniform vec2 root, fork, tip;
uniform float progress, wipe, seed;
varying vec2 uv;

float grain(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
float stroke(vec2 p, vec2 a, vec2 b, float start, float lengthInTime) {
  vec2 ab = b - a;
  float t = clamp(dot(p-a, ab) / dot(ab, ab), 0., 1.);
  return start + t * lengthInTime + distance(p, a+t*ab) * .85;
}
void main() {
  vec4 ink = texture2D(painting, uv);
  float ripple = .014*sin(uv.x*47.+uv.y*19.+seed) +
                 .009*sin(uv.y*72.+uv.x*33.-seed) +
                 .016*grain(floor(uv*vec2(880.,260.)));
  float along = mix(uv.x, 1.-uv.x, step(.5, fract(seed)));
  float wash = .03 + .24*along + .07*(1.-uv.y);
  float shore = .25 + .24*along + .44*(1.-uv.y);
  float trunk = stroke(uv, root, fork, .31, .15);
  float bough = stroke(uv, fork, tip, .46, .14);
  float charcoal = min(shore, min(trunk,bough)) + .035*sin(seed+uv.x*15.);
  float red = .73 + .13*distance(uv,tip) + .06*sin(uv.x*21.+seed)*sin(uv.y*12.);
  float time = mix(wash, charcoal, smoothstep(.08,.45,ink.a));
  time = mix(time, red, smoothstep(.10,.32,ink.r-ink.g));
  float drawn = smoothstep(time+ripple-.025,time+ripple+.025,progress);
  float erased = smoothstep(along+ripple-.04,along+ripple+.04,wipe);
  float alpha = ink.a * drawn * (1.-erased);
  gl_FragColor = vec4(ink.rgb*alpha,alpha);
}`;

export function landscapeBrush(canvas) {
  const gl = canvas.getContext('webgl', {alpha:true, antialias:false, depth:false, stencil:false});
  if (!gl) return null;
  const program = gl.createProgram();
  for (const [type,source] of [
    [gl.VERTEX_SHADER, 'attribute vec2 point; varying vec2 uv; void main(){uv=vec2(point.x,-point.y)*.5+.5;gl_Position=vec4(point,0.,1.);}'],
    [gl.FRAGMENT_SHADER, fragment],
  ]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader,source);
    gl.compileShader(shader);
    gl.attachShader(program,shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const point = gl.getAttribLocation(program,'point');
  gl.enableVertexAttribArray(point);
  gl.vertexAttribPointer(point,2,gl.FLOAT,false,0,0);
  gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const location = Object.fromEntries(['root','fork','tip','seed','progress','wipe'].map(
    name => [name,gl.getUniformLocation(program,name)]));
  return {
    load(image, path) {
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      for (const [i,name] of ['root','fork','tip'].entries()) gl.uniform2fv(location[name],path[i]);
      gl.uniform1f(location.seed,Math.random()*100);
    },
    draw(progress,wipe) {
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.uniform1f(location.progress,progress);
      gl.uniform1f(location.wipe,wipe);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    },
  };
}
