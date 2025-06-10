// Get the canvas and its 2D rendering context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Control Selection Elements ---
const deviceSelectionScreen = document.getElementById('device-selection');
const pcButton = document.getElementById('pc-button');
const mobileButton = document.getElementById('mobile-button');

// --- Joystick Elements ---
const joystickContainer = document.getElementById('joystick-container');
const joystickStick = document.getElementById('joystick-stick');

// --- Constants ---
const FOV = Math.PI / 3;
const HALF_FOV = FOV / 2;
const NUM_RAYS = 150; // Reduced for better mobile performance
const MAX_DEPTH = 20;
const RAY_STEP = 0.05;
const PLAYER_SPEED = 2.0;
const PLAYER_ROT_SPEED = 1.5;

// --- Map ---
const MAP = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1],
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1],
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];
const MAP_WIDTH = MAP[0].length;
const MAP_HEIGHT = MAP.length;

// --- Player State ---
const player = { x: 1.5, y: 1.5, angle: 0 };

// --- Sprites ---
let sprites = [];

// --- Input State ---
const keys = {};
let controlMode = ''; // Will be 'pc' or 'mobile'
const joystick = { active: false, x: 0, y: 0 };
const touchLook = { active: false, id: -1, lastX: 0 };

// --- Game State ---
let muzzleFlashTimer = 0;

// --- Asset Loading ---
const gunSprite = new Image(); gunSprite.src = 'gun.png';
const enemySprite = new Image(); enemySprite.src = 'enemy.png';
let assetsLoaded = 0;
const totalAssets = 2;
gunSprite.onload = enemySprite.onload = () => { assetsLoaded++; };

// --- Main Initialization ---
function initializeGame(mode) {
    controlMode = mode;
    deviceSelectionScreen.style.display = 'none'; // Hide selection screen

    if (assetsLoaded < totalAssets) {
        // Wait until assets are loaded if they aren't already
        let loadCheck = setInterval(() => {
            if (assetsLoaded === totalAssets) {
                clearInterval(loadCheck);
                setup();
                requestAnimationFrame(gameLoop);
            }
        }, 100);
    } else {
        setup();
        requestAnimationFrame(gameLoop);
    }
}

pcButton.addEventListener('click', () => initializeGame('pc'));
mobileButton.addEventListener('click', () => initializeGame('mobile'));

// --- Setup ---
function setup() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    populateEnemies();

    if (controlMode === 'pc') {
        setupPCControls();
    } else if (controlMode === 'mobile') {
        setupMobileControls();
    }
}

// --- PC Controls Setup ---
function setupPCControls() {
    window.addEventListener('keydown', e => keys[e.code] = true);
    window.addEventListener('keyup', e => keys[e.code] = false);

    canvas.addEventListener('click', () => {
        if (document.pointerLockElement !== canvas) {
            canvas.requestPointerLock();
        }
    });
    
    document.addEventListener('mousemove', e => {
        if (document.pointerLockElement === canvas) {
            player.angle += e.movementX * PLAYER_ROT_SPEED * 0.001;
        }
    });

    document.addEventListener('mousedown', e => {
        if (document.pointerLockElement === canvas && e.button === 0) {
            shoot();
        }
    });
}

// --- Mobile Controls Setup ---
function setupMobileControls() {
    joystickContainer.style.display = 'block';
    const joystickBaseRect = joystickContainer.getBoundingClientRect();

    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });

    function handleTouchStart(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const touchX = touch.clientX;
            const touchY = touch.clientY;

            // Check if touch is on joystick
            if (touchX > joystickBaseRect.left && touchX < joystickBaseRect.right &&
                touchY > joystickBaseRect.top && touchY < joystickBaseRect.bottom) {
                joystick.active = true;
                updateJoystick(touchX, touchY);
            } 
            // Check if touch is on the right side of the screen for looking
            else if (touchX > canvas.width / 2 && !touchLook.active) {
                touchLook.active = true;
                touchLook.id = touch.identifier;
                touchLook.lastX = touchX;
            }
            // If it's a tap on the right side, shoot
            else if (touchX > canvas.width / 2) {
                shoot();
            }
        }
    }

    function handleTouchMove(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (joystick.active) {
                updateJoystick(touch.clientX, touch.clientY);
            }
            if (touchLook.active && touch.identifier === touchLook.id) {
                const dx = touch.clientX - touchLook.lastX;
                player.angle += dx * PLAYER_ROT_SPEED * 0.003; // Adjust sensitivity for touch
                touchLook.lastX = touch.clientX;
            }
        }
    }

    function handleTouchEnd(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if(touchLook.active && touch.identifier === touchLook.id) {
                touchLook.active = false;
                touchLook.id = -1;
            }
        }
        // If all touches are gone, reset joystick
        if (e.touches.length === 0) {
            joystick.active = false;
            resetJoystick();
        }
    }

    function updateJoystick(x, y) {
        const stickX = Math.max(0, Math.min(joystickBaseRect.width, x - joystickBaseRect.left));
        const stickY = Math.max(0, Math.min(joystickBaseRect.height, y - joystickBaseRect.top));
        joystickStick.style.left = `${stickX}px`;
        joystickStick.style.top = `${stickY}px`;

        // Convert pixel position to normalized [-1, 1] vector
        joystick.x = (stickX - joystickBaseRect.width / 2) / (joystickBaseRect.width / 2);
        joystick.y = (stickY - joystickBaseRect.height / 2) / (joystickBaseRect.height / 2);
    }
    
    function resetJoystick() {
        joystickStick.style.left = '50%';
        joystickStick.style.top = '50%';
        joystick.x = 0;
        joystick.y = 0;
    }
}

// --- Universal Game Logic (called from game loop) ---
function handleInput(deltaTime) {
    const moveSpeed = PLAYER_SPEED * deltaTime;
    let moveX = 0, moveY = 0;

    // PC Input
    if (controlMode === 'pc') {
        if (keys['KeyW']) moveY = 1;
        if (keys['KeyS']) moveY = -1;
        if (keys['KeyA']) moveX = -1;
        if (keys['KeyD']) moveX = 1;
    } 
    // Mobile Input
    else if (controlMode === 'mobile') {
        moveY = -joystick.y; // Invert Y for forward movement
        moveX = joystick.x;
    }
    
    let dx = (Math.cos(player.angle) * moveY - Math.sin(player.angle) * moveX) * moveSpeed;
    let dy = (Math.sin(player.angle) * moveY + Math.cos(player.angle) * moveX) * moveSpeed;

    const newX = player.x + dx;
    const newY = player.y + dy;

    if (MAP[Math.floor(player.y)][Math.floor(newX)] === 0) player.x = newX;
    if (MAP[Math.floor(newY)][Math.floor(player.x)] === 0) player.y = newY;
}


// --- Functions below are mostly unchanged from the previous version ---

function populateEnemies() {
    // ... (This function is the same as before)
    const ENEMY_DENSITY = 0.2;
    for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (MAP[y][x] === 0 && Math.random() < ENEMY_DENSITY) {
                if(x === Math.floor(player.x) && y === Math.floor(player.y)) continue;
                sprites.push({ x: x + 0.5, y: y + 0.5, image: enemySprite, scale: 0.7 + Math.random() * 0.2, shift: 0.1 + Math.random() * 0.1 });
            }
        }
    }
}

function shoot() {
    // ... (This function is the same as before)
    muzzleFlashTimer = 5;
    sprites.sort((a, b) => b.dist - a.dist);
    for (const sprite of sprites) {
        if (Math.abs(sprite.visible_angle) < 0.1 && sprite.dist > 0.5) {
            sprites = sprites.filter(s => s !== sprite);
            break;
        }
    }
}

function castRays() {
    // ... (This function is the same as before)
    const rays = [];
    const startAngle = player.angle - HALF_FOV;
    const angleStep = FOV / NUM_RAYS;
    for (let i = 0; i < NUM_RAYS; i++) {
        const rayAngle = startAngle + i * angleStep;
        for (let d = 0; d < MAX_DEPTH; d += RAY_STEP) {
            const x = player.x + Math.cos(rayAngle) * d;
            const y = player.y + Math.sin(rayAngle) * d;
            const mapX = Math.floor(x);
            const mapY = Math.floor(y);
            if (mapX < 0 || mapX >= MAP_WIDTH || mapY < 0 || mapY >= MAP_HEIGHT) break;
            if (MAP[mapY][mapX] === 1) {
                let dist = d * Math.cos(player.angle - rayAngle);
                rays.push(dist);
                break;
            }
        }
    }
    return rays;
}

function drawScene(rays, zBuffer) {
    // ... (This function is the same as before)
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height / 2);
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);
    const rayWidth = canvas.width / NUM_RAYS;
    for (let i = 0; i < rays.length; i++) {
        const dist = rays[i];
        if (dist === undefined) continue;
        const wallHeight = Math.min(canvas.height, canvas.height / (dist + 0.001));
        const wallTop = (canvas.height - wallHeight) / 2;
        const colorVal = 255 / (1 + dist * 0.1);
        ctx.fillStyle = `rgb(${colorVal}, ${colorVal}, ${colorVal})`;
        ctx.fillRect(i * rayWidth, wallTop, rayWidth + 1, wallHeight);
        zBuffer[i] = dist;
    }
}

function drawSprites(zBuffer) {
    // ... (This function is the same as before, simplified z-buffer check remains)
    for (const sprite of sprites) {
        const dx = sprite.x - player.x;
        const dy = sprite.y - player.y;
        sprite.dist = Math.sqrt(dx * dx + dy * dy);
        const spriteAngle = Math.atan2(dy, dx);
        let theta = spriteAngle - player.angle;
        if (theta > Math.PI) theta -= 2 * Math.PI;
        if (theta < -Math.PI) theta += 2 * Math.PI;
        sprite.visible_angle = theta;
    }
    sprites.sort((a, b) => b.dist - a.dist);
    for (const sprite of sprites) {
        if (sprite.visible_angle > -HALF_FOV && sprite.visible_angle < HALF_FOV && sprite.dist > 0.5) {
            const screenX = (sprite.visible_angle / HALF_FOV + 1) / 2 * canvas.width;
            const size = Math.min(1000, canvas.height / sprite.dist * sprite.scale);
            const screenY = (canvas.height / 2) - size * (1 - sprite.shift);
            const spriteRayIndex = Math.floor(screenX / (canvas.width / NUM_RAYS));
            if (zBuffer[spriteRayIndex] > sprite.dist) {
                ctx.drawImage(sprite.image, screenX - size / 2, screenY, size, size);
            }
        }
    }
}

function drawHud() {
    // ... (This function is the same as before)
    const gunWidth = canvas.width / 4;
    const gunHeight = gunWidth * (gunSprite.height / gunSprite.width);
    ctx.drawImage(gunSprite, canvas.width / 2 - gunWidth / 2, canvas.height - gunHeight);
    if (muzzleFlashTimer > 0) {
        const flashSize = canvas.width / 12;
        ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2 - flashSize, flashSize / 2, 0, 2 * Math.PI);
        ctx.fill();
        muzzleFlashTimer--;
    }
    ctx.fillStyle = 'red';
    ctx.fillRect(canvas.width / 2 - 2, canvas.height / 2 - 10, 4, 20);
    ctx.fillRect(canvas.width / 2 - 10, canvas.height / 2 - 2, 20, 4);
}

// --- Main Game Loop ---
let lastTime = 0;
function gameLoop(timestamp) {
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    handleInput(deltaTime);
    const zBuffer = new Array(NUM_RAYS).fill(MAX_DEPTH);
    const rays = castRays();
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawScene(rays, zBuffer);
    drawSprites(zBuffer);
    drawHud();

    requestAnimationFrame(gameLoop);
}
