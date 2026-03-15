const container = document.getElementById('canvas-container');
let layers = [];
let activeIndex = -1;
let isDrawing = false;
let currentTool = 'brush';
let isMirror = false;
let startX, startY, snapshot;

let historyStack = [];
let redoStack = [];

function openEditor() {
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('editor-view').style.display = 'flex';
    initCanvas();
}

function initCanvas() {
    container.innerHTML = '';
    layers = [];
    const w = 1000, h = 700;
    container.style.width = w + 'px';
    container.style.height = h + 'px';
    addLayer(true);
    saveToHistory();
}

function addLayer(isBase = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 1000; canvas.height = 700;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if(isBase) { ctx.fillStyle = 'white'; ctx.fillRect(0,0,1000,700); }
    const layer = { canvas, ctx, name: isBase ? "Фон" : "Слой " + layers.length };
    layers.push(layer);
    container.appendChild(canvas);
    setActiveLayer(layers.length - 1);

    // Поддержка мыши и сенсора
    canvas.onmousedown = (e) => start(e);
    canvas.ontouchstart = (e) => { e.preventDefault(); start(e.touches[0]); };
}

window.onmousemove = (e) => move(e);
window.ontouchmove = (e) => { e.preventDefault(); move(e.touches[0]); };
window.onmouseup = () => stop();
window.ontouchend = () => stop();

function setActiveLayer(idx) {
    activeIndex = idx;
    renderLayers();
}

function renderLayers() {
    const list = document.getElementById('layer-list');
    list.innerHTML = '';
    layers.slice().reverse().forEach((l, i) => {
        const realIdx = layers.length - 1 - i;
        const div = document.createElement('div');
        div.className = `layer-box ${realIdx === activeIndex ? 'active' : ''}`;
        div.innerHTML = `<span>${l.name}</span>`;
        div.onclick = () => setActiveLayer(realIdx);
        list.appendChild(div);
    });
}

// Алгоритм Заливки
function floodFill(ctx, x, y, fillColor) {
    const imageData = ctx.getImageData(0, 0, 1000, 700);
    const data = imageData.data;
    const targetPos = (Math.floor(y) * 1000 + Math.floor(x)) * 4;
    const targetR = data[targetPos], targetG = data[targetPos+1], targetB = data[targetPos+2], targetA = data[targetPos+3];
    const fillRGB = hexToRgb(fillColor);
    if (targetR === fillRGB.r && targetG === fillRGB.g && targetB === fillRGB.b && targetA === 255) return;
    const stack = [[Math.floor(x), Math.floor(y)]];
    while (stack.length) {
        const [cx, cy] = stack.pop();
        const pos = (cy * 1000 + cx) * 4;
        if (data[pos] === targetR && data[pos+1] === targetG && data[pos+2] === targetB && data[pos+3] === targetA) {
            data[pos] = fillRGB.r; data[pos+1] = fillRGB.g; data[pos+2] = fillRGB.b; data[pos+3] = 255;
            if (cx > 0) stack.push([cx - 1, cy]);
            if (cx < 999) stack.push([cx + 1, cy]);
            if (cy > 0) stack.push([cx, cy - 1]);
            if (cy < 699) stack.push([cx, cy + 1]);
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

function hexToRgb(hex) {
    const r = parseInt(hex.substring(1, 3), 16), g = parseInt(hex.substring(3, 5), 16), b = parseInt(hex.substring(5, 7), 16);
    return { r, g, b };
}

function start(e) {
    if(activeIndex === -1) return;
    isDrawing = true;
    const rect = layers[activeIndex].canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    const ctx = layers[activeIndex].ctx;
    ctx.lineWidth = document.getElementById('brushSize').value;
    ctx.strokeStyle = document.getElementById('mainColor').value;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    snapshot = ctx.getImageData(0, 0, 1000, 700);

    if(currentTool === 'text') {
        const t = prompt("Текст:");
        if(t) { ctx.font = (ctx.lineWidth * 5) + "px Arial"; ctx.fillText(t, startX, startY); saveToHistory(); }
        isDrawing = false;
    }
    if(currentTool === 'fill') {
        floodFill(ctx, startX, startY, document.getElementById('mainColor').value);
        saveToHistory(); isDrawing = false;
    }
    if(['brush', 'eraser', 'neon', 'spray', 'marker'].includes(currentTool)) {
        ctx.beginPath(); ctx.moveTo(startX, startY);
    }
}

function move(e) {
    if(!isDrawing) return;
    const rect = layers[activeIndex].canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const ctx = layers[activeIndex].ctx;
    
    const drawFunc = (curX, curY, stX, stY) => {
        if(currentTool === 'brush') { ctx.lineTo(curX, curY); ctx.stroke(); }
        if(currentTool === 'eraser') { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.lineTo(curX, curY); ctx.stroke(); ctx.restore(); }
        if(currentTool === 'neon') { ctx.shadowBlur = 15; ctx.shadowColor = ctx.strokeStyle; ctx.lineTo(curX, curY); ctx.stroke(); ctx.shadowBlur = 0; }
        if(currentTool === 'marker') { ctx.save(); ctx.globalAlpha = 0.3; ctx.lineTo(curX, curY); ctx.stroke(); ctx.restore(); }
        if(currentTool === 'spray') { for(let i=0; i<15; i++) ctx.fillRect(curX + Math.random()*30-15, curY + Math.random()*30-15, 1, 1); }
        if(['rect', 'circle', 'line', 'star', 'triangle', 'heart'].includes(currentTool)) {
            ctx.putImageData(snapshot, 0, 0); ctx.beginPath();
            if(currentTool === 'rect') ctx.strokeRect(stX, stY, curX - stX, curY - stY);
            if(currentTool === 'line') { ctx.moveTo(stX, stY); ctx.lineTo(curX, curY); ctx.stroke(); }
            if(currentTool === 'circle') { let r = Math.sqrt(Math.pow(curX - stX, 2) + Math.pow(curY - stY, 2)); ctx.arc(stX, stY, r, 0, Math.PI * 2); ctx.stroke(); }
            if(currentTool === 'triangle') { ctx.moveTo(stX, stY); ctx.lineTo(curX, curY); ctx.lineTo(stX - (curX - stX), curY); ctx.closePath(); ctx.stroke(); }
            if(currentTool === 'star') {
                let r = Math.abs(curX - stX);
                for(let i=0; i<5; i++) {
                    ctx.lineTo(Math.cos((18+i*72)/180*Math.PI)*r + stX, Math.sin((18+i*72)/180*Math.PI)*r + stY);
                    ctx.lineTo(Math.cos((54+i*72)/180*Math.PI)*(r/2) + stX, Math.sin((54+i*72)/180*Math.PI)*(r/2) + stY);
                } ctx.closePath(); ctx.stroke();
            }
            if(currentTool === 'heart') {
                let w = curX - stX, h = curY - stY;
                ctx.moveTo(stX, stY + h/4); ctx.quadraticCurveTo(stX, stY, stX + w/4, stY);
                ctx.quadraticCurveTo(stX + w/2, stY, stX + w/2, stY + h/4); ctx.quadraticCurveTo(stX + w/2, stY, stX + w*3/4, stY);
                ctx.quadraticCurveTo(stX + w, stY, stX + w, stY + h/4); ctx.quadraticCurveTo(stX + w, stY + h/2, stX + w/2, stY + h);
                ctx.quadraticCurveTo(stX, stY + h/2, stX, stY + h/4); ctx.stroke();
            }
        }
    };
    
    drawFunc(x, y, startX, startY);
    if(isMirror) drawFunc(1000 - x, y, 1000 - startX, startY);
}

function stop() { if(isDrawing) { isDrawing = false; saveToHistory(); } }

function saveToHistory() {
    const state = layers.map(l => l.canvas.toDataURL());
    historyStack.push(state);
    if(historyStack.length > 40) historyStack.shift();
    redoStack = [];
}

// Горячие клавиши Ctrl+Z / Ctrl+Y
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.code === 'KeyY') { e.preventDefault(); redo(); }
});

function undo() {
    if(historyStack.length <= 1) return;
    redoStack.push(historyStack.pop());
    applyState(historyStack[historyStack.length - 1]);
}
function redo() {
    if(redoStack.length === 0) return;
    const state = redoStack.pop();
    historyStack.push(state); applyState(state);
}

document.getElementById('undoBtn').onclick = undo;
document.getElementById('redoBtn').onclick = redo;

function applyState(state) {
    state.forEach((data, i) => {
        const img = new Image(); img.src = data;
        img.onload = () => { layers[i].ctx.clearRect(0, 0, 1000, 700); layers[i].ctx.drawImage(img, 0, 0); };
    });
}

function clearLayer() {
    layers[activeIndex].ctx.clearRect(0,0,1000,700);
    if(activeIndex === 0) { layers[activeIndex].ctx.fillStyle='white'; layers[activeIndex].ctx.fillRect(0,0,1000,700); }
    saveToHistory();
}

document.getElementById('mirrorBtn').onclick = () => {
    isMirror = !isMirror;
    document.getElementById('mirrorBtn').innerText = `🪞 Зеркало: ${isMirror?'ВКЛ':'ВЫКЛ'}`;
};

document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); currentTool = btn.dataset.tool;
    };
});

document.getElementById('brushSize').oninput = (e) => document.getElementById('sizeVal').innerText = e.target.value;

function downloadImage() {
    const temp = document.createElement('canvas'); temp.width = 1000; temp.height = 700;
    const tctx = temp.getContext('2d');
    layers.forEach(l => tctx.drawImage(l.canvas, 0, 0));
    const a = document.createElement('a'); a.download = 'nexdraw_art.png'; a.href = temp.toDataURL(); a.click();
}