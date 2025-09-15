const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

// =====================
// 🎛 CONFIGURATION
// =====================

// Projection
let perspectiveFOV = 500;        // projection depth
let modelScale = 300;            // overall model scaling

// Rotation
let dragSensitivity = 0.01;     // rotation speed
let rotationInertia = 0.99;      // friction slowdown

// ===== DOT SETTINGS =====
let dotMinSize = 2;              // clamp minimum size
let dotMaxSize = 15;             // clamp maximum size
let dotMinAlpha = 0.05;           // clamp min transparency (fully transparent)
let dotMaxAlpha = 1;           // clamp max transparency (visible)

let dotSizeDepthEffect = 0.05;   // size grows/shrinks with Z
let dotSizeOffset = -0.3;           // base offset size
let dotAlphaDepthEffect = 0.003;
let dotAlphaOffset = 0.01;          // base offset alpha

let dotCursorEffectRadius = 150; // pixels around cursor
let dotCursorSizeBoost = 10;      // how much cursor enlarges dot
let dotCursorAlphaBoost = 1;    // how much cursor changes alpha
let dotCursorZCutoff = 0;      // ignore cursor effect if dot is further back

// ===== LINE SETTINGS =====
let lineMinAlpha = 0;          // clamp min alpha
let lineMaxAlpha = 1;          // clamp max alpha

let lineAlphaOffset = 0;          // base alpha offset

let lineCursorEffectRadius = 100; // pixels around cursor
let lineCursorAlphaBoost = 1;    // cursor effect on alpha
let lineCursorZCutoff = 0;      // ignore cursor effect if line is further back

// =====================
// STATE VARIABLES
// =====================
let vertices = [];
let faces = [];
let rotationMatrix = identityMatrix();
let velX = 0;
let velY = 0;
let dragging = false;
let lastX, lastY;

// Cursor
let mouseX = canvas.width / 2;
let mouseY = canvas.height / 2;

canvas.addEventListener("mousedown", e => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
window.addEventListener("mouseup", () => dragging = false);
window.addEventListener("mousemove", e => {
  mouseX = e.clientX;
  mouseY = e.clientY;

  if (dragging) {
    velY = (e.clientX - lastX) * -dragSensitivity;
    velX = (e.clientY - lastY) * dragSensitivity;
    lastX = e.clientX;
    lastY = e.clientY;
  }
});

// =====================
// OBJ LOADER
// =====================
async function loadOBJ(path) {
  const text = await fetch(path).then(r => r.text());
  let verts = [];
  let facs = [];

  text.split("\n").forEach(line => {
    line = line.trim();
    if (line.startsWith("v ")) {
      const parts = line.split(/\s+/);
      verts.push([
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3])
      ]);
    } else if (line.startsWith("f ")) {
      const parts = line.split(/\s+/).slice(1);
      facs.push(parts.map(p => parseInt(p.split("/")[0], 10) - 1));
    }
  });

  // Center & scale
  let xs = verts.map(v => v[0]),
      ys = verts.map(v => v[1]),
      zs = verts.map(v => v[2]);

  let centerX = (Math.min(...xs) + Math.max(...xs))/2;
  let centerY = (Math.min(...ys) + Math.max(...ys))/2;
  let centerZ = (Math.min(...zs) + Math.max(...zs))/2;

  let maxSize = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    Math.max(...zs) - Math.min(...zs)
  );

  verts = verts.map(v => [
    ((v[0] - centerX) / maxSize) * modelScale,
    ((v[1] - centerY) / maxSize) * modelScale,
    ((v[2] - centerZ) / maxSize) * modelScale
  ]);

  return { verts, facs };
}

// =====================
// MAIN LOOP
// =====================
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Rotation inertia
  if (Math.abs(velX) > 0.0001 || Math.abs(velY) > 0.0001 + 0.01) {
    const rotX = rotationMatrixX(velX);
    const rotY = rotationMatrixY(velY);
    rotationMatrix = multiplyMatrices(rotY, multiplyMatrices(rotX, rotationMatrix));
    velX *= rotationInertia;
    velY *= rotationInertia;
  }

  // Project vertices
  let projected = [];
  for (let v of vertices) {
    let [x, y, z] = applyMatrix(rotationMatrix, v);
    let scale = perspectiveFOV / (perspectiveFOV + z + 5);
    projected.push([canvas.width/2 + x*scale, canvas.height/2 + y*scale, z]);
  }

  // ---- Draw Faces (Lines) ----
  for (let f of faces) {
    let avgX = f.reduce((sum, idx) => sum + projected[idx][0], 0) / f.length;
    let avgY = f.reduce((sum, idx) => sum + projected[idx][1], 0) / f.length;
    let avgZ = f.reduce((sum, idx) => sum + projected[idx][2], 0) / f.length;

    let dx = avgX - mouseX;
    let dy = avgY - mouseY;
    let dist = Math.sqrt(dx*dx + dy*dy);
    let cursorFactor = Math.min(dist / lineCursorEffectRadius, 1);

    // Base alpha
    let baseAlpha = lineAlphaOffset;

    // Cursor effect (only if within cutoff)
    let cursorEffect = 0;
    if (avgZ < lineCursorZCutoff) {
      cursorEffect = (1 - cursorFactor) * lineCursorAlphaBoost;
    }

    let alpha = baseAlpha + cursorEffect;

    // Clamp alpha
    alpha = Math.min(Math.max(alpha, lineMinAlpha), lineMaxAlpha);

    ctx.strokeStyle = `rgba(0,255,255,${alpha.toFixed(2)})`;
    ctx.beginPath();
    let first = projected[f[0]];
    ctx.moveTo(first[0], first[1]);
    for (let i = 1; i < f.length; i++) {
      let p = projected[f[i]];
      ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // ---- Draw Vertices (Dots) ----
  for (let i = 0; i < projected.length; i++) {
    let p = projected[i];
    let z = -p[2];

    // Base radius & alpha
    let baseRadius = z * dotSizeDepthEffect + dotSizeOffset;
    let baseAlpha = z * dotAlphaDepthEffect + dotAlphaOffset;

    // Cursor influence
    let dx = p[0] - mouseX;
    let dy = p[1] - mouseY;
    let dist = Math.sqrt(dx*dx + dy*dy);
    let cursorFactor = Math.min(dist / dotCursorEffectRadius, 1);

    let cursorSizeEffect = 0;
    let cursorAlphaEffect = 0;
    if (z > dotCursorZCutoff) {
      cursorSizeEffect = (1 - cursorFactor) * dotCursorSizeBoost;
      cursorAlphaEffect = (1 - cursorFactor) * dotCursorAlphaBoost;
    }

    let radius = baseRadius + cursorSizeEffect;
    let alpha = baseAlpha + cursorAlphaEffect;

    // Clamp final values
    radius = Math.min(Math.max(radius, dotMinSize), dotMaxSize);
    alpha = Math.min(Math.max(alpha, dotMinAlpha), dotMaxAlpha);

    ctx.fillStyle = `rgba(0,255,255,${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(p[0], p[1], radius, 0, Math.PI*2);
    ctx.fill();
  }

  requestAnimationFrame(animate);
}

// =====================
// MATRIX HELPERS
// =====================
function identityMatrix(){ return [1,0,0, 0,1,0, 0,0,1]; }
function applyMatrix(m,v){ const [x,y,z]=v; return [m[0]*x+m[1]*y+m[2]*z, m[3]*x+m[4]*y+m[5]*z, m[6]*x+m[7]*y+m[8]*z]; }
function multiplyMatrices(a,b){ let m=[]; for(let r=0;r<3;r++){ for(let c=0;c<3;c++){ m[r*3+c]=a[r*3+0]*b[0*3+c]+a[r*3+1]*b[1*3+c]+a[r*3+2]*b[2*3+c]; } } return m; }
function rotationMatrixX(angle){ const c=Math.cos(angle),s=Math.sin(angle); return [1,0,0,0,c,-s,0,s,c]; }
function rotationMatrixY(angle){ const c=Math.cos(angle),s=Math.sin(angle); return [c,0,s,0,1,0,-s,0,c]; }

// =====================
// START
// =====================
async function loadFirstOBJ() {
  const response = await fetch("center_object/");
  const text = await response.text();

  // extract .obj filenames from HTML
  const matches = [...text.matchAll(/href="([^"]+\.obj)"/g)].map(m => m[1]);

  if (matches.length === 0) throw new Error("No OBJ files found in folder");

  matches.sort();
  return loadOBJ(matches[0]);
}

// ---- Start ----
loadFirstOBJ().then(obj => {
  vertices = obj.verts;
  faces = obj.facs;
  console.log("Loaded OBJ:", vertices.length, "vertices,", faces.length, "faces");
  animate();
});