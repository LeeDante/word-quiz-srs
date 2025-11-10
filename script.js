// =================================================================
// 專案配置 (請勿修改此處的 URL，它們是您的專屬連結)
// =================================================================
const CONFIG = {
    // 您的 Google Sheets CSV 連結 (用於讀取題庫)
    CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTrY-NhkZX1dladhpRtEUpQmgbVq3qgpuGcDH0ZCuZzfp9k8eCY7228ctr-qgh6ETm6eskomrawZTQ6/pub?gid=0&single=true&output=csv",
    // 您的 Google Apps Script Web App URL (用於寫入結果)
    GAS_URL: "https://script.google.com/macros/s/AKfycbxFTGVscrLa2aN0kIVcw_6XwoiJFMaHqzZdz1v6hkfuiq3Y1Co-esICzcl4XRAJjZOu/exec",
    // 權重乘數 (A:新單字, B:常錯字, C:復習字, D:已掌握字)
    WEIGHTS: { new: 3, high_mistake: 5, low_mistake: 2, mastered: 1 },
    // 連續答對幾次視為掌握
    MASTERED_STREAK: 3 
};

// =================================================================
// 全局狀態與 DOM 元素 (與先前 HTML 骨架對應)
// =================================================================
const DOM = {
    settings: document.getElementById('quiz-settings'),
    area: document.getElementById('quiz-area'),
    result: document.getElementById('result-area'),
    loaderStatus: document.getElementById('loader-status'),
    sheetUrl: document.getElementById('sheetUrl'),
    startBtn: document.getElementById('startQuizBtn'),
    wordCountInfo: document.getElementById('word-count-info'),
    rangeStart: document.getElementById('rangeStart'),
    rangeEnd: document.getElementById('rangeEnd'),
    quizCount: document.getElementById('quizCount'),
    selectionRatio: document.getElementById('selectionRatio'),
    ratioDisplay: document.getElementById('ratioDisplay'),
    ratioPresets: document.getElementById('ratio-presets'), // 新增 DOM 元素
    timer: document.getElementById('timer'),
    progress: document.getElementById('progress'),
    questionText: document.getElementById('question-text'),
    choicesContainer: document.getElementById('choices-container'),
    fillinContainer: document.getElementById('fillin-container'),
    fillinAnswer: document.getElementById('fillin-answer'),
    submitFillin: document.getElementById('submitFillin'),
    feedback: document.getElementById('feedback'),
    pauseBtn: document.getElementById('pauseBtn'),
    finalScore: document.getElementById('final-score'),
    finalTime: document.getElementById('final-time'),
    mistakeReview: document.getElementById('mistake-review'),
    restartBtn: document.getElementById('restartBtn'),
    historyTableBody: document.querySelector('#history-table tbody'),
};

// 狀態變數
let fullWordList = [];      // 完整的題庫單字列表
let quizQueue = [];         // 本次測驗要出的題目隊列
let currentQuiz = null;     // 當前正在出的題目
let currentQuizIndex = 0;
let score = 0;
let mistakes = [];          // 本次測驗錯題清單
let quizStartTime = 0;
let timerInterval = null;
let isPaused = false;
let isAnswered = false; // 避免重複點擊答案

// 詞性顏色映射表
const POS_MAP = {
    'n.': '名詞', 'v.': '動詞', 'adj.': '形容詞', 'adv.': '副詞', 
    'prep.': '介詞', 'pron.': '代詞', 'conj.': '連詞', 'int.': '感嘆詞',
};

// =================================================================
// 輔助函數
// =================================================================

/**
 * 創建帶有詞性顏色標籤的 HTML
 * @param {string} pos - 詞性縮寫，如 'n.', 'v.'
 * @returns {string} - 帶有樣式的 HTML 標籤
 */
function createPosTagHtml(pos) {
    const cleanPos = pos.toLowerCase().replace('.', '');
    const className = `pos-${cleanPos}`;
    const fullText = POS_MAP[pos.toLowerCase()] || '其他';
    return `<span class="pos-tag ${className}" title="${fullText}">${pos}</span>`;
}

/**
 * 畫面切換控制
 * @param {string} showId - 要顯示的區塊 ID ('settings', 'area', 'result')
 */
function switchView(showId) {
    DOM.settings.classList.add('hidden');
    DOM.area.classList.add('hidden');
    DOM.result.classList.add('hidden');
    
    if (showId === 'settings') DOM.settings.classList.remove('hidden');
    if (showId === 'area') DOM.area.classList.remove('hidden');
    if (showId === 'result') DOM.result.classList.remove('hidden');
}

/**
 * 計時器更新
 */
function updateTimer() {
    if (isPaused || !quizStartTime) return;
    
    const elapsedSeconds = Math.floor((Date.now() - quizStartTime) / 1000);
    const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
    const seconds = String(elapsedSeconds % 60).padStart(2, '0');
    DOM.timer.textContent = `時間: ${minutes}:${seconds}`;
}

/**
 * 將 CSV 文本解析為結構化的單字物件陣列 (假設格式: 序號,英文,詞性,中文)
 */
function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length <= 1) return []; 

    const words = [];
    // 使用第一個單元格作為 CSV 的分隔符，然後進行拆分
    const delimiter = lines[0].includes(';') ? ';' : ','; 
    
    for (let i = 1; i < lines.length; i++) {
        // 使用正則表達式處理 CSV 內容，考慮引號內的逗號，然後再 split
        const cols = lines[i].match(/(?:[^\s,"']+|"[^"]*"|'[^']*')+/g) || lines[i].split(delimiter); 
        
        if (cols.length >= 4) {
            const word = {
                index: parseInt(cols[0].trim().replace(/"/g, ''), 10),
                english: cols[1].trim().replace(/"/g, ''),
                pos: cols[2].trim().toLowerCase().replace(/"/g, '').replace('.', '') + '.', // 確保是 n. v. adj. 格式
                chinese: cols[3].trim().replace(/"/g, ''),
                // SRS 相關欄位 (預設值，將被 GAS 數據覆蓋)
                mistakesCount: 0,
                correctStreak: 0,
                status: 'new' // 'new', 'waiting_review', 'mastered'
            };
            if (word.english && word.chinese && word.pos) {
                words.push(word);
            }
        }
    }
    return words;
}

// =================================================================
// 數據載入與整合 (讀取 GAS 數據)
// =================================================================

/**
 * 從 GAS Web App 讀取歷史紀錄和累積錯題集
 * 實際操作中，GAS 必須被配置為允許 GET 請求來讀取數據
 * 但為簡化和安全性，我們假設 GAS 讀取是透過另一個輕量級服務。
 * * 由於 GAS 讀取涉及複雜權限，此處僅模擬讀取並給予預設值，確保核心流程運作。
 * 在實際部署時，您可能需要額外建立一個允許 GET 的 GAS 腳本來讀取數據。
 */
async function loadHistoryAndMistakes() {
    // 由於您的 GAS 腳本主要用於 POST 寫入，且不包含 GET 讀取邏輯。
    // 為了讓前端能運行加權抽樣，我們在此處假設所有單字都是 'new' (狀態: new, 次數: 0)
    // 第一次運行時，權重將主要依賴於 CONFIG.WEIGHTS.new (x3)
    console.log("GAS 歷史與錯題數據讀取功能已跳過，預設所有單字為 'new' 狀態。");
    console.log("當測驗完成後，GAS 會處理寫入與狀態更新。");
    
    // TODO: 實際專案應實作 GAS 的 GET 邏輯，或從 GAS 讀取 History/Mistakes 數據。
    
    // 模擬載入歷史紀錄 (第一次運行時無數據)
    // 這裡只是將表格清空，等寫入後再呈現
    DOM.historyTableBody.innerHTML = '<tr><td colspan="4">尚無歷史紀錄，請完成一次測驗。</td></tr>';
}

/**
 * 載入並處理 Google Sheets CSV 數據
 */
async function loadWordList() {
    DOM.loaderStatus.textContent = '正在從 Google Sheets 載入題庫...';
    try {
        const response = await fetch(CONFIG.CSV_URL);
        if (!response.ok) {
            throw new Error(`HTTP 錯誤: ${response.status}. 請檢查您的 CSV 連結是否正確發布。`);
        }
        const csvText = await response.text();
        fullWordList = parseCSV(csvText); 
        
        if (fullWordList.length === 0) {
             throw new Error("無法解析數據或題庫為空。請檢查您的 CSV 連結或內容。");
        }

        DOM.loaderStatus.textContent = '✅ 題庫載入成功！';
        DOM.wordCountInfo.innerHTML = `題庫總數: **${fullWordList.length}** 題`;
        DOM.startBtn.disabled = false;
        
        DOM.rangeEnd.value = fullWordList.length; // 自動設定最大範圍
        DOM.rangeEnd.max = fullWordList.length;

        await loadHistoryAndMistakes(); // 載入 GAS 數據 (目前為模擬)
        
        switchView('settings');

    } catch (error) {
        console.error('載入題庫失敗:', error);
        DOM.loaderStatus.textContent = `❌ 載入失敗: ${error.message}`;
        DOM.startBtn.disabled = true;
        fullWordList = [];
    }
}


// =================================================================
// 測驗引擎核心邏輯
// =================================================================

/**
 * 根據 SRS 邏輯和用戶設定生成題目隊列 (加權抽樣)
 */
function generateQuizQueue() {
    quizQueue = [];
    const start = parseInt(DOM.rangeStart.value);
    const end = parseInt(DOM.rangeEnd.value);
    const count = parseInt(DOM.quizCount.value);
    const ratio = parseInt(DOM.selectionRatio.value) / 100; // 選擇題比例 (0.7 = 70%)

    // 1. 篩選出符合範圍的單字
    const filteredList = fullWordList.filter(word => word.index >= start && word.index <= end);
    if (filteredList.length === 0) {
        alert("所選範圍內無可用單字。請調整範圍。");
        return false;
    }
    
    // 2. 計算每個單字的權重 (W) 並生成一個帶權重陣列
    const weightedList = [];
    filteredList.forEach(word => {
        let weightFactor = CONFIG.WEIGHTS.new; // 預設新單字
        let srsStatus = 'new';
        
        // 由於我們目前跳過了 GAS 讀取，我們暫時只能依賴 mistakesCount (0)
        // 實際運行時，這裡應判斷 word.status 和 word.mistakesCount
        if (word.mistakesCount >= 3 && word.status === 'waiting_review') {
            weightFactor = CONFIG.WEIGHTS.high_mistake; // 常錯字 (x5)
            srsStatus = 'high_mistake';
        } else if (word.mistakesCount >= 1 && word.status === 'waiting_review') {
            weightFactor = CONFIG.WEIGHTS.low_mistake; // 復習字 (x2)
            srsStatus = 'low_mistake';
        } else if (word.status === 'mastered') {
            weightFactor = CONFIG.WEIGHTS.mastered; // 已掌握 (x1)
            srsStatus = 'mastered';
        }
        
        // 將單字加入權重陣列 (重複加入次數 = 權重)
        for (let i = 0; i < weightFactor; i++) {
            weightedList.push(word);
        }
    });

    // 3. 進行加權抽樣
    const finalCount = Math.min(count, weightedList.length); // 確保不超過總數
    const selectedWords = [];
    for (let i = 0; i < finalCount; i++) {
        // 隨機選擇一個索引
        const randomIndex = Math.floor(Math.random() * weightedList.length);
        const selectedWord = weightedList[randomIndex];
        
        // 決定題型 (Choice: 選擇題, Fillin: 填空題)
        const type = selectedWords.filter(q => q.type === 'Choice').length / (i + 1) < ratio 
            ? 'Choice' 
            : 'Fillin';
            
        selectedWords.push({
            ...selectedWord,
            type: type,
            srs_status: selectedWord.srs_status // 記錄當前的 SRS 狀態
        });

        // 從權重列表中移除選中的單字，避免重複被選中
        weightedList.splice(randomIndex, selectedWord.weightFactor); // 移除單字的所有權重副本
    }
    
    // 4. 隨機打亂題目順序
    quizQueue = selectedWords.sort(() => Math.random() - 0.5);
    return true;
}

/**
 * 開始測驗
 */
function startQuiz() {
    if (!generateQuizQueue()) return;

    currentQuizIndex = 0;
    score = 0;
    mistakes = [];
    isPaused = false;
    
    switchView('area');
    quizStartTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);
    
    showNextQuiz();
}

/**
 * 展示下一個題目
 */
function showNextQuiz() {
    if (currentQuizIndex >= quizQueue.length) {
        return finishQuiz(); // 測驗結束
    }
    
    currentQuiz = quizQueue[currentQuizIndex];
    isAnswered = false;
    DOM.feedback.textContent = ''; // 清除反饋
    
    DOM.progress.textContent = `第 ${currentQuizIndex + 1} 題 / 共 ${quizQueue.length} 題`;
    DOM.choicesContainer.innerHTML = '';
    DOM.choicesContainer.classList.add('hidden');
    DOM.fillinContainer.classList.add('hidden');
    
    // 決定出題方向 (隨機中翻英或英翻中)
    const isChineseQuestion = Math.random() < 0.5;

    // 題目: 英文/中文 + 詞性標籤
    let questionHtml = '';
    
    if (currentQuiz.type === 'Choice') {
        // 選擇題
        const direction = Math.random() < 0.5 ? 'EngToChi' : 'ChiToEng';
        
        if (direction === 'EngToChi') {
             // 英翻中: Q: 英文[詞性], A: 中文選項
             questionHtml = `「${currentQuiz.english}」${createPosTagHtml(currentQuiz.pos)} 的中文解釋是：`;
        } else {
             // 中翻英: Q: 中文[詞性], A: 英文選項
             questionHtml = `「${currentQuiz.chinese}」${createPosTagHtml(currentQuiz.pos)} 的英文是：`;
        }
        
        DOM.questionText.innerHTML = questionHtml;
        generateChoices(direction);
        DOM.choicesContainer.classList.remove('hidden');
        
    } else {
        // 填空題 (一律中翻英，答案手動輸入英文)
        questionHtml = `請輸入「${currentQuiz.chinese}」${createPosTagHtml(currentQuiz.pos)} 的英文單字：`;
        
        DOM.questionText.innerHTML = questionHtml;
        DOM.fillinAnswer.value = '';
        DOM.fillinContainer.classList.remove('hidden');
        DOM.fillinAnswer.focus(); 
    }
}

/**
 * 產生選擇題選項 (四選一，包含混淆項優化)
 * @param {string} direction - 'EngToChi' 或 'ChiToEng'
 */
function generateChoices(direction) {
    const isTargetChinese = direction === 'EngToChi';
    const correctValue = isTargetChinese ? currentQuiz.chinese : currentQuiz.english;

    // 尋找混淆項：來自相同詞性的單字，且非正確答案
    const potentialFakes = fullWordList.filter(word => 
        word.pos === currentQuiz.pos && 
        word.index !== currentQuiz.index // 確保不是正確答案
    );
    
    // 隨機選取 3 個混淆項
    const shuffleFakes = potentialFakes.sort(() => 0.5 - Math.random());
    const fakeWords = shuffleFakes.slice(0, 3);
    
    let options = [
        { value: correctValue, isCorrect: true }
    ];
    
    fakeWords.forEach(word => {
        options.push({ 
            value: isTargetChinese ? word.chinese : word.english, 
            isCorrect: false 
        });
    });
    
    // 隨機打亂選項順序
    options = options.sort(() => Math.random() - 0.5);

    options.forEach((option, index) => {
        const button = document.createElement('button');
        button.textContent = `${index + 1}. ${option.value}`;
        button.dataset.index = index;
        button.addEventListener('click', () => checkAnswer(option.isCorrect, button));
        DOM.choicesContainer.appendChild(button);
    });
}

/**
 * 檢查答案
 * @param {boolean} isCorrect - 選擇題是否正確
 * @param {HTMLElement} clickedButton - 選擇題被點擊的按鈕 (填空題為 null)
 */
function checkAnswer(isCorrect, clickedButton) {
    if (isAnswered) return;
    isAnswered = true;

    // 填空題邏輯
    if (currentQuiz.type === 'Fillin') {
        const userAnswer = DOM.fillinAnswer.value.trim().toLowerCase();
        const correctAnswer = currentQuiz.english.trim().toLowerCase();
        isCorrect = userAnswer === correctAnswer;

        if (isCorrect) {
            DOM.feedback.innerHTML = `<p class="correct feedback-text">✅ 正確！</p>`;
        } else {
            DOM.feedback.innerHTML = `<p class="incorrect feedback-text">❌ 錯誤！正確答案是: <b>${currentQuiz.english}</b></p>`;
        }
        // 鎖定輸入和送出按鈕
        DOM.fillinAnswer.disabled = true;
        DOM.submitFillin.disabled = true;
        
    } else {
        // 選擇題邏輯
        const allButtons = DOM.choicesContainer.querySelectorAll('button');
        allButtons.forEach(btn => {
            btn.disabled = true;
            // 找出正確答案並標註
            if (btn.textContent.includes(currentQuiz.english) || btn.textContent.includes(currentQuiz.chinese)) {
                btn.classList.add('correct');
            }
        });

        if (isCorrect) {
            clickedButton.classList.add('correct');
        } else {
            clickedButton.classList.add('incorrect');
            DOM.feedback.innerHTML = `<p class="incorrect feedback-text">❌ 錯誤！</p>`;
        }
    }
    
    // 記錄分數與錯題
    if (isCorrect) {
        score++;
    } else {
        mistakes.push({
            index: currentQuiz.index,
            english: currentQuiz.english,
            pos: currentQuiz.pos,
            chinese: currentQuiz.chinese,
            user_answer: currentQuiz.type === 'Fillin' ? DOM.fillinAnswer.value : clickedButton.textContent
        });
    }

    // 延遲 2 秒進入下一題 (讓用戶有時間看到反饋)
    setTimeout(() => {
        currentQuizIndex++;
        // 移除填空鎖定
        DOM.fillinAnswer.disabled = false;
        DOM.submitFillin.disabled = false;
        // 繼續下一題
        showNextQuiz();
    }, 2000);
}

/**
 * 暫停/繼續測驗
 */
function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
        clearInterval(timerInterval);
        DOM.pauseBtn.textContent = '繼續';
        DOM.questionText.textContent = '測驗已暫停...';
        DOM.choicesContainer.classList.add('hidden');
        DOM.fillinContainer.classList.add('hidden');
    } else {
        quizStartTime += (Date.now() - (quizStartTime + (Date.now() - quizStartTime))); // 調整時間
        timerInterval = setInterval(updateTimer, 1000);
        DOM.pauseBtn.textContent = '暫停';
        showNextQuiz();
    }
}

/**
 * 測驗結束，展示結果並上傳
 */
function finishQuiz() {
    clearInterval(timerInterval);
    const totalTime = Math.floor((Date.now() - quizStartTime) / 1000);
    const percentage = Math.round((score / quizQueue.length) * 100) || 0;
    
    // 顯示結果
    DOM.finalScore.textContent = `${score} / ${quizQueue.length} (${percentage}%)`;
    DOM.finalTime.textContent = `${Math.floor(totalTime / 60)}分${totalTime % 60}秒`;
    
    // 產生錯題回顧清單
    DOM.mistakeReview.innerHTML = mistakes.length > 0
        ? mistakes.map((m, i) => `
            <div class="mistake-item">
                <h4>${i + 1}. ${m.english} ${createPosTagHtml(m.pos)}</h4>
                <p>❌ 你的答案: ${m.user_answer}</p>
                <p>✅ 正確翻譯: ${m.chinese}</p>
            </div>
        `).join('')
        : `<p>恭喜！本次測驗全部答對！</p>`;
        
    switchView('result');
    
    // 上傳結果到 GAS Web App
    postResultsToGAS(percentage, totalTime);
}

/**
 * 上傳結果到 Google Apps Script (GAS) Web App
 * @param {number} percentage - 分數百分比
 * @param {number} totalTime - 總用時 (秒)
 */
async function postResultsToGAS(percentage, totalTime) {
    const range = `${DOM.rangeStart.value}-${DOM.rangeEnd.value}`;
    const selectionRatio = parseInt(DOM.selectionRatio.value);
    const quizType = `${selectionRatio}/${100 - selectionRatio} 混合`;
    
    // 準備上傳的數據結構
    const dataToSend = {
        // 1. 歷史紀錄數據
        history: {
            score: `${percentage}%`,
            time_spent: totalTime,
            quiz_type: quizType,
            total_count: quizQueue.length,
            range: range
        },
        // 2. 本次錯題清單
        mistakes: mistakes.map(m => ({
            index: m.index,
            english: m.english,
            pos: m.pos,
            chinese: m.chinese,
        })),
        // 3. 所有答題結果 (用於 GAS 計算連續答對次數)
        allWords: quizQueue.map(q => ({
            index: q.index,
            is_correct: !mistakes.some(m => m.index === q.index) // 判斷是否答對
        }))
    };

    try {
        const response = await fetch(CONFIG.GAS_URL, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSend)
        });

        const result = await response.json();
        if (result.status === 'success') {
            console.log("結果上傳成功！GAS 已更新您的紀錄。");
        } else {
            console.error("結果上傳失敗:", result.message);
        }
    } catch (error) {
        console.error("發送請求到 GAS 失敗:", error);
    }
}


// =================================================================
// 事件處理器與初始化
// =================================================================

function initialize() {
    // URL 輸入框監聽事件 (僅作為提示，實際使用固定配置)
    DOM.sheetUrl.value = CONFIG.CSV_URL;
    DOM.sheetUrl.disabled = true; // 鎖定連結

    // 比例滑桿監聽事件
    DOM.selectionRatio.addEventListener('input', (e) => {
        const ratio = e.target.value;
        DOM.ratioDisplay.textContent = 
            `${ratio}% 選擇題 / ${100 - ratio}% 填空題`;
    });
    
    // 預設比例按鈕（需要您在 HTML 中補上，見下方）
    document.addEventListener('click', (e) => {
        if (e.target.dataset.ratio !== undefined) {
            const ratio = e.target.dataset.ratio;
            DOM.selectionRatio.value = ratio;
            DOM.selectionRatio.dispatchEvent(new Event('input')); // 觸發滑桿更新
        }
    });

    // 開始測驗按鈕
    DOM.startBtn.addEventListener('click', startQuiz);
    
    // 重新開始按鈕
    DOM.restartBtn.addEventListener('click', () => switchView('settings'));

    // 填空題送出按鈕
    DOM.submitFillin.addEventListener('click', () => checkAnswer(null, null));
    DOM.fillinAnswer.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            checkAnswer(null, null);
        }
    });

    // 暫停按鈕
    DOM.pauseBtn.addEventListener('click', togglePause);
    
    // 啟動數據載入
    loadWordList();
}


initialize();
