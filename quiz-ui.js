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
export function renderQuestion(questionData, index, total, vocabList, level) {
    // 渲染進度 (index/total)
    // 渲染題目 (questionData.Chinese/English)
    
    // 根據 level 判斷題型 (選擇題/拼字題)
    if (['A', 'B'].includes(level) && (Math.random() > 0.3 || (level === 'B' && Math.random() < 0.3))) {
        // 渲染選擇題 (需要調用 generateMultipleChoice)
        // ...
    } else {
        // 渲染拼字題 (輸入框)
        // ...
    }
    
    // 設置按鈕狀態
    DOM.submitButton.style.display = 'block';
    DOM.nextButton.style.display = 'none';
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