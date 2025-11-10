// =================================================================
// 核心腳本: 單字測驗機 (包含所有功能和 CORS 優化)
// =================================================================

// 配置區塊：請替換您的專案連結
const CONFIG = {
    // 您的 Google Sheets CSV 連結 (讀取題庫)
    CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTrY-NhkZX1dladhpRtEUpQmgbVq3qgpuGcDH0ZCuZzfp9k8eCY7228ctr-qgh6ETm6eskomrawZTQ6/pub?gid=0&single=true&output=csv", 
    
    // 您的 Google Apps Script Web App URL (寫入結果)
    GAS_URL: "https://script.google.com/macros/s/AKfycby5Bgo389yxQXMiKDfHncaFT86LIJPJiIaqTKpHbYt0hIKVU9dq7KqxwhepFbRoXzVr/exec", 
    
    // 選擇題和填空題的預設比例 (0 到 100)
    DEFAULT_SELECTION_RATIO: 70 
};

// 全域變數
let allWords = [];          // 載入的全部單字
let quizQueue = [];         // 本次測驗的單字隊列
let currentQuizIndex = 0;   // 目前測驗題號
let startTime;              // 記錄測驗開始時間
let mistakes = [];          // 記錄本次答錯的單字
let quizTypeCounts = {      // 紀錄各題型數量
    selection: 0,
    fillIn: 0
};

// =================================================================
// 初始化與資料載入
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 設置預設比例
    document.getElementById('selectionRatio').value = CONFIG.DEFAULT_SELECTION_RATIO;
    
    // 綁定比例按鈕事件
    document.getElementById('ratio70').addEventListener('click', () => setRatio(70));
    document.getElementById('ratio50').addEventListener('click', () => setRatio(50));
    document.getElementById('ratio10').addEventListener('click', () => setRatio(10));
    
    // 綁定開始測驗按鈕
    document.getElementById('startQuiz').addEventListener('click', startQuiz);
    
    loadWords();
    
    // 初始狀態顯示
    document.getElementById('status').textContent = '載入中...';
});

/**
 * 設置選擇題比例
 */
function setRatio(ratio) {
    document.getElementById('selectionRatio').value = ratio;
}

/**
 * 從 Google Sheets CSV 載入單字數據
 */
async function loadWords() {
    try {
        const response = await fetch(CONFIG.CSV_URL);
        const csvText = await response.text();
        allWords = parseCSV(csvText);
        
        if (allWords.length > 0) {
            document.getElementById('status').textContent = `✅ 題庫載入成功！共 ${allWords.length} 個單字。`;
            document.getElementById('wordCount').max = allWords.length;
            document.getElementById('wordCount').value = Math.min(20, allWords.length);
            
            // 設置範圍上限
            document.getElementById('rangeEnd').value = allWords.length;
            document.getElementById('rangeEnd').max = allWords.length;

            // 這裡原本應該載入 GAS 的歷史與錯題數據，但已跳過。
            document.getElementById('rangeStart').placeholder = '1';
            document.getElementById('rangeEnd').placeholder = allWords.length;
            console.log("GAS 歷史與錯題數據讀取功能已跳過，預設所有單字為 'new' 狀態。");
            console.log("當測驗完成後，GAS 會處理寫入與狀態更新。");
            
        } else {
            document.getElementById('status').textContent = '❌ 載入失敗: 題庫為空。';
        }
    } catch (error) {
        document.getElementById('status').textContent = `❌ 載入失敗: ${error.message}`;
        console.error("載入單字失敗:", error);
    }
}

/**
 * 解析 CSV 字串為單字物件陣列
 * 欄位: 英文, 中文, 詞性, 序號
 */
function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    if (lines.length <= 1) return [];

    const words = [];
    // 忽略第一行的標題
    for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(',').map(col => col.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        
        // 確保至少有四欄
        if (columns.length >= 4) {
            words.push({
                index: parseInt(columns[3]) || i, // 序號 (D欄)
                english: columns[0] || '',       // 英文 (A欄)
                chinese: columns[1] || '',       // 中文 (B欄)
                pos: columns[2] || '',           // 詞性 (C欄)
                status: 'new',                   // 預設狀態
                mistakes: 0                      // 預設錯誤次數
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
    const rangeStart = parseInt(document.getElementById('rangeStart').value) || 1;
    const rangeEnd = parseInt(document.getElementById('rangeEnd').value) || allWords.length;
    const count = parseInt(document.getElementById('wordCount').value);
    const selectionRatio = parseInt(document.getElementById('selectionRatio').value);

    if (allWords.length === 0) {
        alert('題庫尚未載入成功，請稍候或檢查 CSV 連結。');
        return;
    }

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
    
    // 混淆題序
    shuffleArray(quizQueue);

    currentQuizIndex = 0;
    mistakes = [];
    quizTypeCounts = { selection: 0, fillIn: 0 };
    startTime = new Date();
    
    // 切換到測驗介面
    document.getElementById('configScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('resultsScreen').classList.add('hidden');

    showNextQuiz();
}

/**
 * 依據錯誤次數加權抽取單字
 */
function drawWords(words, count) {
    // 由於我們跳過了從 GAS 讀取狀態，所有 mistakes 均為 0
    // 此處暫時使用簡單的隨機抽取
    return shuffleArray([...words]).slice(0, count);
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

    const quizContainer = document.getElementById('quizContainer');
    const word = quizQueue[currentQuizIndex];
    
    document.getElementById('quizCounter').textContent = `${currentQuizIndex + 1} / ${quizQueue.length}`;
    quizContainer.innerHTML = ''; // 清空上一題內容

    if (word.quiz_type === 'selection') {
        quizTypeCounts.selection++;
        renderSelectionQuiz(word, quizContainer);
    } else {
        quizTypeCounts.fillIn++;
        renderFillInQuiz(word, quizContainer);
    }
}

/**
 * 渲染選擇題
 */
function renderSelectionQuiz(word, container) {
    const question = ` (${word.pos}) ${word.chinese}`;
    const options = generateSelectionOptions(word);

    container.innerHTML = `
        <div class="quiz-box selection-quiz">
            <p class="quiz-question">${question}</p>
            <div id="optionsContainer" class="options-container">
                ${options.map((opt, index) => `
                    <button class="option-button" data-answer="${opt.english}" onclick="checkAnswer(this, '${word.english}')">${opt.english}</button>
                `).join('')}
            </div>
            <p id="feedback" class="feedback"></p>
        </div>
    `;
}

/**
 * 產生選擇題選項
 */
function generateSelectionOptions(correctWord) {
    const allOptions = allWords.filter(w => w.english !== correctWord.english);
    shuffleArray(allOptions);

    // 選擇最多 3 個錯誤答案
    const incorrectOptions = allOptions.slice(0, Math.min(3, allOptions.length));
    
    // 合併正確答案和錯誤答案
    const options = [...incorrectOptions, correctWord];
    
    // 再次混淆選項順序
    shuffleArray(options);
    
    return options;
}

/**
 * 渲染填空題
 */
function renderFillInQuiz(word, container) {
    const question = ` (${word.pos}) ${word.chinese}`;

    container.innerHTML = `
        <div class="quiz-box fill-in-quiz">
            <p class="quiz-question">${question}</p>
            <input type="text" id="fillInInput" class="fill-in-input" placeholder="請輸入英文單字" onkeydown="if(event.key === 'Enter') checkFillInAnswer('${word.english}')">
            <button class="submit-button" onclick="checkFillInAnswer('${word.english}')">檢查</button>
            <p id="feedback" class="feedback"></p>
        </div>
    `;
    document.getElementById('fillInInput').focus();
}

/**
 * 檢查選擇題答案
 */
function checkAnswer(button, correctAnswer) {
    const selectedAnswer = button.getAttribute('data-answer');
    const isCorrect = selectedAnswer === correctAnswer;
    
    const feedback = document.getElementById('feedback');
    const currentWord = quizQueue[currentQuizIndex];
    
    // 禁用所有按鈕
    document.querySelectorAll('.option-button').forEach(btn => btn.disabled = true);
    
    if (isCorrect) {
        feedback.textContent = '✅ 正確！';
        feedback.className = 'feedback correct';
        currentWord.is_correct = true;
    } else {
        feedback.textContent = `❌ 錯誤！正確答案是：${correctAnswer}`;
        feedback.className = 'feedback incorrect';
        button.classList.add('wrong');
        
        // 找到正確答案的按鈕並標記
        document.querySelector(`.option-button[data-answer="${correctAnswer}"]`).classList.add('correct');
        
        mistakes.push(currentWord);
    }
    
    // 延遲後顯示下一題
    setTimeout(() => {
        currentQuizIndex++;
        showNextQuiz();
    }, 1500);
}

/**
 * 檢查填空題答案
 */
function checkFillInAnswer(correctAnswer) {
    const input = document.getElementById('fillInInput');
    const feedback = document.getElementById('feedback');
    const currentWord = quizQueue[currentQuizIndex];
    
    // 清理和標準化輸入
    const userAnswer = input.value.trim().toLowerCase();
    const cleanCorrectAnswer = correctAnswer.trim().toLowerCase();
    
    input.disabled = true;
    document.querySelector('.submit-button').disabled = true;

    if (userAnswer === cleanCorrectAnswer) {
        feedback.textContent = '✅ 正確！';
        feedback.className = 'feedback correct';
        currentWord.is_correct = true;
    } else {
        feedback.textContent = `❌ 錯誤！正確答案是：${correctAnswer}`;
        feedback.className = 'feedback incorrect';
        input.classList.add('wrong');
        
        mistakes.push(currentWord);
    }
    
    // 延遲後顯示下一題
    setTimeout(() => {
        currentQuizIndex++;
        showNextQuiz();
    }, 1500);
}

// =================================================================
// 測驗結束與結果處理
// =================================================================

/**
 * 測驗結束，顯示結果
 */
function finishQuiz() {
    const endTime = new Date();
    const timeSpent = ((endTime - startTime) / 1000).toFixed(1); // 秒
    const correctCount = quizQueue.filter(q => q.is_correct).length;
    const totalCount = quizQueue.length;
    const percentage = ((correctCount / totalCount) * 100).toFixed(0);
    const quizType = `${quizTypeCounts.selection}/${quizTypeCounts.fillIn}`;
    
    // 顯示結果
    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultsScreen').classList.remove('hidden');

    document.getElementById('finalScore').textContent = `${correctCount} / ${totalCount} (${percentage}%)`;
    document.getElementById('finalTime').textContent = `${timeSpent} 秒`;
    document.getElementById('finalType').textContent = `選擇題/填空題: ${quizType}`;
    
    // 顯示錯題清單
    const mistakeList = document.getElementById('mistakeList');
    mistakeList.innerHTML = mistakes.length > 0
        ? mistakes.map(m => `<li>${m.english} (${m.pos}) - ${m.chinese}</li>`).join('')
        : '<li>太棒了！這次測驗您沒有答錯。</li>';

    // 重新開始按鈕
    document.getElementById('restartQuiz').addEventListener('click', () => {
        document.getElementById('resultsScreen').classList.add('hidden');
        document.getElementById('configScreen').classList.remove('hidden');
    }, { once: true });
    
    // 將結果 POST 給 GAS
    postResultsToGAS(percentage, timeSpent);
}

/**
 * 將結果 POST 給 Google Apps Script (GAS) 進行數據寫入與更新
 * *** 採用 CORS 優化版本 (移除 Content-Type 標頭以避免預檢失敗) ***
 */
async function postResultsToGAS(percentage, totalTime) {
    const historyData = {
        score: `${percentage}%`,
        time_spent: totalTime,
        quiz_type: `${quizTypeCounts.selection}/${quizTypeCounts.fillIn}`,
        total_count: quizQueue.length,
        range: `${document.getElementById('rangeStart').value || 1}-${document.getElementById('rangeEnd').value || allWords.length}`
    };

    const dataToSend = {
        history: historyData,
        // 只傳遞核心數據給 GAS
        mistakes: mistakes.map(m => ({
            index: m.index,
            english: m.english,
            pos: m.pos,
            chinese: m.chinese,
        })),
        // 傳遞所有單字的答對/錯狀態，用於更新連對計數
        allWords: quizQueue.map(q => ({
            index: q.index,
            is_correct: q.is_correct
        }))
    };
    
    const dataString = JSON.stringify(dataToSend);

    try {
        const response = await fetch(CONFIG.GAS_URL, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-cache',
            // !!! 關鍵優化: 移除 Content-Type 標頭以避免 CORS 預檢 !!!
            body: dataString 
        });

        // 即使 GAS 設置了 JSON 回傳，我們仍使用 response.text() 確保解析容錯
        const responseText = await response.text();
        const result = JSON.parse(responseText); 

        if (result.status === 'success') {
            console.log("✅ 結果上傳成功！GAS 已更新您的紀錄。");
        } else {
            console.error("❌ 結果上傳失敗 (GAS Error):", result.message);
        }

    } catch (error) {
        console.error("❌ 發送請求到 GAS 失敗:", error);
        alert("資料上傳到 Google Sheets 失敗，請檢查瀏覽器控制台錯誤。");
    }
}