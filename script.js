// ==============================================
// 전역 변수 및 상태 관리
// ==============================================

let images = []; // 모든 이미지 파일 정보
let currentIndex = -1; // 현재 선택된 이미지 인덱스
let editsData = {}; // 각 이미지의 편집 데이터 저장
let canvas, ctx;
let originalImageData = null;

// 기본 조정 값
const defaultAdjustments = {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    curves: {
        rgb: [[0, 0], [255, 255]],
        r: [[0, 0], [255, 255]],
        g: [[0, 0], [255, 255]],
        b: [[0, 0], [255, 255]]
    }
};

// 톤 곡선 관련 변수
let curveCanvas, curveCtx;
let currentChannel = 'rgb';
let isDraggingPoint = false;
let selectedPointIndex = -1;

// 곡선 보간 모드
const INTERPOLATION_MODE = 'monotone'; // 'monotone' 또는 'catmull-rom'

// 히스토리 관리 (Undo/Redo)
let editHistory = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

// ==============================================
// 초기화
// ==============================================

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // 곡선 캔버스 초기화
    curveCanvas = document.getElementById('curveCanvas');
    curveCtx = curveCanvas.getContext('2d');
    
    setupEventListeners();
    setupCurveEditor();
    loadEditsFromStorage();
}

// ==============================================
// 이벤트 리스너 설정
// ==============================================

function setupEventListeners() {
    // 폴더 열기
    document.getElementById('openFolderBtn').addEventListener('click', () => {
        document.getElementById('folderInput').click();
    });
    
    document.getElementById('folderInput').addEventListener('change', handleFolderSelect);
    
    // 편집 컨트롤
    const sliders = ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'];
    sliders.forEach(slider => {
        const element = document.getElementById(slider);
        element.addEventListener('input', (e) => {
            handleSliderChange(slider, parseInt(e.target.value));
        });
    });
    
    // 버튼 이벤트
    document.getElementById('saveEditsBtn').addEventListener('click', saveCurrentEdits);
    document.getElementById('resetBtn').addEventListener('click', resetCurrentEdits);
    document.getElementById('exportBtn').addEventListener('click', exportCurrentImage);
    
    // 키보드 네비게이션
    document.addEventListener('keydown', handleKeyboardNavigation);
    
    // 썸네일 스트립 네비게이션
    document.getElementById('filmstripPrev').addEventListener('click', () => navigateImage(-1));
    document.getElementById('filmstripNext').addEventListener('click', () => navigateImage(1));
    
    // 곡선 토글
    document.getElementById('toggleCurves').addEventListener('click', toggleCurvesSection);
}

// ==============================================
// 톤 곡선 에디터 설정
// ==============================================

function setupCurveEditor() {
    // 채널 선택 버튼
    document.querySelectorAll('.channel-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentChannel = e.target.dataset.channel;
            drawCurve();
        });
    });
    
    // 곡선 캔버스 이벤트
    curveCanvas.addEventListener('mousedown', onCurveMouseDown);
    curveCanvas.addEventListener('mousemove', onCurveMouseMove);
    curveCanvas.addEventListener('mouseup', onCurveMouseUp);
    curveCanvas.addEventListener('mouseleave', onCurveMouseUp);
    
    // 곡선 리셋
    document.getElementById('resetCurveBtn').addEventListener('click', resetCurve);
    
    // 초기 곡선 그리기
    drawCurve();
}

function toggleCurvesSection() {
    const content = document.getElementById('curvesContent');
    const toggle = document.getElementById('toggleCurves');
    
    content.classList.toggle('collapsed');
    toggle.classList.toggle('collapsed');
}

function drawCurve() {
    const width = curveCanvas.width;
    const height = curveCanvas.height;
    
    // 배경 초기화
    curveCtx.fillStyle = '#2a2a2a';
    curveCtx.fillRect(0, 0, width, height);
    
    // 그리드 그리기
    curveCtx.strokeStyle = '#3a3a3a';
    curveCtx.lineWidth = 1;
    
    // 수직선
    for (let i = 0; i <= 4; i++) {
        const x = (width / 4) * i;
        curveCtx.beginPath();
        curveCtx.moveTo(x, 0);
        curveCtx.lineTo(x, height);
        curveCtx.stroke();
    }
    
    // 수평선
    for (let i = 0; i <= 4; i++) {
        const y = (height / 4) * i;
        curveCtx.beginPath();
        curveCtx.moveTo(0, y);
        curveCtx.lineTo(width, y);
        curveCtx.stroke();
    }
    
    // 대각선 (기준선)
    curveCtx.strokeStyle = '#555';
    curveCtx.lineWidth = 1;
    curveCtx.beginPath();
    curveCtx.moveTo(0, height);
    curveCtx.lineTo(width, 0);
    curveCtx.stroke();
    
    // 현재 곡선 그리기
    if (currentIndex < 0) return;
    
    const imageName = images[currentIndex].name;
    if (!editsData[imageName]) {
        editsData[imageName] = JSON.parse(JSON.stringify(defaultAdjustments));
    }
    
    const points = editsData[imageName].curves[currentChannel];
    
    // 채널에 따른 색상
    let curveColor = '#fff';
    if (currentChannel === 'r') curveColor = '#ff5555';
    if (currentChannel === 'g') curveColor = '#55ff55';
    if (currentChannel === 'b') curveColor = '#5555ff';
    
    // 곡선 그리기 (부드러운 보간)
    curveCtx.strokeStyle = curveColor;
    curveCtx.lineWidth = 2.5;
    curveCtx.lineCap = 'round';
    curveCtx.lineJoin = 'round';
    curveCtx.beginPath();
    
    // 더 부드러운 곡선을 위해 세밀하게 그리기
    for (let px = 0; px < width; px += 0.5) {
        const inputValue = (px / width) * 255;
        const outputValue = interpolateCurve(inputValue, points);
        const py = height - (outputValue / 255) * height;
        
        if (px === 0) {
            curveCtx.moveTo(px, py);
        } else {
            curveCtx.lineTo(px, py);
        }
    }
    curveCtx.stroke();
    
    // 그림자 효과
    curveCtx.shadowColor = curveColor;
    curveCtx.shadowBlur = 8;
    curveCtx.shadowOffsetX = 0;
    curveCtx.shadowOffsetY = 0;
    curveCtx.stroke();
    curveCtx.shadowBlur = 0;
    
    // 포인트 그리기
    points.forEach((point, index) => {
        const x = (point[0] / 255) * width;
        const y = height - (point[1] / 255) * height;
        
        // 외곽선
        curveCtx.strokeStyle = '#1a1a1a';
        curveCtx.lineWidth = 3;
        curveCtx.beginPath();
        curveCtx.arc(x, y, 7, 0, Math.PI * 2);
        curveCtx.stroke();
        
        // 내부 원
        curveCtx.fillStyle = curveColor;
        curveCtx.beginPath();
        curveCtx.arc(x, y, 5, 0, Math.PI * 2);
        curveCtx.fill();
        
        // 선택된 포인트 강조
        if (index === selectedPointIndex) {
            curveCtx.strokeStyle = '#fff';
            curveCtx.lineWidth = 2;
            curveCtx.beginPath();
            curveCtx.arc(x, y, 10, 0, Math.PI * 2);
            curveCtx.stroke();
            
            // 반짝이는 효과
            curveCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            curveCtx.beginPath();
            curveCtx.arc(x, y, 10, 0, Math.PI * 2);
            curveCtx.fill();
        }
    });
}

function interpolateCurve(x, points) {
    points.sort((a, b) => a[0] - b[0]);
    
    if (x <= points[0][0]) return points[0][1];
    if (x >= points[points.length - 1][0]) return points[points.length - 1][1];
    
    if (INTERPOLATION_MODE === 'monotone') {
        return monotoneInterpolate(x, points);
    } else {
        return catmullRomInterpolate(x, points);
    }
}

function catmullRomInterpolate(x, points) {
    // x가 속한 구간 찾기
    let segmentIndex = 0;
    for (let i = 0; i < points.length - 1; i++) {
        if (x >= points[i][0] && x <= points[i + 1][0]) {
            segmentIndex = i;
            break;
        }
    }
    
    // 4개 포인트 구하기 (p0, p1, p2, p3)
    const p1 = points[segmentIndex];
    const p2 = points[segmentIndex + 1];
    
    // 이전 포인트 (없으면 p1 복제)
    const p0 = segmentIndex > 0 ? 
        points[segmentIndex - 1] : 
        [p1[0] - (p2[0] - p1[0]), p1[1]];
    
    // 다음 포인트 (없으면 p2 복제)
    const p3 = segmentIndex < points.length - 2 ? 
        points[segmentIndex + 2] : 
        [p2[0] + (p2[0] - p1[0]), p2[1]];
    
    // t 계산 (0~1 사이)
    const t = (x - p1[0]) / (p2[0] - p1[0]);
    
    // Catmull-Rom 공식
    const t2 = t * t;
    const t3 = t2 * t;
    
    // Y값 계산
    const y = 0.5 * (
        (2 * p1[1]) +
        (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
    );
    
    return y;
}

function monotoneInterpolate(x, points) {
    // Monotone Cubic Interpolation (값이 튀지 않는 부드러운 곡선)
    // Photoshop/Lightroom 스타일
    
    const n = points.length;
    
    // x가 속한 구간 찾기
    let i = 0;
    for (i = 0; i < n - 1; i++) {
        if (x >= points[i][0] && x <= points[i + 1][0]) {
            break;
        }
    }
    
    const x0 = points[i][0];
    const y0 = points[i][1];
    const x1 = points[i + 1][0];
    const y1 = points[i + 1][1];
    
    // 기울기 계산
    const secants = [];
    for (let j = 0; j < n - 1; j++) {
        const dx = points[j + 1][0] - points[j][0];
        const dy = points[j + 1][1] - points[j][1];
        secants.push(dx !== 0 ? dy / dx : 0);
    }
    
    // 탄젠트 계산 (Monotone 조건)
    const tangents = new Array(n);
    tangents[0] = secants[0];
    tangents[n - 1] = secants[n - 2];
    
    for (let j = 1; j < n - 1; j++) {
        const s0 = secants[j - 1];
        const s1 = secants[j];
        
        if (s0 * s1 <= 0) {
            tangents[j] = 0;
        } else {
            tangents[j] = (s0 + s1) / 2;
        }
    }
    
    // Hermite interpolation
    const t = (x - x0) / (x1 - x0);
    const t2 = t * t;
    const t3 = t2 * t;
    
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    
    const m0 = tangents[i] * (x1 - x0);
    const m1 = tangents[i + 1] * (x1 - x0);
    
    const y = h00 * y0 + h10 * m0 + h01 * y1 + h11 * m1;
    
    return y;
}

function onCurveMouseDown(e) {
    if (currentIndex < 0) return;
    
    const rect = curveCanvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 255;
    const y = 255 - ((e.clientY - rect.top) / rect.height) * 255;
    
    const imageName = images[currentIndex].name;
    if (!editsData[imageName]) {
        editsData[imageName] = JSON.parse(JSON.stringify(defaultAdjustments));
    }
    
    const points = editsData[imageName].curves[currentChannel];
    
    // 기존 포인트 클릭 확인
    selectedPointIndex = -1;
    for (let i = 0; i < points.length; i++) {
        const dist = Math.sqrt(
            Math.pow(points[i][0] - x, 2) + 
            Math.pow(points[i][1] - y, 2)
        );
        if (dist < 15) {
            selectedPointIndex = i;
            isDraggingPoint = true;
            break;
        }
    }
    
    // 새 포인트 추가 (첫/마지막 포인트가 아닌 경우만)
    if (selectedPointIndex === -1 && points.length < 10) {
        // 히스토리에 저장
        saveToHistory();
        
        points.push([Math.round(x), Math.round(y)]);
        points.sort((a, b) => a[0] - b[0]);
        selectedPointIndex = points.findIndex(p => p[0] === Math.round(x));
        isDraggingPoint = true;
        
        document.getElementById('saveEditsBtn').disabled = false;
        applyAdjustments();
    }
    
    drawCurve();
}

let dragStarted = false;

function onCurveMouseMove(e) {
    if (!isDraggingPoint || selectedPointIndex === -1 || currentIndex < 0) return;
    
    // 드래그 시작 시 히스토리에 저장
    if (!dragStarted) {
        saveToHistory();
        dragStarted = true;
    }
    
    const rect = curveCanvas.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 255;
    let y = 255 - ((e.clientY - rect.top) / rect.height) * 255;
    
    // 범위 제한
    x = Math.max(0, Math.min(255, x));
    y = Math.max(0, Math.min(255, y));
    
    const imageName = images[currentIndex].name;
    if (!editsData[imageName]) {
        editsData[imageName] = JSON.parse(JSON.stringify(defaultAdjustments));
    }
    
    const points = editsData[imageName].curves[currentChannel];
    
    // 첫 번째와 마지막 포인트는 x축 고정
    if (selectedPointIndex === 0) {
        points[selectedPointIndex] = [0, Math.round(y)];
    } else if (selectedPointIndex === points.length - 1) {
        points[selectedPointIndex] = [255, Math.round(y)];
    } else {
        points[selectedPointIndex] = [Math.round(x), Math.round(y)];
    }
    
    drawCurve();
    applyAdjustments();
}

function onCurveMouseUp(e) {
    if (isDraggingPoint) {
        dragStarted = false;
        
        // 더블 클릭으로 포인트 삭제 (첫/마지막 제외)
        if (e.type === 'dblclick' && selectedPointIndex > 0 && currentIndex >= 0) {
            saveToHistory();
            
            const imageName = images[currentIndex].name;
            if (!editsData[imageName]) {
                editsData[imageName] = JSON.parse(JSON.stringify(defaultAdjustments));
            }
            
            const points = editsData[imageName].curves[currentChannel];
            if (selectedPointIndex < points.length - 1) {
                points.splice(selectedPointIndex, 1);
                applyAdjustments();
                drawCurve();
            }
        }
    }
    
    isDraggingPoint = false;
    selectedPointIndex = -1;
}

function resetCurve() {
    if (currentIndex < 0) return;
    
    saveToHistory();
    
    const imageName = images[currentIndex].name;
    if (!editsData[imageName]) {
        editsData[imageName] = JSON.parse(JSON.stringify(defaultAdjustments));
    }
    
    editsData[imageName].curves[currentChannel] = [[0, 0], [255, 255]];
    
    drawCurve();
    applyAdjustments();
    document.getElementById('saveEditsBtn').disabled = false;
}

// ==============================================
// 폴더 및 이미지 로딩
// ==============================================

async function handleFolderSelect(event) {
    const files = Array.from(event.target.files);
    
    // 이미지 파일만 필터링
    const imageFiles = files.filter(file => 
        file.type.startsWith('image/')
    );
    
    if (imageFiles.length === 0) {
        alert('이미지 파일이 없습니다.');
        return;
    }
    
    // 이미지 정보 저장
    images = imageFiles.map((file, index) => ({
        file,
        name: file.name,
        path: file.webkitRelativePath || file.name,
        index,
        url: null,
        thumbnail: null
    }));
    
    // UI 업데이트
    updateFileList();
    updateImageCount();
    
    // 썸네일 생성 및 첫 번째 이미지 로드
    await generateThumbnails();
    
    if (images.length > 0) {
        selectImage(0);
    }
}

function updateFileList() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';
    
    images.forEach((image, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.dataset.index = index;
        
        // 편집 여부 체크
        const hasEdits = editsData[image.name] && !isDefaultAdjustments(editsData[image.name]);
        if (hasEdits) {
            item.classList.add('edited');
        }
        
        item.innerHTML = `
            <span class="file-icon">🖼️</span>
            <span class="file-name">${image.name}</span>
        `;
        
        item.addEventListener('click', () => selectImage(index));
        fileList.appendChild(item);
    });
}

function updateImageCount() {
    document.getElementById('imageCount').textContent = `${images.length}장`;
}

async function generateThumbnails() {
    const filmstrip = document.getElementById('filmstrip');
    filmstrip.innerHTML = '';
    
    document.getElementById('filmstripSection').style.display = 'flex';
    
    for (let i = 0; i < images.length; i++) {
        const image = images[i];
        
        // 썸네일 생성
        const thumb = document.createElement('div');
        thumb.className = 'filmstrip-thumb';
        thumb.dataset.index = i;
        
        // 편집 여부 체크
        const hasEdits = editsData[image.name] && !isDefaultAdjustments(editsData[image.name]);
        if (hasEdits) {
            thumb.classList.add('edited');
        }
        
        const img = document.createElement('img');
        img.src = URL.createObjectURL(image.file);
        image.thumbnail = img.src;
        
        thumb.appendChild(img);
        thumb.addEventListener('click', () => selectImage(i));
        filmstrip.appendChild(thumb);
    }
}

// ==============================================
// 이미지 선택 및 표시
// ==============================================

async function selectImage(index) {
    if (index < 0 || index >= images.length) return;
    
    currentIndex = index;
    const image = images[index];
    
    // UI 업데이트
    updateActiveStates();
    updateNavigationButtons();
    
    // 이미지 로드
    await loadAndDisplayImage(image);
    
    // 저장된 편집 데이터 로드
    loadEditsForCurrentImage();
    
    // 버튼 활성화
    enableEditControls();
}

function updateActiveStates() {
    // 파일 리스트
    document.querySelectorAll('.file-item').forEach((item, index) => {
        item.classList.toggle('active', index === currentIndex);
    });
    
    // 썸네일 스트립
    document.querySelectorAll('.filmstrip-thumb').forEach((thumb, index) => {
        thumb.classList.toggle('active', index === currentIndex);
    });
    
    // 활성 썸네일로 스크롤
    const activeThumb = document.querySelector('.filmstrip-thumb.active');
    if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

function updateNavigationButtons() {
    document.getElementById('filmstripPrev').disabled = currentIndex === 0;
    document.getElementById('filmstripNext').disabled = currentIndex === images.length - 1;
}

async function loadAndDisplayImage(image) {
    return new Promise((resolve, reject) => {
        // URL 생성 (캐싱)
        if (!image.url) {
            image.url = URL.createObjectURL(image.file);
        }
        
        const img = new Image();
        img.onload = () => {
            displayImageOnCanvas(img, image);
            resolve();
        };
        img.onerror = reject;
        img.src = image.url;
    });
}

function displayImageOnCanvas(img, imageInfo) {
    // 캔버스 크기 조정
    const viewerSection = document.querySelector('.viewer-section');
    const maxWidth = viewerSection.clientWidth - 40;
    const maxHeight = viewerSection.clientHeight - 40;
    
    let width = img.width;
    let height = img.height;
    
    const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
    width *= ratio;
    height *= ratio;
    
    canvas.width = width;
    canvas.height = height;
    
    ctx.drawImage(img, 0, 0, width, height);
    originalImageData = ctx.getImageData(0, 0, width, height);
    
    // Placeholder 숨기기, 캔버스 보이기
    document.getElementById('viewerPlaceholder').style.display = 'none';
    canvas.classList.add('active');
    
    // 이미지 정보 표시
    const imageInfo_elem = document.getElementById('imageInfo');
    document.getElementById('imageName').textContent = imageInfo.name;
    document.getElementById('imageSize').textContent = `${img.width} × ${img.height}`;
    imageInfo_elem.classList.add('active');
    
    // 편집 적용
    applyAdjustments();
}

// ==============================================
// 편집 데이터 관리
// ==============================================

function loadEditsForCurrentImage() {
    if (currentIndex < 0) return;
    
    const imageName = images[currentIndex].name;
    const edits = editsData[imageName] || JSON.parse(JSON.stringify(defaultAdjustments));
    
    // 곡선 데이터 확인
    if (!edits.curves) {
        edits.curves = JSON.parse(JSON.stringify(defaultAdjustments.curves));
    }
    
    // UI 업데이트
    Object.keys(edits).forEach(key => {
        if (key === 'curves') return; // 곡선은 별도 처리
        
        const slider = document.getElementById(key);
        const valueDisplay = document.getElementById(`${key}Value`);
        
        if (slider && valueDisplay) {
            slider.value = edits[key];
            valueDisplay.textContent = edits[key];
        }
    });
    
    // 곡선 그리기
    drawCurve();
    
    // 편집 인디케이터
    updateEditIndicator();
    
    // 편집 적용
    applyAdjustments();
}

function getCurrentAdjustments() {
    if (currentIndex < 0) return JSON.parse(JSON.stringify(defaultAdjustments));
    
    const imageName = images[currentIndex].name;
    const stored = editsData[imageName];
    
    return {
        exposure: parseInt(document.getElementById('exposure').value),
        contrast: parseInt(document.getElementById('contrast').value),
        highlights: parseInt(document.getElementById('highlights').value),
        shadows: parseInt(document.getElementById('shadows').value),
        whites: parseInt(document.getElementById('whites').value),
        blacks: parseInt(document.getElementById('blacks').value),
        curves: stored?.curves ? JSON.parse(JSON.stringify(stored.curves)) : JSON.parse(JSON.stringify(defaultAdjustments.curves))
    };
}

function isDefaultAdjustments(adjustments) {
    // 슬라이더 값 확인
    const sliderKeys = ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'];
    const slidersDefault = sliderKeys.every(
        key => adjustments[key] === defaultAdjustments[key]
    );
    
    // 곡선 확인
    if (!adjustments.curves) return slidersDefault;
    
    const curvesDefault = Object.keys(adjustments.curves).every(channel => {
        const points = adjustments.curves[channel];
        return points.length === 2 && 
               points[0][0] === 0 && points[0][1] === 0 &&
               points[1][0] === 255 && points[1][1] === 255;
    });
    
    return slidersDefault && curvesDefault;
}

function saveCurrentEdits() {
    if (currentIndex < 0) return;
    
    const imageName = images[currentIndex].name;
    const adjustments = getCurrentAdjustments();
    
    editsData[imageName] = adjustments;
    
    // LocalStorage에 저장
    saveEditsToStorage();
    
    // UI 업데이트
    updateFileList();
    generateThumbnails();
    updateEditIndicator();
    
    showNotification('✅ 편집 내용이 저장되었습니다');
}

function resetCurrentEdits() {
    if (currentIndex < 0) return;
    
    // 히스토리에 추가
    saveToHistory();
    
    const imageName = images[currentIndex].name;
    
    // 기본값으로 리셋 (깊은 복사)
    editsData[imageName] = JSON.parse(JSON.stringify(defaultAdjustments));
    
    // UI 업데이트
    loadEditsForCurrentImage();
    
    // LocalStorage 업데이트
    saveEditsToStorage();
    
    // UI 업데이트
    updateFileList();
    generateThumbnails();
    updateEditIndicator();
    
    showNotification('🔄 편집 내용이 초기화되었습니다');
}

function updateEditIndicator() {
    const indicator = document.getElementById('editIndicator');
    const imageName = images[currentIndex]?.name;
    
    if (imageName && editsData[imageName] && !isDefaultAdjustments(editsData[imageName])) {
        indicator.style.display = 'flex';
    } else {
        indicator.style.display = 'none';
    }
}

// ==============================================
// 이미지 처리 (편집 적용)
// ==============================================

function handleSliderChange(slider, value) {
    document.getElementById(`${slider}Value`).textContent = value;
    applyAdjustments();
    
    // 저장 버튼 활성화
    document.getElementById('saveEditsBtn').disabled = false;
}

function applyAdjustments() {
    if (!originalImageData) return;
    
    const adjustments = getCurrentAdjustments();
    
    // 곡선 룩업 테이블 생성 (부드러운 보간)
    const curveLUT = {
        rgb: new Array(256),
        r: new Array(256),
        g: new Array(256),
        b: new Array(256)
    };
    
    for (let channel in curveLUT) {
        for (let i = 0; i < 256; i++) {
            const value = interpolateCurve(i, adjustments.curves[channel]);
            // 범위 제한 후 반올림
            curveLUT[channel][i] = Math.max(0, Math.min(255, Math.round(value)));
        }
    }
    
    // 원본 이미지 데이터 복사
    const imageData = ctx.createImageData(originalImageData);
    const data = imageData.data;
    const originalData = originalImageData.data;
    
    // 각 픽셀 처리
    for (let i = 0; i < data.length; i += 4) {
        let r = originalData[i];
        let g = originalData[i + 1];
        let b = originalData[i + 2];
        
        // 밝기 계산 (휘도)
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        
        // 1. 노출 (Exposure)
        const exposureFactor = 1 + (adjustments.exposure / 100);
        r *= exposureFactor;
        g *= exposureFactor;
        b *= exposureFactor;
        
        // 2. 대비 (Contrast)
        const contrastFactor = (259 * (adjustments.contrast + 255)) / (255 * (259 - adjustments.contrast));
        r = contrastFactor * (r - 128) + 128;
        g = contrastFactor * (g - 128) + 128;
        b = contrastFactor * (b - 128) + 128;
        
        // 3. 밝은 영역 (Highlights)
        if (luminance > 128) {
            const highlightWeight = (luminance - 128) / 127;
            const highlightAdjust = (adjustments.highlights / 100) * highlightWeight * -50;
            r += highlightAdjust;
            g += highlightAdjust;
            b += highlightAdjust;
        }
        
        // 4. 어두운 영역 (Shadows)
        if (luminance < 128) {
            const shadowWeight = (128 - luminance) / 128;
            const shadowAdjust = (adjustments.shadows / 100) * shadowWeight * 50;
            r += shadowAdjust;
            g += shadowAdjust;
            b += shadowAdjust;
        }
        
        // 5. 흰색 계열 (Whites)
        if (luminance > 200) {
            const whiteWeight = (luminance - 200) / 55;
            const whiteAdjust = (adjustments.whites / 100) * whiteWeight * 50;
            r += whiteAdjust;
            g += whiteAdjust;
            b += whiteAdjust;
        }
        
        // 6. 검정 계열 (Blacks)
        if (luminance < 55) {
            const blackWeight = (55 - luminance) / 55;
            const blackAdjust = (adjustments.blacks / 100) * blackWeight * -50;
            r += blackAdjust;
            g += blackAdjust;
            b += blackAdjust;
        }
        
        // 값 제한 (0-255)
        r = Math.max(0, Math.min(255, r));
        g = Math.max(0, Math.min(255, g));
        b = Math.max(0, Math.min(255, b));
        
        // 톤 곡선 적용
        r = curveLUT.rgb[Math.round(r)];
        g = curveLUT.rgb[Math.round(g)];
        b = curveLUT.rgb[Math.round(b)];
        
        // 채널별 곡선 적용
        r = curveLUT.r[Math.round(r)];
        g = curveLUT.g[Math.round(g)];
        b = curveLUT.b[Math.round(b)];
        
        // 최종 값 설정
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
        data[i + 3] = originalData[i + 3];
    }
    
    ctx.putImageData(imageData, 0, 0);
}

// ==============================================
// 내보내기
// ==============================================

function exportCurrentImage() {
    if (currentIndex < 0) return;
    
    const image = images[currentIndex];
    const baseName = image.name.replace(/\.[^/.]+$/, '');
    const ext = image.name.match(/\.[^/.]+$/)?.[0] || '.png';
    
    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `${baseName}_edited${ext}`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        
        showNotification('📤 이미지가 내보내졌습니다');
    }, 'image/png');
}

// ==============================================
// 네비게이션
// ==============================================

function navigateImage(direction) {
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < images.length) {
        selectImage(newIndex);
    }
}

function handleKeyboardNavigation(e) {
    // Ctrl+Z / Cmd+Z (Undo)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
    }
    
    // Ctrl+Shift+Z / Cmd+Shift+Z (Redo)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
    }
    
    // Ctrl+Y / Cmd+Y (Redo)
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
        return;
    }
    
    if (images.length === 0) return;
    
    switch(e.key) {
        case 'ArrowLeft':
            navigateImage(-1);
            break;
        case 'ArrowRight':
            navigateImage(1);
            break;
        case 'Home':
            selectImage(0);
            break;
        case 'End':
            selectImage(images.length - 1);
            break;
    }
}

// ==============================================
// LocalStorage 관리
// ==============================================

function saveEditsToStorage() {
    try {
        localStorage.setItem('flite_edits', JSON.stringify(editsData));
    } catch (e) {
        console.error('편집 데이터 저장 실패:', e);
    }
}

function loadEditsFromStorage() {
    try {
        const stored = localStorage.getItem('flite_edits');
        if (stored) {
            editsData = JSON.parse(stored);
        }
    } catch (e) {
        console.error('편집 데이터 로드 실패:', e);
        editsData = {};
    }
}

// ==============================================
// UI 헬퍼
// ==============================================

function enableEditControls() {
    document.getElementById('resetBtn').disabled = false;
    document.getElementById('exportBtn').disabled = false;
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 70px;
        right: 20px;
        background: #667eea;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        font-size: 0.9em;
        font-weight: 600;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 2500);
}

// ==============================================
// 히스토리 관리 (Undo/Redo)
// ==============================================

function saveToHistory() {
    if (currentIndex < 0) return;
    
    const imageName = images[currentIndex].name;
    const currentState = JSON.parse(JSON.stringify(
        editsData[imageName] || defaultAdjustments
    ));
    
    // 현재 위치 이후의 히스토리 삭제
    editHistory = editHistory.slice(0, historyIndex + 1);
    
    // 새 상태 추가
    editHistory.push({
        imageName,
        state: currentState
    });
    
    // 최대 개수 제한
    if (editHistory.length > MAX_HISTORY) {
        editHistory.shift();
    } else {
        historyIndex++;
    }
}

function undo() {
    if (currentIndex < 0) {
        showNotification('⚠️ 이미지를 먼저 선택하세요');
        return;
    }
    
    if (historyIndex <= 0) {
        showNotification('⚠️ 더 이상 되돌릴 수 없습니다');
        return;
    }
    
    historyIndex--;
    const historyItem = editHistory[historyIndex];
    
    if (historyItem.imageName === images[currentIndex].name) {
        editsData[historyItem.imageName] = JSON.parse(JSON.stringify(historyItem.state));
        loadEditsForCurrentImage();
        saveEditsToStorage();
        updateFileList();
        generateThumbnails();
        updateEditIndicator();
        
        showNotification('↶ 실행 취소');
    } else {
        historyIndex++;
        showNotification('⚠️ 다른 이미지의 히스토리입니다');
    }
}

function redo() {
    if (currentIndex < 0) {
        showNotification('⚠️ 이미지를 먼저 선택하세요');
        return;
    }
    
    if (historyIndex >= editHistory.length - 1) {
        showNotification('⚠️ 더 이상 다시 실행할 수 없습니다');
        return;
    }
    
    historyIndex++;
    const historyItem = editHistory[historyIndex];
    
    if (historyItem.imageName === images[currentIndex].name) {
        editsData[historyItem.imageName] = JSON.parse(JSON.stringify(historyItem.state));
        loadEditsForCurrentImage();
        saveEditsToStorage();
        updateFileList();
        generateThumbnails();
        updateEditIndicator();
        
        showNotification('↷ 다시 실행');
    } else {
        historyIndex--;
        showNotification('⚠️ 다른 이미지의 히스토리입니다');
    }
}

// 애니메이션 스타일
const animationStyle = document.createElement('style');
animationStyle.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(animationStyle);
