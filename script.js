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
    blacks: 0
};

// ==============================================
// 초기화
// ==============================================

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    setupEventListeners();
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
    const edits = editsData[imageName] || { ...defaultAdjustments };
    
    // UI 업데이트
    Object.keys(edits).forEach(key => {
        const slider = document.getElementById(key);
        const valueDisplay = document.getElementById(`${key}Value`);
        
        if (slider && valueDisplay) {
            slider.value = edits[key];
            valueDisplay.textContent = edits[key];
        }
    });
    
    // 편집 인디케이터
    updateEditIndicator();
    
    // 편집 적용
    applyAdjustments();
}

function getCurrentAdjustments() {
    return {
        exposure: parseInt(document.getElementById('exposure').value),
        contrast: parseInt(document.getElementById('contrast').value),
        highlights: parseInt(document.getElementById('highlights').value),
        shadows: parseInt(document.getElementById('shadows').value),
        whites: parseInt(document.getElementById('whites').value),
        blacks: parseInt(document.getElementById('blacks').value)
    };
}

function isDefaultAdjustments(adjustments) {
    return Object.keys(defaultAdjustments).every(
        key => adjustments[key] === defaultAdjustments[key]
    );
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
    
    const imageName = images[currentIndex].name;
    
    // 기본값으로 리셋
    editsData[imageName] = { ...defaultAdjustments };
    
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
