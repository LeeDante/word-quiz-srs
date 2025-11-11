/**
 * 職責：紀錄與報告模組。
 * 負責追蹤測驗過程中的數據、計算最終結果、本地端(LocalStorage)備份，
 * 並協調 data-loader.js 進行雲端寫入。
 */
import { saveRecord, loadData } from './data-loader.js';
import { displaySyncStatus } from './quiz-ui.js'; // 假設這個函式在 quiz-ui.js 中

// 追蹤當前測驗狀態的物件
let quizSessionData = {
    startTime: null,        
    endTime: null,          
    level: '',              
    totalWords: 0,          
    correctCount: 0,        
    errorLog: [],           
};

// LocalStorage 的 key
const HISTORY_KEY = 'vocabQuizHistory';

/** 初始化測驗狀態 */
export function startSession(totalWords, level) {
    quizSessionData = {
        startTime: Date.now(),
        endTime: null,
        level: level,
        totalWords: totalWords,
        correctCount: 0,
        errorLog: [],
    };
}

/** 紀錄單題的結果 */
export function recordAnswer(isCorrect, question, userInput) {
    if (isCorrect) {
        quizSessionData.correctCount++;
    } else {
        // 記錄錯誤詳情到 errorLog
        quizSessionData.errorLog.push({
            id: question.ID,
            english: question.English,
            chinese: question.Chinese,
            userInput: userInput,
        });
    }
}

/** 測驗結束時，計算結果並啟動儲存流程 */
export async function finishSession() {
    quizSessionData.endTime = Date.now();
    
    // 1. 計算結果
    const timeSpent = (quizSessionData.endTime - quizSessionData.startTime) / 1000;
    const score = (quizSessionData.correctCount / quizSessionData.totalWords) * 100;

    const results = {
        score: Math.round(score),
        timeSpent: parseFloat(timeSpent.toFixed(1)),
        totalCorrect: quizSessionData.correctCount,
        totalWords: quizSessionData.totalWords,
        level: quizSessionData.level
    };

    // 2. 儲存流程 (本地備份與雲端同步)
    await saveAndSync(results, quizSessionData.errorLog);
    return { ...results, errorLog: quizSessionData.errorLog };
}


/** 處理本地備份與雲端寫入的協調 */
async function saveAndSync(results, errorLog) {
    const newRecord = { 
        ...results, 
        date: new Date().toISOString(),
        errorCount: errorLog.length
    };
    
    // 優先執行本地備份
    saveLocalHistory(newRecord);

    // 嘗試寫入雲端 (GAS)
    displaySyncStatus('同步中...', 'loading'); 
    
    const gasResult = await saveRecord(
        results.score, results.level, results.timeSpent, 
        results.totalCorrect, results.totalWords, errorLog
    );

    if (gasResult.status === 'success') {
        displaySyncStatus('雲端同步成功！', 'success'); 
    } else {
        displaySyncStatus('雲端同步失敗：紀錄已暫存於本地。', 'error');
        console.error("雲端同步失敗詳情:", gasResult.message);
    }
}

/** 將最新紀錄儲存到本地 LocalStorage */
function saveLocalHistory(newRecord) {
    try {
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        history.unshift(newRecord); // 將最新紀錄放在最前面
        // 只保留近 10 筆紀錄
        const limitedHistory = history.slice(0, 10); 
        localStorage.setItem(HISTORY_KEY, JSON.stringify(limitedHistory));
    } catch (e) {
        console.error("本地儲存失敗:", e);
    }
}

/** 讀取本地歷史紀錄 */
export function getLocalHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

/** 讀取並顯示雲端歷史紀錄 (未來可擴充功能) */
export async function getCloudHistory() {
    // 由於我們只設計了寫入 '測驗紀錄'，這裡從本地獲取即可，雲端主要用於跨裝置同步。
    // 如果需要從雲端讀取，需要 GAS 的 doGet 增加一個 'records' type 
    // const cloudRecords = await loadData('records'); 
    return getLocalHistory();
}