/**
 * 職責：使用者介面(UI)與互動模組。
 * 負責單頁式應用(SPA)的View切換、所有UI元素的渲染、計時器更新、即時回饋顯示，
 * 以及雲端同步狀態的視覺化回饋。
 */
import { checkSpelling, generateMultipleChoice } from './quiz-generator.js';
import * as HistoryManager from './history-manager.js';

// 假設 HTML 元素已經定義
const Views = ['setup-view', 'quiz-view', 'result-view', 'history-view'];
const DOM = {}; // 用於儲存所有 DOM 元素的參考

let timerInterval = null; // 計時器 ID

/** 初始化 DOM 元素參考 */
export function initializeUI() {
    Views.forEach(id => {
        DOM[id] = document.getElementById(id);
    });
    DOM.feedbackArea = document.getElementById('feedback-area');
    DOM.submitButton = document.getElementById('submit-answer-btn');
    DOM.nextButton = document.getElementById('next-question-btn');
    DOM.syncStatusArea = document.getElementById('sync-status-area');
    // ... 其他元素，如 timerDisplay, progressDisplay, resultSummary

    showView('setup-view');
}

/** 切換 View 顯示 */
export function showView(viewId) {
    Views.forEach(id => {
        if (DOM[id]) {
            DOM[id].style.display = (id === viewId) ? 'block' : 'none';
        }
    });
}

// ... (以下為介面渲染和互動的 Placeholder 函式) ...

/** 渲染測驗畫面 */
export function renderQuestion(questionData, index, total, level, options) { // 修正參數列表
    const questionTextElement = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');
    const inputField = document.getElementById('user-input-field');
    const progressDisplay = document.getElementById('progress-display');

    // 1. 更新進度顯示
    progressDisplay.textContent = `進度: ${index}/${total}`;
    
    // 2. 判斷題型和渲染題目文字
    const isChineseToEnglish = ['B', 'C'].includes(level);
    const isSpelling = (options === null); // 根據 options 是否存在判斷是選擇題還是拼字題

    if (isChineseToEnglish) {
        questionTextElement.textContent = questionData.Chinese; // 顯示中文，考英文
    } else {
        questionTextElement.textContent = questionData.English; // 顯示英文，考中文或拼字
    }

    // 3. 渲染答案區
    optionsContainer.innerHTML = ''; // 清空選項區
    inputField.value = ''; // 清空輸入框
    inputField.style.display = 'none';

    if (isSpelling) {
        // 拼字題 (C, D 級，或 A/B 級的拼字部分)
        inputField.style.display = 'block';
    } else {
        // 選擇題 (A/B 級的選擇部分)
        options.forEach((optionText, i) => {
            const button = document.createElement('button');
            button.className = 'option-btn';
            button.textContent = `${String.fromCharCode(65 + i)}. ${optionText}`; // 顯示 A. B. C. D.
            button.setAttribute('data-value', optionText);
            button.addEventListener('click', (e) => {
                // 自動填寫答案到輸入框並提交 (模擬選擇)
                inputField.value = e.target.getAttribute('data-value');
                document.getElementById('submit-answer-btn').click(); 
            });
            optionsContainer.appendChild(button);
        });
    }
    
    // 設置按鈕狀態
    document.getElementById('submit-answer-btn').style.display = 'block';
    document.getElementById('next-question-btn').style.display = 'none';
    DOM.feedbackArea.innerHTML = '';
}

/** 處理即時回饋 (2.4) */
export function displayFeedback(isCorrect, correctAnswer, userInput) {
    const message = isCorrect ? 
        '✅ 恭喜答對！' : 
        `❌ 答案錯誤！正確答案是: **${correctAnswer}** (您輸入了: ${userInput})`;
    
    DOM.feedbackArea.innerHTML = message;
    DOM.feedbackArea.className = isCorrect ? 'feedback-success' : 'feedback-error';

    // 實現手動確認模式
    DOM.submitButton.style.display = 'none';
    DOM.nextButton.style.display = 'block';
}

/** 更新計時器 (2.5) */
export function startTimer() {
    let seconds = 0;
    const timerDisplay = document.getElementById('timer-display');
    timerInterval = setInterval(() => {
        seconds++;
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        timerDisplay.textContent = `時間: ${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }, 1000);
}

export function stopTimer() {
    clearInterval(timerInterval);
}

/** 顯示雲端同步狀態 (自定義功能) */
export function displaySyncStatus(message, type) {
    const area = DOM.syncStatusArea || document.getElementById('sync-status-area');
    area.textContent = message;
    area.className = `sync-${type}`; // 假設 CSS 定義了 sync-loading, sync-success, sync-error 樣式
}

/** 渲染測驗結果 (2.5, 2.6) */
export function renderResults(results, errorLog) {
    // 顯示得分、時間、答對題數等
    // 渲染錯誤清單 (errorLog)
    showView('result-view');
}

/** 渲染歷史紀錄 (2.7) */
export async function renderHistoryView() {
    const history = HistoryManager.getLocalHistory();
    // 渲染 history 數據到 `#history-view`
    
    showView('history-view');
}