// =================================================================
// 核心腳本: 單字測驗機 (最終修正版 - 針對新 HTML 結構編寫)
// 功能: 修正出題邏輯、排版 ID 對齊、GET 模式數據傳輸
// =================================================================

// 配置區塊
const CONFIG = {
    // 您的 Google Sheets CSV 連結 (讀取題庫)
    CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTrY-NhkZX1dladhpRtEUpQmgbVq3qgpuGcDH0ZCuZzfp9k8eCY7228ctr-qgh6ETm6eskomrawZTQ6/pub?gid=0&single=true&output=csv",
    
    // 您的 Google Apps Script Web App URL (寫入結果)
    GAS_URL: "https://script.google.com/macros/s/AKfycby3XRQXc8sbfs0jS8AyLE4Qnf07bwpIbHgo2eP-K2dCIUOKglAyqjxRCsS684Mq67tp/exec", 
    
    DEFAULT_SELECTION_RATIO: 70 
};

// 全域變數
let allWords = [];          // 載入的全部單字
let quizQueue = [];         // 本次測驗的單字隊列
let currentQuizIndex = 0;   // 目前測驗題號
let startTime;              // 記錄測驗開始時間
let mistakes = [];          // 記錄本次答錯的單字
let quizTypeCounts = { selection: 0, fillIn: 0 }; // 紀錄各題型數量
let timerInterval;          // 計時器 ID
let totalSeconds = 0;       // 測驗總時間

// =================================================================
// 初始化與資料載入
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 初始狀態：禁用開始按鈕，顯示載入
    const startBtn = document.getElementById('startQuizBtn');
    if (startBtn) startBtn.disabled = true;

    // 綁定事件
    document.getElementById('startQuizBtn')?.addEventListener('click', startQuiz);
    document.getElementById('restartBtn')?.addEventListener('click', resetToConfig);
    document.getElementById('selectionRatio')?.addEventListener('input', updateRatioDisplay);
    document.getElementById('submitFillin')?.addEventListener('click', checkFillInAnswerWrapper);
    document.getElementById('fillin-answer')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') checkFillInAnswerWrapper();
    });
    
    // 綁定比例預設按鈕 (只需觸發滑桿)
    document.querySelectorAll('#ratio-presets button').forEach(button => {
        button.addEventListener('click', (e) => {
            const ratio = parseInt(e.target.dataset.ratio);
            const slider = document.getElementById('selectionRatio');
            if (slider) {
                slider.value = ratio;
                updateRatioDisplay();
            }
        });
    });

    loadWords();
    updateRatioDisplay(); // 初始顯示比例
});

/**
 * 更新比例滑桿顯示
 */
function updateRatioDisplay() {
    const slider = document.getElementById('selectionRatio');
    const display = document.getElementById('ratioDisplay');
    if (slider && display) {
        const ratio = slider.value;
        const fillIn = 100 - ratio;
        display.textContent = `${ratio}% 選擇題 / ${fillIn}% 填空題`;
    }
}

/**
 * 從 CSV 載入單字數據
 */
async function loadWords() {
    const statusDiv = document.getElementById('loader-status');
    try {
        const response = await fetch(CONFIG.CSV_URL);
        const csvText = await response.text();
        allWords = parseCSV(csvText);
        
        const countInfoDiv = document.getElementById('word-count-info');
        const startBtn = document.getElementById('startQuizBtn');
        const rangeEndInput = document.getElementById('rangeEnd');

        if (allWords.length > 0) {
            statusDiv.textContent = `✅ 題庫載入成功！共 ${allWords.length} 個單字。`;
            if (countInfoDiv) countInfoDiv.innerHTML = `<p>總題庫數: <strong>${allWords.length}</strong> 個單字</p>`;
            
            // 設定範圍上限
            if (rangeEndInput) {
                rangeEndInput.value = allWords.length;
                rangeEndInput.max = allWords.length;
            }
            document.getElementById('quizCount').max = allWords.length;
            document.getElementById('quizCount').value = Math.min(20, allWords.length);

            if (startBtn) startBtn.disabled = false;
            document.getElementById('quiz-settings')?.classList.remove('hidden');
            
        } else {
            statusDiv.textContent = '❌ 載入失敗: 題庫為空。';
        }
    } catch (error) {
        statusDiv.textContent = `❌ 載入失敗: ${error.message}`;
        console.error("載入單字失敗:", error);
    }
}

/**
 * 解析 CSV 字串為單字物件陣列 (P6 修正: 增強魯棒性)
 */
function parseCSV(csv) {
    // 簡單的 CSV 解析，假設結構為 英文, 中文, 詞性, 序號
    const lines = csv.trim().split('\n');
    if (lines.length <= 1) return [];

    const words = [];
    for (let i = 1; i < lines.length; i++) {
        // 使用正則表達式處理逗號分隔和引號內容
        const columns = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
        
        if (columns.length >= 4) {
             // 清理引號
            const clean = (str) => str ? str.trim().replace(/^"|"$/g, '').trim() : '';
            
            words.push({
                index: parseInt(clean(columns[3])) || i,       // 序號 (D欄)
                english: clean(columns[0]) || '',              // 英文 (A欄)
                chinese: clean(columns[1]) || '',              // 中文 (B欄)
                pos: clean(columns[2]) || '',                  // 詞性 (C欄)
                mistakes: 0                                    // 預設錯誤次數
            });
        }
    }
    return words;
}

// =================================================================
// 測驗邏輯
// =================================================================

/**
 * 開始測驗
 */
function startQuiz() {
    const rangeStart = parseInt(document.getElementById('rangeStart')?.value) || 1;
    const rangeEnd = parseInt(document.getElementById('rangeEnd')?.value) || allWords.length;
    const count = parseInt(document.getElementById('quizCount')?.value) || 20;
    const selectionRatio = parseInt(document.getElementById('selectionRatio')?.value) || CONFIG.DEFAULT_SELECTION_RATIO;

    const filteredWords = allWords.filter(word => 
        word.index >= rangeStart && word.index <= rangeEnd
    );

    if (filteredWords.length === 0) {
        alert('所選範圍內沒有單字！');
        return;
    }
    
    // 根據範圍和數量抽取單字
    let selectedWords = filteredWords;
    if (count < filteredWords.length) {
        selectedWords = drawWords(filteredWords, count);
    }

    // 初始化測驗隊列
    quizQueue = selectedWords.map(word => ({
        ...word,
        is_correct: false,
        quiz_type: Math.random() * 100 < selectionRatio ? 'selection' : 'fillIn'
    }));
    
    shuffleArray(quizQueue);

    currentQuizIndex = 0;
    mistakes = [];
    quizTypeCounts = { selection: 0, fillIn: 0 };
    totalSeconds = 0;
    
    // 切換介面
    document.getElementById('quiz-settings')?.classList.add('hidden');
    document.getElementById('quiz-area')?.classList.remove('hidden');

    startTimer();
    showNextQuiz();
}

/**
 * 依據錯誤次數加權抽取單字
 */
function drawWords(words, count) {
    if (words.length <= count) return words;

    const weightedList = [];
    const minMistakes = Math.min(...words.map(w => w.mistakes)); 
    
    words.forEach(word => {
        // 確保至少有 1 的權重
        const weight = 1 + (word.mistakes - minMistakes); 
        for (let i = 0; i < weight; i++) {
            weightedList.push(word);
        }
    });

    // 隨機抽取不重複單字
    const uniqueDrawnWords = new Set();
    const drawnWords = [];
    
    // 使用 Set 確保抽取出的單字物件是唯一的
    while (drawnWords.length < count && weightedList.length > 0) {
        const randomIndex = Math.floor(Math.random() * weightedList.length);
        const selectedWord = weightedList[randomIndex];
        
        // 使用序號作為唯一性標識
        if (!uniqueDrawnWords.has(selectedWord.index)) {
            uniqueDrawnWords.add(selectedWord.index);
            drawnWords.push(selectedWord);
        }
        
        // 為了效率，可以從 weightedList 移除該元素，但在 JS 中遍歷移除較慢，
        // 保持現有邏輯，依靠 Set 篩選即可。
        weightedList.splice(randomIndex, 1);
    }

    // 如果加權列表耗盡但數量不足 (不太可能)，則返回所有已抽取的
    return drawnWords.slice(0, count);
}

/**
 * 混淆陣列順序
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * 顯示下一題
 */
function showNextQuiz() {
    if (currentQuizIndex >= quizQueue.length) {
        finishQuiz();
        return;
    }

    const word = quizQueue[currentQuizIndex];
    
    // 更新進度條
    document.getElementById('progress').textContent = `第 ${currentQuizIndex + 1} 題 / 共 ${quizQueue.length} 題`;
    document.getElementById('question-text').textContent = `(${word.pos}) ${word.chinese}`;
    document.getElementById('feedback').textContent = ''; // 清除回饋

    const choicesContainer = document.getElementById('choices-container');
    const fillinContainer = document.getElementById('fillin-container');

    if (word.quiz_type === 'selection') {
        quizTypeCounts.selection++;
        choicesContainer.classList.remove('hidden');
        fillinContainer.classList.add('hidden');
        renderSelectionQuiz(word, choicesContainer);
    } else {
        quizTypeCounts.fillIn++;
        choicesContainer.classList.add('hidden');
        fillinContainer.classList.remove('hidden');
        renderFillInQuiz(word);
    }
}

/**
 * 渲染選擇題
 */
function renderSelectionQuiz(word, container) {
    const options = generateSelectionOptions(word);
    
    container.innerHTML = options.map(opt => `
        <button class="option-button" data-answer="${opt.english.trim()}" onclick="checkAnswer(this, '${word.english.trim()}')">${opt.english}</button>
    `).join('');
    
    // 為新按鈕添加事件處理，用於防止多重點擊
    container.querySelectorAll('.option-button').forEach(button => {
        button.addEventListener('click', () => {
            container.querySelectorAll('.option-button').forEach(btn => btn.disabled = true);
        });
    });
}

/**
 * 產生選擇題選項 (P5 修正: 確保選項不重複)
 */
function generateSelectionOptions(correctWord) {
    const options = [];
    const optionSet = new Set(); 

    // 1. 加入正確答案
    const cleanCorrectWord = { ...correctWord, english: correctWord.english.trim() };
    options.push(cleanCorrectWord);
    optionSet.add(cleanCorrectWord.english);

    // 2. 過濾所有非正確答案的單字
    const allIncorrectOptions = allWords.filter(w => w.english.trim() !== cleanCorrectWord.english);
    shuffleArray(allIncorrectOptions);

    // 3. 抽取最多 3 個不重複的錯誤答案
    let incorrectCount = 0;
    for (const word of allIncorrectOptions) {
        if (incorrectCount >= 3) break;
        
        const cleanEnglish = word.english.trim();
        
        if (!optionSet.has(cleanEnglish)) {
            options.push({ ...word, english: cleanEnglish });
            optionSet.add(cleanEnglish);
            incorrectCount++;
        }
    }
    
    // 4. 再次混淆選項順序
    shuffleArray(options);
    
    return options;
}

/**
 * 渲染填空題
 */
function renderFillInQuiz(word) {
    const input = document.getElementById('fillin-answer');
    const submitBtn = document.getElementById('submitFillin');
    if (input) {
        input.value = ''; // 清空上次的輸入
        input.disabled = false;
        input.focus();
    }
    if (submitBtn) submitBtn.disabled = false;
}

/**
 * 檢查選擇題答案
 */
function checkAnswer(button, correctAnswer) {
    const selectedAnswer = button.getAttribute('data-answer');
    const isCorrect = selectedAnswer === correctAnswer;
    
    const feedback = document.getElementById('feedback');
    const currentWord = quizQueue[currentQuizIndex];
    
    if (isCorrect) {
        if (feedback) {
            feedback.textContent = '✅ 正確！';
            feedback.className = 'feedback-text correct';
        }
        currentWord.is_correct = true;
        button.classList.add('correct');
    } else {
        if (feedback) {
            feedback.textContent = `❌ 錯誤！正確答案是：${correctAnswer}`;
            feedback.className = 'feedback-text incorrect';
        }
        button.classList.add('wrong');
        
        // 找到正確答案的按鈕並標記
        const correctButton = document.querySelector(`.option-button[data-answer="${correctAnswer}"]`);
        if (correctButton) correctButton.classList.add('correct');
        
        mistakes.push(currentWord);
    }
    
    setTimeout(() => {
        currentQuizIndex++;
        showNextQuiz();
    }, 1500);
}

/**
 * 檢查填空題答案
 */
function checkFillInAnswerWrapper() {
    const input = document.getElementById('fillin-answer');
    if (!input || input.disabled) return;

    const correctAnswer = quizQueue[currentQuizIndex].english.trim();
    const userAnswer = input.value.trim().toLowerCase();
    const cleanCorrectAnswer = correctAnswer.toLowerCase();
    
    input.disabled = true;
    document.getElementById('submitFillin').disabled = true;

    const feedback = document.getElementById('feedback');
    const currentWord = quizQueue[currentQuizIndex];

    if (userAnswer === cleanCorrectAnswer) {
        if (feedback) {
            feedback.textContent = '✅ 正確！';
            feedback.className = 'feedback-text correct';
        }
        currentWord.is_correct = true;
    } else {
        if (feedback) {
            feedback.textContent = `❌ 錯誤！正確答案是：${correctAnswer}`;
            feedback.className = 'feedback-text incorrect';
        }
        input.classList.add('wrong');
        
        mistakes.push(currentWord);
    }
    
    setTimeout(() => {
        currentQuizIndex++;
        showNextQuiz();
    }, 1500);
}

// =================================================================
// 計時與控制
// =================================================================

function startTimer() {
    totalSeconds = 0;
    const timerElement = document.getElementById('timer');
    
    clearInterval(timerInterval); // 清除任何現有的計時器

    timerInterval = setInterval(() => {
        totalSeconds++;
        const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        if (timerElement) timerElement.textContent = `時間: ${minutes}:${seconds}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
}

// =================================================================
// 測驗結束與結果處理
// =================================================================

/**
 * 測驗結束，顯示結果
 */
function finishQuiz() {
    stopTimer();
    
    const timeSpent = totalSeconds;
    const correctCount = quizQueue.filter(q => q.is_correct).length;
    const totalCount = quizQueue.length;
    const percentage = ((correctCount / totalCount) * 100).toFixed(0);
    const quizType = `${quizTypeCounts.selection}/${quizTypeCounts.fillIn}`;
    
    // 顯示結果畫面
    document.getElementById('quiz-area')?.classList.add('hidden');
    document.getElementById('result-area')?.classList.remove('hidden');

    document.getElementById('final-score').textContent = `${correctCount} / ${totalCount} (${percentage}%)`;
    document.getElementById('final-time').textContent = `${timeSpent} 秒`;
    
    // 顯示錯題清單
    const mistakeReview = document.getElementById('mistake-review');
    if (mistakeReview) {
        mistakeReview.innerHTML = mistakes.length > 0
            ? `<ul class="mistake-list">${mistakes.map(m => `<li>${m.english} (${m.pos}) - ${m.chinese}</li>`).join('')}</ul>`
            : '<p>🎉 太棒了！這次測驗您沒有答錯。</p>';
    }
    
    // 將結果 POST 給 GAS (GET 模式)
    postResultsToGAS(percentage, timeSpent);
}

/**
 * 重設到配置畫面
 */
function resetToConfig() {
    document.getElementById('result-area')?.classList.add('hidden');
    document.getElementById('quiz-settings')?.classList.remove('hidden');
}

/**
 * 將結果以 GET 請求發送給 Google Apps Script (GAS) 進行數據寫入
 */
async function postResultsToGAS(percentage, totalTime) {
    const historyData = {
        score: `${percentage}%`,
        time_spent: totalTime,
        quiz_type: `${quizTypeCounts.selection}/${quizTypeCounts.fillIn}`,
        total_count: quizQueue.length,
        range: `${document.getElementById('rangeStart')?.value || 1}-${document.getElementById('rangeEnd')?.value || allWords.length}`
    };

    const simplifiedMistakes = mistakes.map(m => ({
        index: m.index,
        english: m.english,
        pos: m.pos,
        chinese: m.chinese,
    }));
    
    const correctIndices = quizQueue
        .filter(q => q.is_correct)
        .map(q => q.index)
        .join(','); 
    
    const params = new URLSearchParams();
    params.append('action', 'log_result');
    params.append('history', JSON.stringify(historyData));
    params.append('mistakes', JSON.stringify(simplifiedMistakes)); 
    params.append('corrects', correctIndices); 
    
    const fetchUrl = `${CONFIG.GAS_URL}?${params.toString()}`;

    try {
        const response = await fetch(fetchUrl, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache'
        });

        const responseText = await response.text();
        const result = JSON.parse(responseText); 
        
        if (result.status === 'success') {
            console.log("✅ 結果上傳成功 (GET 模式)！");
            // 這裡可以加入刷新歷史表格的邏輯，但需要 GAS 增加讀取歷史數據的功能。
        } else {
            console.error("❌ 結果上傳失敗 (GAS Error):", result.message);
        }
    } catch (error) {
        console.error("❌ 發送請求到 GAS 失敗:", error);
    }
}