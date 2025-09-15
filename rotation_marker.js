// =====================
// Rotation Marker Script
// =====================
(async () => {
  const container = document.getElementById("rotationMarkerContainer");
  if (!container) {
    console.error("Rotation marker container not found!");
    return;
  }

  // Get alphabetically first SVG in folder
  async function getFirstSVG() {
    try {
      const response = await fetch("rotation_marker/");
      if (!response.ok) throw new Error("Failed to fetch rotation_marker folder");
      const html = await response.text();

      const svgFiles = Array.from(html.matchAll(/href="([^"]+\.svg)"/gi), m => m[1]);
      if (!svgFiles.length) throw new Error("No SVG files found in folder");

      svgFiles.sort();
      return svgFiles[0];
    } catch (err) {
      console.error("Failed to load SVG:", err);
      return null;
    }
  }

  const svgFile = await getFirstSVG();
  if (!svgFile) return;

  // Load SVG file
  const svgResponse = await fetch(svgFile);
  const svgText = await svgResponse.text();
  container.innerHTML = svgText;

  const svg = container.querySelector("svg");
  const arrowGroup = svg.querySelector("g");

  if (!svg || !arrowGroup) {
    console.error("SVG or <g> element not found!");
    return;
  }

  // 🔥 Normalize SVG so its shape is centered
  const bbox = arrowGroup.getBBox();
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;

  // Set the viewBox around the shape
  svg.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Place in center of screen
  svg.style.position = "absolute";
  svg.style.top = "50%";
  svg.style.left = "50%";
  svg.style.transform = "translate(-50%, -50%)";
  svg.style.width = "60%";   // Adjust size
  svg.style.height = "60%";
  svg.style.zIndex = "0";

  // Cursor tracking
  let cursorX = window.innerWidth / 2;
  let cursorY = window.innerHeight / 2;
  window.addEventListener("mousemove", e => {
    cursorX = e.clientX;
    cursorY = e.clientY;
  });

  // Rotate toward cursor
  function updateRotation() {
    const screenCenterX = window.innerWidth / 2;
    const screenCenterY = window.innerHeight / 2;

    const dx = cursorX - screenCenterX;
    const dy = cursorY - screenCenterY;
    const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI) + 45;

    // Rotate around true center of the shape
    arrowGroup.setAttribute("transform", `rotate(${angleDeg} ${cx} ${cy})`);

    requestAnimationFrame(updateRotation);
  }

  updateRotation();
})();
