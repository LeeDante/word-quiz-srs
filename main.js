/**
 * 職責：應用程式主入口與流程協調器。
 * 負責初始化、協調各模組的互動、處理測驗流程的啟動、結束及答案提交的整體邏輯。
 */
import { loadData } from './data-loader.js';
import * as QuizGenerator from './quiz-generator.js';
import * as UI from './quiz-ui.js';
import * as HistoryManager from './history-manager.js';

let allVocab = []; // 完整的單字庫
let errorLog = []; // 錯誤紀錄
let quizList = []; // 當前測驗題目列表
let currentQuestionIndex = 0; // 當前題號

// --- 啟動與初始化 ---

async function init() {
    UI.initializeUI();

    // 1. 載入數據
    const [vocabData, errorData] = await Promise.all([
        loadData('vocab'),
        loadData('errors')
    ]);

    if (vocabData.length === 0) {
        // 顯示錯誤訊息 (例如：試算表資料載入失敗)
        UI.displaySyncStatus('錯誤：無法載入單字庫，請檢查 GAS 設定。', 'error');
        return;
    }

    allVocab = vocabData;
    errorLog = errorData;
    
    // 2. 設置事件監聽 (由 UI 模組處理)
    setupEventListeners(); 
    
    // 顯示設定畫面
    UI.showView('setup-view');
    UI.displaySyncStatus('單字庫載入成功！', 'success'); 
}

// --- 測驗流程函式 ---

function setupEventListeners() {
    // 修正: 確保所有按鈕的 ID 都能被正確監聽
    document.getElementById('start-quiz-btn').addEventListener('click', startQuiz);
    document.getElementById('submit-answer-btn').addEventListener('click', handleSubmission);
    document.getElementById('next-question-btn').addEventListener('click', advanceToNextQuestion);
    document.getElementById('view-history-btn').addEventListener('click', UI.renderHistoryView); // 查看歷史紀錄
    document.getElementById('back-to-setup-btn').addEventListener('click', () => UI.showView('setup-view')); // 返回設定
    document.getElementById('start-new-quiz-btn').addEventListener('click', () => UI.showView('setup-view')); // 再測一次
    document.getElementById('review-errors-btn').addEventListener('click', () => UI.renderHistoryView(true)); // 查看錯誤清單
}

function startQuiz() {
    // 修正: 從 UI 元素中讀取真實的使用者設定
    const settings = {
        startID: parseInt(document.getElementById('id-start').value), 
        endID: parseInt(document.getElementById('id-end').value), 
        count: parseInt(document.getElementById('quiz-count').value), // 讀取實際題數
        level: document.getElementById('level-select').value 
    };
    
    // 確保題數有效
    if (isNaN(settings.count) || settings.count < 1) {
        alert("請輸入有效的測驗題數！");
        return;
    }
    
    // 2. 生成題目列表
    quizList = QuizGenerator.generateQuizList(settings, allVocab, errorLog);
    
    if (quizList.length === 0) {
        alert("無法生成測驗題目，請檢查您的設定範圍或單字庫數量。");
        return;
    }
    
    // 3. 初始化並啟動
    currentQuestionIndex = 0;
    HistoryManager.startSession(quizList.length, settings.level); // 使用 quizList.length
    UI.startTimer();
    UI.showView('quiz-view');
    renderCurrentQuestion();
}

function renderCurrentQuestion() {
    const question = quizList[currentQuestionIndex];
    const settings = { level: HistoryManager.quizSessionData.level };
    
    let options = null;
    const isChineseToEnglish = ['B', 'C'].includes(settings.level); 
    
    // 判斷是否為選擇題 (A/B級的選擇部分)
    // 假設 A/B 級中 70% 是選擇題 (0.7)，30% 是拼字題 (0.3)
    const isMultipleChoice = (settings.level === 'A' || settings.level === 'B') && Math.random() < 0.7; 

    if (isMultipleChoice) {
        options = QuizGenerator.generateMultipleChoice(question, allVocab, isChineseToEnglish);
    }
    
    // 呼叫 UI 渲染
    UI.renderQuestion(
        question, 
        currentQuestionIndex + 1, 
        quizList.length, 
        settings.level, 
        options // 傳遞選項
    );
}

function handleSubmission() {
    const question = quizList[currentQuestionIndex];
    const settings = { level: HistoryManager.quizSessionData.level };
    
    // 1. 取得使用者輸入 (需從 UI 元素中讀取)
    const userInput = document.getElementById('user-input-field') ? 
        document.getElementById('user-input-field').value : 
        document.querySelector('input[name="choice"]:checked')?.value;
    
    if (!userInput) {
        alert("請選擇或輸入答案！");
        return;
    }
    
    // 2. 判斷答案
    let isCorrect = false;
    let correctAnswer = ''; 

    if (settings.level === 'A' || settings.level === 'B') {
        // A/B 級混合題型，判斷是選擇題還是拼字題
        if (/* 判斷為選擇題 */ true) {
            correctAnswer = (settings.level === 'A' && question.Chinese) || question.English; // 根據題型決定正確答案
            isCorrect = (userInput === correctAnswer);
        } else {
            correctAnswer = question.English; // 拼字題答案是英文
            isCorrect = QuizGenerator.checkSpelling(userInput, correctAnswer);
        }
    } else if (settings.level === 'C' || settings.level === 'D') {
        correctAnswer = question.English; // C/D 級都是拼字題
        isCorrect = QuizGenerator.checkSpelling(userInput, correctAnswer);
    }

    // 3. 紀錄結果並顯示回饋
    HistoryManager.recordAnswer(isCorrect, question, userInput);
    UI.displayFeedback(isCorrect, correctAnswer, userInput);
}

function advanceToNextQuestion() {
    currentQuestionIndex++;
    
    if (currentQuestionIndex < quizList.length) {
        // 繼續下一題
        renderCurrentQuestion();
    } else {
        // 測驗結束
        finishQuiz();
    }
}

async function finishQuiz() {
    UI.stopTimer();
    // 1. 結算並儲存數據 (會觸發同步狀態提示)
    const results = await HistoryManager.finishSession();
    
    // 2. 顯示結果畫面
    UI.renderResults(results, results.errorLog);
}

// 應用程式入口
window.onload = init;