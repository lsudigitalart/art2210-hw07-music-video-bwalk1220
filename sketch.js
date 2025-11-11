let mySong;
let fft, amp;
let stars = [];
let numStars = 200;
let t = 0;
let anchors = [];
let lasersPerAnchor = 18;
let starG;
let laserG;
// movement modes
let modes = ['sine', 'sweep', 'noise', 'rotate'];
// mode schedule: list of {time: seconds, mode: 'name'} entries.
// timestamps to control when movement changes during the song.
let modeSchedule = [
  { time: 0, mode: 'rotate' },
  { time: 7.6, mode: 'sweep' },
  { time: 28.3, mode: 'noise' },
  { time: 42.2, mode: 'sine' },
  { time: 70.5, mode: 'noise' },
  { time: 84.5, mode: 'rotate'},
  { time: 98, mode: 'sweep' },
  { time: 111, mode: 'sine' },
  { time: 139, mode: 'noise' }
];
let currentMode = 0;
let prevMode = 0;
let modeChangeTime = 0;
let modeTransition = 1.0;

function preload() {
  mySong = loadSound('assets/Aaron_Hibell-2am.mp3');
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
  // sound analysis
  fft = new p5.FFT(0.8, 1024);
  amp = new p5.Amplitude();

  // create starfield
  for (let i = 0; i < numStars; i++) {
    stars.push({
      x: random(-width, width),
      y: random(-height, height),
      z: random(0.2, 1),
      size: random(0.5, 3)
    });
  }

  // create cached star graphic to avoid redrawing every frame
  starG = createGraphics(width, height);
  starG.background(0);
  starG.noStroke();
  starG.push();
  starG.translate(width / 2, height / 2);
  for (let s of stars) {
    let brightness = map(s.z, 0.2, 1, 255, 120);
    starG.fill(brightness, brightness, 255, 200);
    starG.circle(s.x, s.y, s.size);
  }
  starG.pop();

  // create laser buffer (transparent) used to accumulate laser draws for after-image
  laserG = createGraphics(width, height);
  laserG.clear();

  // friendly text until user interacts
  userStartAudio();

function draw() {
  background(0, 30);

  // analyze audio
  let spectrum = fft.analyze();
  let bass = fft.getEnergy('bass');
  let treble = fft.getEnergy('treble');
  let mid = fft.getEnergy('mid');
  let level = amp.getLevel();

  push();
  let starAlpha = map(level, 0, 1, 200, 255);
  tint(255, 255, 255, starAlpha);
  image(starG, 0, 0);
  noTint();
  pop();

  push();
  translate(width / 2, height / 2);

// lasers
  // laser anchors — three at bottom and three mirrored at top
  if (anchors.length === 0) {
    // anchors x positions (relative to translated center)
    let xs = [ -width * 0.3, 0, width * 0.3 ];
    for (let i = 0; i < 3; i++) {
      let ax = xs[i];
      // bottom anchor y (bottom edge relative to translated origin)
      let ayBottom = height / 2;
      // top anchor y (top edge relative to translated origin)
      let ayTop = -height / 2;
  // white lasers
  let colObj = { r: 255, g: 255, b: 255 };
      // create bottom anchor (beams point upward)
  let anchorBottom = { x: ax, y: ayBottom, color: colObj, lasers: [] };
      // create lasers with uniform length and evenly spaced angles for a cleaner laser look
      let baseAngleBottom = -PI / 2; // straight up
      let spread = PI * 0.45; // total spread width
      let uniformLen = min(width, height) * 0.9;
      for (let j = 0; j < lasersPerAnchor; j++) {
        let frac = (lasersPerAnchor === 1) ? 0.5 : j / (lasersPerAnchor - 1);
        let angleBase = baseAngleBottom + (frac - 0.5) * spread;
        anchorBottom.lasers.push({
          angleBase: angleBase,
          lenBase: uniformLen,
          speed: random(0.004, 0.01),
          seed: random(1000),
          phase: random(TWO_PI),
          flick: random(),
        });
      }
      anchors.push(anchorBottom);

      // create top anchor (beams point downward)
  let anchorTop = { x: ax, y: ayTop, color: colObj, lasers: [] };
      // top anchors point down with same uniform properties
      let baseAngleTop = PI / 2; // straight down
      for (let j = 0; j < lasersPerAnchor; j++) {
        let frac = (lasersPerAnchor === 1) ? 0.5 : j / (lasersPerAnchor - 1);
        let angleBase = baseAngleTop + (frac - 0.5) * spread;
        anchorTop.lasers.push({
          angleBase: angleBase,
          lenBase: uniformLen,
          speed: random(0.004, 0.01),
          seed: random(1000),
          phase: random(TWO_PI),
          flick: random(),
        });
      }
      anchors.push(anchorTop);
    }
  }

  // fade the laser buffer slightly to produce after-image trails
  if (laserG) {
    laserG.push();
    laserG.noStroke();
    // small alpha keeps recent beams bright while older ones fade
    laserG.fill(0, 0, 0, 40);
    laserG.rect(0, 0, width, height);
    laserG.pop();
  }

  blendMode(ADD);
  let energies = [bass, mid, treble];
  // compute current mode from scheduled timestamps (falls back to wall clock if audio not playing)
  let songTimeSec = 0;
  if (mySong && mySong.isLoaded() && mySong.isPlaying()) {
    songTimeSec = mySong.currentTime();
  } else {
    songTimeSec = (millis() / 1000.0);
  }
  // find last schedule entry with time <= songTimeSec
  let scheduleIndex = 0;
  for (let k = 0; k < modeSchedule.length; k++) {
    if (songTimeSec >= modeSchedule[k].time) scheduleIndex = k;
    else break;
  }
  function modeNameToIndex(name) {
    let idx = modes.indexOf(name);
    return idx >= 0 ? idx : 0;
  }
  let scheduledModeIdx = modeNameToIndex(modeSchedule[scheduleIndex].mode);
  if (scheduledModeIdx !== currentMode) {
    prevMode = currentMode;
    currentMode = scheduledModeIdx;
    modeChangeTime = millis();
    modeTransition = 0;
  }
  // update transition (0..1 over 1s)
  modeTransition = constrain((millis() - modeChangeTime) / 1000, 0, 1);
  for (let i = 0; i < anchors.length; i++) {
    let a = anchors[i];
    let energy = energies[i % 3];
    // per-anchor tint components
    const ar = a.color.r, ag = a.color.g, ab = a.color.b;
    for (let j = 0; j < a.lasers.length; j++) {
      let L = a.lasers[j];
      // update phase/position
      L.phase += L.speed * (1 + energy / 255 * 2.5);
      // compute mode offsets for prev and current, then blend
      function modeOffset(modeId, L, j) {
        let m = modes[modeId];
        if (m === 'sine') {
          return sin(L.phase + j * 0.2 + t * 0.02) * 0.35; // gentle wobble
        } else if (m === 'sweep') {
          // sweeping wave across lasers based on index
          return sin(t * 0.01 + j * 0.6 + L.seed * 0.001) * 0.8;
        } else if (m === 'noise') {
          return (noise(L.seed + t * 0.001 + j * 0.1) - 0.5) * 1.2;
        } else if (m === 'rotate') {
          // global slow rotation applied to angle
          return sin(t * 0.002 + L.seed * 0.0005) * 1.2 + 0.6 * (j - a.lasers.length/2) / a.lasers.length;
        }
        return 0;
      }

      let offPrev = modeOffset(prevMode, L, j);
      let offCurr = modeOffset(currentMode, L, j);
      let off = lerp(offPrev, offCurr, modeTransition);

      // small index-based spread modifier to keep uniform look
      let idxSpread = (j - (a.lasers.length - 1) / 2) * 0.02;

      let ang = L.angleBase + off * 0.5 + idxSpread;
      // length is longer and more uniform, modulated slightly by energy and mode
      let baseLen = L.lenBase;
      let lenModPrev = (prevMode === currentMode) ? 1 : (1 + 0.05 * sin(L.phase + prevMode));
      let lenModCurr = 1 + 0.2 * (energy / 255);
      let len = baseLen * lerp(lenModPrev, lenModCurr, modeTransition);

      // determine active state (on/off) influenced by energy and flick
      let onProb = map(energy, 0, 255, 0.06, 0.9);
      let active = random() < onProb * (0.6 + L.flick * 0.4);

      // compute end point (remember we translated to center)
      let ax = a.x, ay = a.y;
      let ex = ax + cos(ang) * len;
      let ey = ay + sin(ang) * len;

      // draw layered beam for glow (reduced layers for performance)
      // draw into laser buffer so trails persist between frames
      if (laserG) {
        laserG.push();
        laserG.translate(width / 2, height / 2);
        for (let layer = 0; layer < 3; layer++) {
          let w = map(layer, 0, 2, 0.8, 4);
          let alpha = active ? map(layer, 0, 2, 255, 12) * (0.25 + energy / 255 * 1.6) : map(layer, 0, 2, 12, 2);
          laserG.strokeWeight(w);
          laserG.stroke(ar, ag, ab, alpha);
          if (layer === 2) {
            laserG.drawingContext.shadowBlur = 12 * (active ? 1 + energy / 255 : 0.2);
            laserG.drawingContext.shadowColor = 'white';
          } else {
            laserG.drawingContext.shadowBlur = 0;
          }
          laserG.strokeCap(SQUARE);
          laserG.line(ax, ay, ex, ey);
        }
        laserG.pop();
      } else {
        // fallback to drawing directly if buffer not available
        for (let layer = 0; layer < 3; layer++) {
          let w = map(layer, 0, 2, 0.8, 4);
          let alpha = active ? map(layer, 0, 2, 255, 12) * (0.25 + energy / 255 * 1.6) : map(layer, 0, 2, 12, 2);
          strokeWeight(w);
          stroke(ar, ag, ab, alpha);
          if (layer === 2) {
            drawingContext.shadowBlur = 12 * (active ? 1 + energy / 255 : 0.2);
            drawingContext.shadowColor = 'white';
          } else {
            drawingContext.shadowBlur = 0;
          }
          strokeCap(SQUARE);
          line(ax, ay, ex, ey);
        }
      }
    }
  }
  blendMode(BLEND);

  pop();

  // composite the laser buffer onto the main canvas so trails are visible
  if (laserG) {
    push();
    blendMode(ADD);
    image(laserG, 0, 0);
    blendMode(BLEND);
    pop();
  }

  // Stopwatch UI - show current song time (mm:ss)
  push();
  let songTime = 0;
  if (mySong && mySong.isLoaded()) {
    songTime = mySong.currentTime();
  } else {
    songTime = millis() / 1000.0;
  }
  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '00:00.000';
    let m = floor(sec / 60);
    let s = floor(sec % 60);
    let ms = floor((sec - floor(sec)) * 1000);
    return nf(m, 2) + ':' + nf(s, 2) + '.' + nf(ms, 3);
  }
  let ts = formatTime(songTime);
  textSize(14);
  let padding = 8;
  let tw = textWidth(ts);
  let boxW = tw + padding * 2;
  let boxH = 22;
  let bx = width - boxW - 12;
  let by = 12;
  fill(0, 120);
  noStroke();
  rect(bx, by, boxW, boxH, 6);
  fill(255);
  textAlign(LEFT, CENTER);
  text(ts, bx + padding, by + boxH / 2);
  pop();

  // small HUD text
  push();
  fill(200);
  noStroke();
  textSize(12);
  textAlign(LEFT, BOTTOM);
  text('Click or press SPACE to play / pause', 20, height - 20);
  pop();

  t += 1;
}

function mousePressed() {
  // toggle play/pause on user gesture
  if (mySong && mySong.isLoaded()) {
    if (mySong.isPlaying()) {
      mySong.pause();
    } else {
      mySong.play();
    }
  }
}

function keyPressed() {
  if (key === ' ') {
    mousePressed();
  }
}

function windowResized() {
  // clear anchors so they're recreated at the new size with bottom-edge positions
  anchors = [];
  resizeCanvas(windowWidth, windowHeight);
  // recreate star and laser buffers at new size
  if (starG) {
    starG = createGraphics(width, height);
    starG.background(0);
    starG.noStroke();
    starG.push();
    starG.translate(width / 2, height / 2);
    for (let s of stars) {
      let brightness = map(s.z, 0.2, 1, 255, 120);
      starG.fill(brightness, brightness, 255, 200);
      starG.circle(s.x, s.y, s.size);
    }
    starG.pop();
  }
  if (laserG) {
    laserG = createGraphics(width, height);
    laserG.clear();
  }
}
