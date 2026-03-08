import React, { useState, useEffect, useRef } from 'react';
import { useApiKeyBridge } from '../hooks/useApiKeyBridge';
import {
    BookOpen, Settings, GraduationCap, FileText, Upload, Sparkles, AlertCircle,
    Save, Heart, X, File as FileIcon, Mic, MicOff, ChevronRight, CheckCircle2,
    User, MessageCircle, Send, ChevronDown, ChevronUp, RotateCcw, Zap, History,
    FolderOpen, FolderX, Link2, Clock, Target, HelpCircle, Lightbulb, Layout
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import mammoth from 'mammoth';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun } from 'docx';

// ───────────────────────────────────────────
// IndexedDB helpers for folder handle persistence
// ───────────────────────────────────────────
const IDB_NAME = 'shidouan_db';
const IDB_STORE = 'handles';
function openIDB() {
    return new Promise((res, rej) => {
        const r = indexedDB.open(IDB_NAME, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
async function saveHandleIDB(h) {
    const db = await openIDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(h, 'saveFolder');
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
}
async function loadHandleIDB() {
    try {
        const db = await openIDB();
        return new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const r = tx.objectStore(IDB_STORE).get('saveFolder');
            r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error);
        });
    } catch { return null; }
}
async function clearHandleIDB() {
    const db = await openIDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete('saveFolder');
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
}

// ───────────────────────────────────────────
// 差分アルゴリズム
// ───────────────────────────────────────────
function lineDiff(oldStr, newStr) {
    const ol = (oldStr || '').split('\n'), nl = (newStr || '').split('\n');
    const result = [];
    let o = 0, n = 0;
    while (o < ol.length || n < nl.length) {
        if (o >= ol.length) { result.push({ type: 'added', line: nl[n++] }); }
        else if (n >= nl.length) { result.push({ type: 'removed', line: ol[o++] }); }
        else if (ol[o] === nl[n]) { result.push({ type: 'unchanged', line: ol[o] }); o++; n++; }
        else {
            let inN = -1, inO = -1;
            for (let k = 1; k <= 5; k++) {
                if (inN === -1 && n + k < nl.length && nl[n + k] === ol[o]) inN = k;
                if (inO === -1 && o + k < ol.length && ol[o + k] === nl[n]) inO = k;
            }
            if (inN !== -1 && (inO === -1 || inN <= inO)) { for (let k = 0; k < inN; k++) result.push({ type: 'added', line: nl[n++] }); }
            else if (inO !== -1) { for (let k = 0; k < inO; k++) result.push({ type: 'removed', line: ol[o++] }); }
            else { result.push({ type: 'removed', line: ol[o++] }); result.push({ type: 'added', line: nl[n++] }); }
        }
    }
    return result;
}
function countChanges(diff) {
    return { added: diff.filter(d => d.type === 'added').length, removed: diff.filter(d => d.type === 'removed').length };
}

// ───────────────────────────────────────────
// 先生パーソナライズ質問（単元計画アプリと共有）
// ───────────────────────────────────────────
const TEACHER_QUESTIONS = [
    { key: 'philosophy', label: '授業観・学習観', question: 'あなたが大切にしている授業観・学習観を教えてください', placeholder: '例：子どもが主体的に問いを立て、仲間と協働して解決していく授業を大切にしています。', icon: '🌱' },
    { key: 'goalChild', label: 'めざす子ども像', question: 'この授業を通してどんな子どもに育てたいですか？', placeholder: '例：自分の考えを根拠をもって伝え、友達の意見から学べる子ども。', icon: '🌟' },
    { key: 'classReality', label: 'クラスの実態', question: '今のクラスの様子（強み・課題・気になること）を教えてください', placeholder: '例：積極的に発言する子が多い一方、書くことへの抵抗感が強い子が数名います。', icon: '👥' },
    { key: 'approach', label: '重視する指導の手立て', question: 'よく使う授業スタイル・工夫・手法はありますか？', placeholder: '例：ICTを活用した協働学習、Think-Pair-Share法を多用しています。', icon: '🛠️' },
    { key: 'evaluation', label: '評価へのこだわり', question: '評価で特に大切にしていることを教えてください', placeholder: '例：振り返り日記やポートフォリオで成長を見取りたい。', icon: '📊' },
    { key: 'freeNote', label: 'その他・AIへ一言', question: 'AIに特に伝えたいこと、補足があれば自由に書いてください', placeholder: '例：ICT活用を強調してほしい／書く活動を中心にしてほしい など', icon: '💬' },
];

// 本時の設計 質問（指導案特有の詳細設計）
const LESSON_QUESTIONS = [
    { key: 'mainQuestion', label: '主発問・核心的な問い', question: 'この時間、子どもたちに一番考えてほしい問いは何ですか？', placeholder: '例：なぜ作者は、主人公にこの行動をとらせたのでしょうか？', icon: '❓' },
    { key: 'expectedResponse', label: '予想される子どもの反応', question: 'その問いに対して、どんな答えや反応が予想されますか？', placeholder: '例：A「〜という理由から〜だと思う」B「〜なのに〜するのは不自然」など', icon: '💭' },
    { key: 'keyActivity', label: 'キーとなる学習活動', question: 'この授業で最も大切にしたい学習活動は？', placeholder: '例：グループでの対話場面 / 個人思考からの比較検討 / 作品制作と相互評価 など', icon: '🎯' },
    { key: 'closingActivity', label: 'まとめ・振り返りの形', question: '授業の最後の「まとめ・振り返り」はどのような形を想定していますか？', placeholder: '例：振り返りシートに書く / 今日学んだことを1文でまとめる / 次時への問いを立てる', icon: '📝' },
    { key: 'supportPlan', label: '特別支援・個別の手立て', question: '支援が必要な子への対応で特に意識していることは？', placeholder: '例：書くことへの抵抗が強い子には選択肢を提示 / 図や実物を手元に用意する など', icon: '🤝' },
    { key: 'boardPlan', label: '板書のイメージ', question: '板書のイメージ（構造・キーワード等）をざっくり教えてください', placeholder: '例：左に問い、中央に意見の分類、右にまとめ。キーワードは「変化」「きっかけ」', icon: '🖊️' },
];

// AI修正クイックチップ
const QUICK_CHIPS = [
    { label: '💬 発問を練り直す', instruction: '主発問・補助発問をより子どもが考えたくなる言葉に練り直してください。' },
    { label: '🖊️ 板書計画を充実', instruction: '板書計画をより具体的に、学習の流れが見える構造で書き直してください。' },
    { label: '🤝 個別支援を強化', instruction: '特別な支援が必要な子どもへの手立て・配慮を具体的に充実させてください。' },
    { label: '💻 ICT活用を追加', instruction: 'ICTを効果的に活用する場面を具体的に追加してください。' },
    { label: '📊 評価ルーブリックを詳しく', instruction: '評価規準をA/B/Cの3段階ルーブリックで具体的に書き直してください。' },
    { label: '⏱️ 時間配分を調整', instruction: '各活動の時間配分を見直し、より現実的な計画に調整してください。' },
    { label: '🔄 展開を詳細化', instruction: '学習活動と教師の指導言をより具体的・詳細に書き直してください。' },
    { label: '🌐 主体的な学びを強化', instruction: '子どもが主体的に問いを立て、自ら考える場面をより充実させてください。' },
    { label: '✨ 研究テーマとの関連を明確化', instruction: '校内研究テーマとのつながりをより明確に記述してください。' },
    { label: '📝 振り返り活動を充実', instruction: 'まとめ・振り返り活動をより充実させ、次時への接続も書いてください。' },
];

const GEMINI_PROXY = 'https://tlab-api.vercel.app/api/gemini';

// ───────────────────────────────────────────
// メインコンポーネント
// ───────────────────────────────────────────
const LessonPlanGenerator = () => {
    const { apiKey, saveApiKey } = useApiKeyBridge();

    // 設定
    const [showSettings, setShowSettings] = useState(false);
    const [model, setModel] = useState('gemini-2.0-flash'); // fallback default
    const [connectionStatus, setConnectionStatus] = useState('idle');
    const [aiEnabled, setAiEnabled] = useState(() => localStorage.getItem('shidouan_ai_enabled') !== 'false');

    // 単元コンテキスト（引き継ぎ or 手入力）
    const [hasInherited, setHasInherited] = useState(false);
    const [schoolType, setSchoolType] = useState('elementary');
    const [grade, setGrade] = useState('');
    const [subject, setSubject] = useState('');
    const [unitName, setUnitName] = useState('');
    const [classType, setClassType] = useState('regular');
    const [unitPlanSummary, setUnitPlanSummary] = useState('');

    // 本時の基本情報
    const [lessonNumber, setLessonNumber] = useState('');
    const [totalLessons, setTotalLessons] = useState('');
    const [lessonTitle, setLessonTitle] = useState('');
    const [lessonObjective, setLessonObjective] = useState('');
    const [lessonTime, setLessonTime] = useState('45');

    // 本時の詳細設計（モーダル入力）
    const [lessonProfile, setLessonProfile] = useState(() => {
        const s = localStorage.getItem('shidouan_lesson_profile');
        return s ? JSON.parse(s) : {};
    });
    const [showLessonModal, setShowLessonModal] = useState(false);
    const [lessonListeningKey, setLessonListeningKey] = useState(null);
    const lessonRecognitionRef = useRef(null);

    // 先生パーソナライズ（単元計画アプリと localStorage 共有）
    const [teacherProfile, setTeacherProfile] = useState(() => {
        const s = localStorage.getItem('unitplan_teacher_profile');
        return s ? JSON.parse(s) : {};
    });
    const [showTeacherModal, setShowTeacherModal] = useState(false);
    const [listeningKey, setListeningKey] = useState(null);
    const recognitionRef = useRef(null);

    // 指導案様式（テンプレート）
    const [templateFiles, setTemplateFiles] = useState([]);
    const [templateText, setTemplateText] = useState('');
    const templateInputRef = useRef(null);

    // 参考資料
    const [refFiles, setRefFiles] = useState([]);
    const [refText, setRefText] = useState('');
    const refInputRef = useRef(null);

    // 生成結果
    const [generatedPlan, setGeneratedPlan] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const previewRef = useRef(null);

    // ステップインジケーター用セクションref
    const stepRef1 = useRef(null); // 単元コンテキスト
    const stepRef2 = useRef(null); // 本時の設計
    const stepRef3 = useRef(null); // 先生の理念
    const stepRef4 = useRef(null); // 様式・資料
    const stepRef5 = useRef(null); // 生成ボタン

    // AI修正チャット
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const chatEndRef = useRef(null);

    // レイアウト
    const [layoutMode, setLayoutMode] = useState('design');

    // 変更履歴
    const [planHistory, setPlanHistory] = useState([]);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [diffTarget, setDiffTarget] = useState(null);

    // 保存先フォルダ
    const [folderHandle, setFolderHandle] = useState(null);
    const [folderName, setFolderName] = useState(() => localStorage.getItem('shidouan_folder_name') || '');

    // ───── 起動時処理 ─────
    useEffect(() => {
        // 単元計画アプリからの引き継ぎデータを読み込む
        const saved = localStorage.getItem('tlab_current_project');
        if (saved) {
            try {
                const proj = JSON.parse(saved);
                const ctx = proj.context || {};
                if (ctx.grade) setGrade(ctx.grade);
                if (ctx.subject) setSubject(ctx.subject);
                if (ctx.unitName) setUnitName(ctx.unitName);
                if (ctx.schoolType) setSchoolType(ctx.schoolType);
                if (ctx.classType) setClassType(ctx.classType);
                if (proj.content?.unitPlanMarkdown) setUnitPlanSummary(proj.content.unitPlanMarkdown);
                setHasInherited(true);
            } catch { /* no-op */ }
        }
        // IndexedDB からフォルダハンドルを復元
        loadHandleIDB().then(h => { if (h) setFolderHandle(h); });
    }, []);

    // ───── 起動時にプロキシ経由でモデル自動検出 ─────
    useEffect(() => {
        setConnectionStatus('testing');
        const score = (name) => {
            let s = 0;
            if (name.includes('2.5')) s += 300;
            else if (name.includes('2.0')) s += 200;
            else if (name.includes('1.5')) s += 100;
            if (name.includes('flash')) s += 10;
            return s;
        };
        fetch(GEMINI_PROXY)
            .then(r => r.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                const best = (data.models || [])
                    .map(m => m.name)
                    .sort((a, b) => score(b) - score(a))[0];
                if (best) setModel(best);
                setConnectionStatus('success');
            })
            .catch(() => {
                setConnectionStatus('error');
            });
    }, []);

    // ───── ヘルパー関数 ─────
    const saveToHistory = (plan, label) => {
        setPlanHistory(prev => [...prev, { id: Date.now(), ts: new Date(), plan, label }]);
    };

    const toggleAi = () => {
        const next = !aiEnabled;
        setAiEnabled(next);
        localStorage.setItem('shidouan_ai_enabled', String(next));
    };

    // ───── フォルダ選択 ─────
    const handlePickFolder = async () => {
        if (!window.showDirectoryPicker) {
            alert('このブラウザはフォルダ指定保存に対応していません。Chrome または Edge をお使いください。');
            return;
        }
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            setFolderHandle(handle);
            setFolderName(handle.name);
            localStorage.setItem('shidouan_folder_name', handle.name);
            await saveHandleIDB(handle);
        } catch (e) { if (e.name !== 'AbortError') console.error(e); }
    };
    const handleClearFolder = async () => {
        setFolderHandle(null); setFolderName('');
        localStorage.removeItem('shidouan_folder_name');
        await clearHandleIDB();
    };

    // ───── 先生プロフィール ─────
    const updateTeacherProfile = (key, value) => setTeacherProfile(prev => ({ ...prev, [key]: value }));
    const applyTeacherProfile = () => {
        localStorage.setItem('unitplan_teacher_profile', JSON.stringify(teacherProfile));
        stopVoice(); setShowTeacherModal(false);
    };
    const filledTeacherCount = TEACHER_QUESTIONS.filter(q => teacherProfile[q.key]?.trim()).length;

    // ステップの完了判定
    const stepDone = (n) => {
        if (n === 1) return !!(grade || subject || unitName);
        if (n === 2) return !!lessonObjective.trim();
        if (n === 3) return filledTeacherCount > 0;
        if (n === 4) return templateFiles.length > 0 || !!templateText || refFiles.length > 0 || !!refText;
        if (n === 5) return !!generatedPlan;
        return false;
    };

    // 現在フォーカスすべきステップ
    const currentStep = (() => {
        if (layoutMode === 'refine' || generatedPlan) return 6;
        if (isLoading) return 5;
        if (lessonObjective.trim()) return 5;
        if (grade || subject || unitName) return 2;
        return 1;
    })();

    // ステップクリック → 対応セクションへスクロール
    const scrollToStep = (n) => {
        setLayoutMode('design');
        const refs = [null, stepRef1, stepRef2, stepRef3, stepRef4, stepRef5];
        setTimeout(() => {
            refs[n]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    };

    // ───── 本時の設計プロフィール ─────
    const updateLessonProfile = (key, value) => setLessonProfile(prev => ({ ...prev, [key]: value }));
    const applyLessonProfile = () => {
        localStorage.setItem('shidouan_lesson_profile', JSON.stringify(lessonProfile));
        stopLessonVoice(); setShowLessonModal(false);
    };
    const filledLessonCount = LESSON_QUESTIONS.filter(q => lessonProfile[q.key]?.trim()).length;

    // ───── 音声入力（先生プロフィール） ─────
    const toggleVoice = (key) => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { alert('このブラウザは音声入力に対応していません。'); return; }
        if (listeningKey === key) { stopVoice(); return; }
        stopVoice();
        const r = new SR(); r.lang = 'ja-JP'; r.continuous = true; r.interimResults = true;
        recognitionRef.current = r; setListeningKey(key);
        let final = teacherProfile[key] || '';
        r.onresult = (e) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) { final += t; updateTeacherProfile(key, final); }
                else { interim = t; updateTeacherProfile(key, final + interim); }
            }
        };
        r.onend = () => { setListeningKey(null); recognitionRef.current = null; };
        r.onerror = () => { setListeningKey(null); recognitionRef.current = null; };
        r.start();
    };
    const stopVoice = () => {
        if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
        setListeningKey(null);
    };

    // ───── 音声入力（本時設計） ─────
    const toggleLessonVoice = (key) => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { alert('このブラウザは音声入力に対応していません。'); return; }
        if (lessonListeningKey === key) { stopLessonVoice(); return; }
        stopLessonVoice();
        const r = new SR(); r.lang = 'ja-JP'; r.continuous = true; r.interimResults = true;
        lessonRecognitionRef.current = r; setLessonListeningKey(key);
        let final = lessonProfile[key] || '';
        r.onresult = (e) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) { final += t; updateLessonProfile(key, final); }
                else { interim = t; updateLessonProfile(key, final + interim); }
            }
        };
        r.onend = () => { setLessonListeningKey(null); lessonRecognitionRef.current = null; };
        r.onerror = () => { setLessonListeningKey(null); lessonRecognitionRef.current = null; };
        r.start();
    };
    const stopLessonVoice = () => {
        if (lessonRecognitionRef.current) { lessonRecognitionRef.current.stop(); lessonRecognitionRef.current = null; }
        setLessonListeningKey(null);
    };

    // ───── テンプレートアップロード ─────
    const handleTemplateUpload = async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
            if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                const buf = await file.arrayBuffer();
                try {
                    const result = await mammoth.extractRawText({ arrayBuffer: buf });
                    setTemplateText(prev => prev + `\n\n--- [様式: ${file.name}] ---\n` + result.value);
                } catch { alert(`${file.name} の読み込みに失敗しました。`); }
            } else if (file.type === 'application/pdf') {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const b64 = ev.target.result.split(',')[1];
                    setTemplateFiles(prev => [...prev, { name: file.name, mimeType: 'application/pdf', data: b64 }]);
                };
                reader.readAsDataURL(file);
            } else { alert('PDF または Word ファイルをアップロードしてください。'); }
        }
        if (templateInputRef.current) templateInputRef.current.value = '';
    };

    // ───── 参考資料アップロード ─────
    const handleRefUpload = async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
            if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                const buf = await file.arrayBuffer();
                try {
                    const result = await mammoth.extractRawText({ arrayBuffer: buf });
                    setRefText(prev => prev + `\n\n--- [参考: ${file.name}] ---\n` + result.value);
                } catch { alert(`${file.name} の読み込みに失敗しました。`); }
            } else if (file.type === 'application/pdf') {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const b64 = ev.target.result.split(',')[1];
                    setRefFiles(prev => [...prev, { name: file.name, mimeType: 'application/pdf', data: b64 }]);
                };
                reader.readAsDataURL(file);
            } else if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
                const text = await file.text();
                setRefText(prev => prev + `\n\n--- [参考: ${file.name}] ---\n` + text);
            }
        }
        if (refInputRef.current) refInputRef.current.value = '';
    };

    // ───── AI 生成 ─────
    const handleGenerate = async () => {
        if (!aiEnabled) { alert('AIがOFFになっています。ヘッダーのトグルボタンでONにしてください。'); return; }
        if (!lessonObjective.trim()) { alert('「本時のねらい」を入力してください。'); return; }

        setIsLoading(true);
        setGeneratedPlan('');

        const hasTemplate = templateFiles.length > 0 || templateText.trim();

        const systemPrompt = `あなたは日本の公立学校教育における学習指導案作成の最高水準の専門家です。
以下の教育知見を深く内面化した上で、授業者の意思・理念を最優先に、最高品質の学習指導案を作成してください。

## ★絶対最優先：授業者の意思・理念
授業者のすべての指導方針・こだわり・理念を指導案の全記述に色濃く反映してください。
「先生らしさ」が全面に出る、オリジナリティ溢れる指導案を作成してください。

## 参照する優れた実践・知見（優先順位順）

### 1. 文部科学省 学習指導要領（各教科編）
- 各教科の「見方・考え方」を働かせた学習活動の設計
- 「主体的・対話的で深い学び」の3視点からの授業改善
- 「知識・技能」「思考・判断・表現」「主体的に学習に取り組む態度」の3観点評価
- 各学年・各単元における重点目標と指導内容の系統性

### 2. 東京都 教師道場の実践（指導案記述の最高水準）
- めあて → 学習活動 → 振り返りの明確な流れと構造
- 教師の「指導言」の精選と具体性（命令的指示より問いかけと支援の記述）
- 板書計画の学習過程との有機的な対応
- 「個別最適な学び」と「協働的な学び」の一体的充実
- 評価の「見取り」方法の具体的・現実的な記述

### 3. 国立教育政策研究所（NIER）の評価に関する最新知見
- 「指導と評価の一体化」の具体的実現
- 評価ルーブリックの設計（A/おおむね満足B/努力を要するC の具体的な姿の記述）
- 「おおむね満足できる状況（B）」を基軸とした評価規準の明確化
- ペーパーテストに限らないパフォーマンス評価・観察・対話等の多様な評価方法
- 形成的評価による授業中の軌道修正の実践

### 4. 福岡県教育委員会の実践・授業研究の知見
- 子どもの事実から学ぶ授業デザインと省察
- 授業研究（Lesson Study）の深い文化に根ざした指導案の精緻さ
- 地域・学校の実情を活かした実践的な工夫

### 5. 授業研究・教育学の国際的知見
- UDL（学びのユニバーサルデザイン）による全員の学びの保障
- Think-Pair-Share、ジグソー法等の協働学習の科学的設計
- 問い（Essential Question）を核にした授業構成
- 言語活動・表現活動の充実による深い学び

## 学習指導案の品質基準
1. 子どもが「考えずにいられない」本物の問いが設定されている
2. 学習活動の記述が「子どもの思考の流れ」として書かれている
3. 教師の「指導言・発問・支援」が具体的で、授業者の個性が出ている
4. 評価規準が「B（おおむね満足）の姿」として具体的・観察可能に記述されている
5. UD・個別支援が全員の学びを保障する形で組み込まれている
6. 板書計画が「思考の見える化」として機能している
7. 導入→展開→まとめの各場面に明確な意図がある

## 出力形式
${hasTemplate
    ? '★添付された指導案様式（テンプレート）の構造・項目を厳密に踏まえた形式で出力してください。様式の各項目を埋める形で記述してください。'
    : `以下の標準形式でMarkdownを使って出力してください。表はMarkdownテーブルで記述してください。

---
# 学習指導案

**教科**: ／ **学年・組**: ／ **単元名**: ／ **本時**: 第○時 / 全○時
**本時のめあて（子ども視点）**: 〜しよう / 〜を考えよう

---

## 1. 本時の目標

| 観点 | 目標 |
|------|------|
| 知識・技能 | |
| 思考・判断・表現 | |
| 主体的に学習に取り組む態度 | |

## 2. 評価規準と評価方法

| 観点 | A（十分満足） | B（おおむね満足） | C（努力を要する） | 評価方法 |
|------|------------|----------------|----------------|---------|

## 3. 準備物
- **教師**:
- **児童・生徒**:

## 4. 本時の展開（全${lessonTime}分）

| 時間 | 学習活動（予想される子どもの姿） | ○教師の指導・支援　◇個別支援・UD配慮 | 評価（○観点・方法） |
|------|-------------------------------|-----------------------------------|--------------------|
| **導入**（約5分） | | | |
| **展開①**（約○分） | | | |
| **展開②**（約○分） | | | |
| **まとめ**（約5分） | | | |

## 5. 板書計画

（板書の構造を文字・図で示す）

## 6. 授業後の省察ポイント

（授業者が振り返るべき観点を2〜3点）
---`
}

## 単元コンテキスト
- 校種: ${schoolType === 'elementary' ? '小学校' : '中学校'}
- 学年: ${grade || '（未設定）'}
- 教科: ${subject || '（未設定）'}
- 単元名: ${unitName || '（未設定）'}
- 学級タイプ: ${classType}
- 本時: 第${lessonNumber || '○'}時 / 全${totalLessons || '○'}時
- 授業時間: ${lessonTime}分

## 単元指導計画（引き継ぎデータ）
${unitPlanSummary
    ? `以下の単元指導計画に基づき、本時の授業を設計してください：\n${unitPlanSummary.slice(0, 3000)}${unitPlanSummary.length > 3000 ? '\n（以下省略）' : ''}`
    : '（単元計画データなし。単元・学年・教科から最善の授業を設計してください。）'
}

## 本時の基本情報
- 本時のねらい: ${lessonObjective}
- 単元内の位置: 第${lessonNumber || '？'}時（全${totalLessons || '？'}時のうち）
- 授業タイトル: ${lessonTitle || '（タイトル未設定）'}

## 本時の詳細設計（授業者からの指示）
${LESSON_QUESTIONS.map(q => {
    const val = lessonProfile[q.key]?.trim();
    return val ? `【${q.label}】\n${val}` : null;
}).filter(Boolean).join('\n\n') || '（本時の詳細設計は未入力。上記のねらいと単元計画から最善の設計をしてください。）'}

## 先生のパーソナライズ情報（最大限反映すること）
${TEACHER_QUESTIONS.map(q => {
    const val = teacherProfile[q.key]?.trim();
    return val ? `【${q.label}】\n${val}` : null;
}).filter(Boolean).join('\n\n') || '（入力なし。教科・学年・単元から最適な指導案を作成してください。）'}

${refText ? `## 参考資料（テキスト）\n${refText}` : ''}
${templateText ? `## 指導案様式（テキスト抽出）\n${templateText}` : ''}
`;

        try {
            const parts = [{ text: systemPrompt }];
            templateFiles.forEach(f => parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } }));
            refFiles.forEach(f => parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } }));

            const res = await fetch(GEMINI_PROXY, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, contents: [{ parts }] })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            const text = data.candidates[0].content.parts[0].text;
            saveToHistory(text, '初回生成');
            setGeneratedPlan(text);
            setLayoutMode('refine');
            setIsChatOpen(true);
        } catch (err) {
            console.error(err);
            alert('生成に失敗しました: ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // ───── AI 修正チャット ─────
    const handleChatSend = async (instruction) => {
        const text = (instruction || chatInput).trim();
        if (!text || !generatedPlan) return;
        if (!aiEnabled) { alert('AIがOFFになっています。'); return; }

        setChatMessages(prev => [...prev, { role: 'user', content: text }]);
        setChatInput('');
        setIsChatLoading(true);
        setIsChatOpen(true);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

        try {
            const prompt = `以下は現在作成中の学習指導案です：\n\n${generatedPlan}\n\n---\nユーザーからの修正依頼：「${text}」\n\n上記の修正依頼に従い、学習指導案を修正してください。修正後の完全な指導案のみをMarkdown形式で出力してください。説明文・前置きは一切不要です。`;
            const res = await fetch(GEMINI_PROXY, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            const revised = data.candidates[0].content.parts[0].text;
            saveToHistory(revised, text.length > 18 ? text.slice(0, 18) + '…' : text);
            setGeneratedPlan(revised);
            setChatMessages(prev => [...prev, { role: 'ai', content: '指導案を更新しました ✅' }]);
        } catch (err) {
            setChatMessages(prev => [...prev, { role: 'ai', content: `エラー: ${err.message}` }]);
        } finally {
            setIsChatLoading(false);
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
    };

    // ───── エクスポート ─────
    const saveToFile = async (blob, filename) => {
        if (folderHandle) {
            try {
                const perm = await folderHandle.requestPermission({ mode: 'readwrite' });
                if (perm === 'granted') {
                    const fh = await folderHandle.getFileHandle(filename, { create: true });
                    const w = await fh.createWritable(); await w.write(blob); await w.close();
                    alert(`「${folderHandle.name}」に保存しました ✅`); return;
                }
            } catch (err) { console.error(err); }
        }
        saveAs(blob, filename);
    };

    const handleTextExport = async () => {
        if (!generatedPlan) return;
        const base = `${grade || ''}${subject || ''}_${unitName || '指導案'}_第${lessonNumber || '?'}時`;
        await saveToFile(new Blob([generatedPlan], { type: 'text/plain;charset=utf-8' }), `${base}.txt`);
    };

    const handleWordExport = async () => {
        if (!generatedPlan) return;
        const base = `${grade || ''}${subject || ''}_${unitName || '指導案'}_第${lessonNumber || '?'}時`;
        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    new Paragraph({ children: [new TextRun({ text: `${unitName} 学習指導案 第${lessonNumber}時`, bold: true, size: 32 })], spacing: { after: 400 } }),
                    new Paragraph({ children: [new TextRun({ text: `学年: ${grade} / 教科: ${subject} / 本時: 第${lessonNumber}時 / 全${totalLessons}時`, size: 24 })] }),
                    new Paragraph({ children: [new TextRun({ text: `本時のねらい: ${lessonObjective}` })], spacing: { after: 400 } }),
                    new Paragraph({ children: [new TextRun({ text: '--- 生成された指導案 ---', bold: true })], spacing: { after: 200 } }),
                    ...generatedPlan.split('\n').map(line => new Paragraph({ children: [new TextRun({ text: line })] })),
                ],
            }],
        });
        const blob = await Packer.toBlob(doc);
        if (folderHandle) {
            try {
                const perm = await folderHandle.requestPermission({ mode: 'readwrite' });
                if (perm === 'granted') {
                    const fh = await folderHandle.getFileHandle(`${base}.docx`, { create: true });
                    const w = await fh.createWritable(); await w.write(blob); await w.close();
                    alert(`「${folderHandle.name}」に保存しました ✅`); return;
                }
            } catch (err) { console.error(err); }
        }
        if (window.showSaveFilePicker) {
            try {
                const h = await window.showSaveFilePicker({ suggestedName: `${base}.docx`, types: [{ description: 'Word Document', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } }] });
                const w = await h.createWritable(); await w.write(blob); await w.close();
            } catch (e) { if (e.name !== 'AbortError') saveAs(blob, `${base}.docx`); }
        } else { saveAs(blob, `${base}.docx`); }
    };

    const handleCopyToClipboard = async () => {
        if (!previewRef.current) return;
        try {
            await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([previewRef.current.innerHTML], { type: 'text/html' }), 'text/plain': new Blob([generatedPlan], { type: 'text/plain' }) })]);
            alert('コピーしました！Googleドキュメントに貼り付けると表形式が維持されます。');
        } catch { navigator.clipboard.writeText(generatedPlan); alert('テキストとしてコピーしました。'); }
    };

    // ───────────────────────────────────────────
    // JSX
    // ───────────────────────────────────────────
    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">

            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-teal-600 rounded-lg shadow-lg shadow-teal-200">
                            <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-700 to-cyan-500">
                                指導案 Craft Pro
                            </h1>
                            {hasInherited && (
                                <div className="flex items-center gap-1 text-xs text-teal-600 font-semibold">
                                    <Link2 className="w-3 h-3" /> 単元計画から引き継ぎ中
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={toggleAi}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all border-2",
                                aiEnabled && apiKey ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                                    : aiEnabled && !apiKey ? "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
                                    : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                            )}
                        >
                            <div className={cn("w-2 h-2 rounded-full", aiEnabled && apiKey ? "bg-emerald-500 animate-pulse" : aiEnabled && !apiKey ? "bg-amber-500 animate-pulse" : "bg-slate-400")} />
                            {aiEnabled ? (apiKey ? "AI 稼働中" : "AI ON（キー未着）") : "AI OFF"}
                        </button>
                        <button onClick={() => setShowSettings(s => !s)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                            <Settings className="w-5 h-5 text-slate-600" />
                        </button>
                    </div>
                </div>
            </header>

            {/* ステップインジケーター */}
            <div className="border-b border-slate-100 bg-white/80 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-1 overflow-x-auto">
                    {[
                        { step: 1, label: '単元コンテキスト' },
                        { step: 2, label: '本時の設計' },
                        { step: 3, label: '先生の理念' },
                        { step: 4, label: '様式・資料' },
                        { step: 5, label: '生成' },
                        { step: 6, label: 'AI精錬', refine: true },
                    ].map((s, i, arr) => {
                        const isRefine = !!s.refine;
                        const isCurrent = s.step === currentStep;
                        const isDone = !isRefine && stepDone(s.step);
                        const isLocked = isRefine ? !generatedPlan : false;

                        return (
                            <React.Fragment key={s.step}>
                                <button
                                    disabled={isLocked}
                                    onClick={() => {
                                        if (isRefine) { if (generatedPlan) setLayoutMode('refine'); }
                                        else scrollToStep(s.step);
                                    }}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
                                        isCurrent
                                            ? "bg-teal-600 text-white shadow-sm"
                                            : isDone
                                            ? "bg-teal-100 text-teal-700 hover:bg-teal-200"
                                            : isRefine && generatedPlan
                                            ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                            : isLocked
                                            ? "text-slate-300 cursor-default"
                                            : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                    )}
                                >
                                    <span className={cn(
                                        "w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                                        isCurrent ? "bg-white text-teal-600"
                                            : isDone ? "bg-teal-500 text-white"
                                            : "bg-current/20"
                                    )}>
                                        {isDone ? '✓' : s.step}
                                    </span>
                                    {s.label}
                                </button>
                                {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />}
                            </React.Fragment>
                        );
                    })}
                    {generatedPlan && (
                        <button onClick={() => setLayoutMode('design')} className="ml-auto text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 whitespace-nowrap px-2">
                            ← 設計に戻る
                        </button>
                    )}
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* ===== 左カラム: 入力 ===== */}
                <div className={cn("space-y-5 transition-all duration-500", layoutMode === 'refine' ? "hidden" : "lg:col-span-5")}>

                    {/* 設定パネル */}
                    <AnimatePresence>
                        {showSettings && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-white rounded-xl shadow-premium border border-teal-100 overflow-hidden">
                                <div className="p-5 space-y-3">
                                    <h3 className="font-bold text-teal-900 flex items-center gap-2"><Settings className="w-4 h-4" /> システム設定</h3>
                                    <div className={cn(
                                        "flex items-start gap-3 p-3 rounded-lg border text-xs font-semibold",
                                        apiKey && connectionStatus !== 'error'
                                            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                            : connectionStatus === 'error'
                                            ? "bg-red-50 border-red-200 text-red-800"
                                            : "bg-amber-50 border-amber-200 text-amber-800"
                                    )}>
                                        <div className={cn(
                                            "w-2.5 h-2.5 rounded-full shrink-0 mt-0.5",
                                            connectionStatus === 'testing' ? "bg-blue-400 animate-pulse"
                                            : connectionStatus === 'success' ? "bg-emerald-500"
                                            : connectionStatus === 'error' ? "bg-red-500"
                                            : apiKey ? "bg-emerald-500" : "bg-amber-400 animate-pulse"
                                        )} />
                                        <div className="leading-snug">
                                            {!apiKey ? (
                                                <>APIキー未取得<br /><span className="font-normal">Nova Lab Pro の「設定・連携」で登録してください</span></>
                                            ) : connectionStatus === 'testing' ? (
                                                <>モデルを自動検出中...</>
                                            ) : connectionStatus === 'error' ? (
                                                <>接続エラー<br /><span className="font-normal">APIキーを確認してください</span></>
                                            ) : (
                                                <>
                                                    Gemini APIキー連携済み<br />
                                                    <span className="font-normal opacity-70">Nova Lab Pro から自動取得</span>
                                                    {model && (
                                                        <span className="block mt-1 font-normal">
                                                            使用モデル: <span className="font-bold">{model}</span>（自動選択）
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ① 単元コンテキスト */}
                    <div ref={stepRef1} className={cn("rounded-xl shadow-premium p-6 space-y-4 border", hasInherited ? "bg-gradient-to-br from-teal-600 to-cyan-700 text-white border-teal-500" : "bg-white border-slate-100")}>
                        <h3 className={cn("font-bold flex items-center gap-2", hasInherited ? "text-white" : "text-slate-700")}>
                            <GraduationCap className="w-5 h-5" />
                            単元コンテキスト
                            {hasInherited && <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full ml-1">単元計画から引き継ぎ中</span>}
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={cn("block text-xs font-semibold mb-1", hasInherited ? "text-teal-100" : "text-slate-500")}>校種</label>
                                <select value={schoolType} onChange={e => setSchoolType(e.target.value)} className={cn("w-full p-2 border rounded-lg text-sm", hasInherited ? "bg-white/20 border-white/30 text-white" : "bg-slate-50 border-slate-200")}>
                                    <option value="elementary">小学校</option>
                                    <option value="junior_high">中学校</option>
                                </select>
                            </div>
                            <div>
                                <label className={cn("block text-xs font-semibold mb-1", hasInherited ? "text-teal-100" : "text-slate-500")}>学年</label>
                                <input type="text" value={grade} onChange={e => setGrade(e.target.value)} placeholder="例: 第5学年" className={cn("w-full p-2 border rounded-lg text-sm", hasInherited ? "bg-white/20 border-white/30 text-white placeholder:text-white/50" : "bg-slate-50 border-slate-200")} />
                            </div>
                        </div>
                        <div>
                            <label className={cn("block text-xs font-semibold mb-1", hasInherited ? "text-teal-100" : "text-slate-500")}>教科・領域</label>
                            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="例: 国語、算数、道徳..." className={cn("w-full p-2 border rounded-lg text-sm", hasInherited ? "bg-white/20 border-white/30 text-white placeholder:text-white/50" : "bg-slate-50 border-slate-200")} />
                        </div>
                        <div>
                            <label className={cn("block text-xs font-semibold mb-1", hasInherited ? "text-teal-100" : "text-slate-500")}>単元名</label>
                            <input type="text" value={unitName} onChange={e => setUnitName(e.target.value)} placeholder="例: 大造じいさんとガン" className={cn("w-full p-2 border rounded-lg text-sm", hasInherited ? "bg-white/20 border-white/30 text-white placeholder:text-white/50" : "bg-slate-50 border-slate-200")} />
                        </div>
                        <div>
                            <label className={cn("block text-xs font-semibold mb-1", hasInherited ? "text-teal-100" : "text-slate-500")}>学級タイプ</label>
                            <select value={classType} onChange={e => setClassType(e.target.value)} className={cn("w-full p-2 border rounded-lg text-sm", hasInherited ? "bg-white/20 border-white/30 text-white" : "bg-slate-50 border-slate-200")}>
                                <option value="regular">通常学級</option>
                                <option value="special_intellectual">特別支援（知的障害）</option>
                                <option value="special_emotional">特別支援（自閉症・情緒）</option>
                                <option value="resource_room">通級指導教室</option>
                            </select>
                        </div>
                        {hasInherited && unitPlanSummary && (
                            <p className="text-xs text-teal-200 bg-white/10 rounded-lg px-3 py-2">
                                単元指導計画 {unitPlanSummary.length} 文字を引き継いでいます。AIが本時の設計に最大限反映します。
                            </p>
                        )}
                    </div>

                    {/* ② 本時の設計 */}
                    <div ref={stepRef2} className="bg-white rounded-xl shadow-premium p-6 space-y-4 border border-slate-100">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-teal-500" /> 本時の基本設計
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">本時（第○時）</label>
                                <input type="text" value={lessonNumber} onChange={e => setLessonNumber(e.target.value)} placeholder="例: 3" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">全○時</label>
                                <input type="text" value={totalLessons} onChange={e => setTotalLessons(e.target.value)} placeholder="例: 8" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">授業時間</label>
                                <select value={lessonTime} onChange={e => setLessonTime(e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                                    <option value="45">45分</option>
                                    <option value="50">50分</option>
                                    <option value="60">60分</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">授業のタイトル（任意）</label>
                            <input type="text" value={lessonTitle} onChange={e => setLessonTitle(e.target.value)} placeholder="例：登場人物の心情の変化を読み取ろう" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">
                                <span className="text-red-400 mr-1">必須</span>本時のねらい・目標
                            </label>
                            <textarea
                                value={lessonObjective}
                                onChange={e => setLessonObjective(e.target.value)}
                                placeholder="例：大造じいさんの心情の変化を叙述に基づいて読み取り、自分の考えを友達と伝え合うことができる。"
                                rows={3}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-teal-400 focus:outline-none"
                            />
                        </div>

                        {/* 詳細設計モーダルボタン */}
                        <button
                            onClick={() => setShowLessonModal(true)}
                            className="w-full bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl text-white p-4 relative overflow-hidden group text-left hover:shadow-lg hover:scale-[1.01] transition-all"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-sm flex items-center gap-2"><Lightbulb className="w-4 h-4" /> 本時の詳細設計（主発問・展開・支援）</h4>
                                    <p className="text-xs text-teal-100 mt-0.5">主発問・予想される反応・板書・支援を音声入力で記入</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {filledLessonCount > 0 && (
                                        <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-lg">
                                            {filledLessonCount}/{LESSON_QUESTIONS.length}項目
                                        </span>
                                    )}
                                    <ChevronRight className="w-5 h-5" />
                                </div>
                            </div>
                        </button>
                    </div>

                    {/* ③ 先生の指導理念 */}
                    <button
                        ref={stepRef3}
                        onClick={() => setShowTeacherModal(true)}
                        className="bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl shadow-float text-white p-5 relative overflow-hidden group text-left w-full transition-all hover:shadow-xl hover:scale-[1.01]"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Heart className="w-20 h-20" /></div>
                        <h3 className="text-base font-bold mb-1 flex items-center gap-2 relative z-10"><Heart className="w-4 h-4" /> 先生の指導理念・パーソナライズ</h3>
                        <p className="text-xs text-pink-100 relative z-10 mb-2">授業観・めざす子ども像・クラスの実態などをAIに伝えます（単元計画と共有）</p>
                        <div className="relative z-10 flex items-center justify-between">
                            <span className="text-xs font-bold">
                                {filledTeacherCount > 0 ? `${filledTeacherCount}/${TEACHER_QUESTIONS.length} 項目 入力済み` : '未入力（クリックして入力）'}
                            </span>
                            <span className="text-xs font-bold bg-white/20 px-3 py-1 rounded-lg flex items-center gap-1"><User className="w-3 h-3" /> 入力・編集 <ChevronRight className="w-3 h-3" /></span>
                        </div>
                    </button>

                    {/* ④ 指導案様式・参考資料 */}
                    <div ref={stepRef4} className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-xl shadow-float text-white p-5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Layout className="w-20 h-20" /></div>
                        <h3 className="font-bold text-base mb-1 flex items-center gap-2 relative z-10">
                            <Layout className="w-4 h-4" /> 指導案様式・参考資料
                        </h3>
                        <p className="text-xs text-violet-200 mb-4 relative z-10">
                            研究指定校の様式があればアップロード → AIがその様式に沿って作成します
                        </p>

                        {/* 様式アップロード */}
                        <div className="relative z-10 mb-4">
                            <p className="text-xs font-bold text-violet-200 mb-2">指導案様式（学校指定フォーマット）</p>
                            <input type="file" ref={templateInputRef} className="hidden" multiple accept=".pdf,.docx" onChange={handleTemplateUpload} />
                            <button onClick={() => templateInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 bg-white/15 hover:bg-white/25 border border-white/30 rounded-lg text-xs font-bold transition-all">
                                <Upload className="w-3 h-3" /> 様式ファイルを追加
                            </button>
                            {(templateFiles.length > 0 || templateText) && (
                                <div className="mt-2 space-y-1">
                                    {templateFiles.map((f, i) => (
                                        <div key={i} className="flex items-center justify-between bg-white/15 rounded px-2 py-1 text-xs">
                                            <span className="truncate flex items-center gap-1"><FileIcon className="w-3 h-3" />{f.name}</span>
                                            <button onClick={() => setTemplateFiles(p => p.filter((_, j) => j !== i))}><X className="w-3 h-3 opacity-60 hover:opacity-100" /></button>
                                        </div>
                                    ))}
                                    {templateText && (
                                        <div className="flex items-center justify-between bg-white/15 rounded px-2 py-1 text-xs">
                                            <span className="flex items-center gap-1"><FileIcon className="w-3 h-3" />Wordファイル（テキスト抽出済み）</span>
                                            <button onClick={() => setTemplateText('')}><X className="w-3 h-3 opacity-60 hover:opacity-100" /></button>
                                        </div>
                                    )}
                                </div>
                            )}
                            {templateFiles.length === 0 && !templateText && (
                                <p className="text-xs text-violet-300 mt-1 italic">未添付の場合は標準形式で作成します</p>
                            )}
                        </div>

                        {/* 参考資料アップロード */}
                        <div className="relative z-10">
                            <p className="text-xs font-bold text-violet-200 mb-2">参考資料（教科書・実践事例等）</p>
                            <input type="file" ref={refInputRef} className="hidden" multiple accept=".pdf,.docx,.txt,.md" onChange={handleRefUpload} />
                            <button onClick={() => refInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 bg-white/15 hover:bg-white/25 border border-white/30 rounded-lg text-xs font-bold transition-all">
                                <Upload className="w-3 h-3" /> 資料を追加（PDF/Word/Text）
                            </button>
                            {(refFiles.length > 0 || refText) && (
                                <div className="mt-2 space-y-1">
                                    {refFiles.map((f, i) => (
                                        <div key={i} className="flex items-center justify-between bg-white/15 rounded px-2 py-1 text-xs">
                                            <span className="truncate flex items-center gap-1"><FileIcon className="w-3 h-3" />{f.name}</span>
                                            <button onClick={() => setRefFiles(p => p.filter((_, j) => j !== i))}><X className="w-3 h-3 opacity-60 hover:opacity-100" /></button>
                                        </div>
                                    ))}
                                    {refText && <p className="text-xs text-violet-200 mt-1">テキスト資料 読み込み済み</p>}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 生成ボタン */}
                    <button
                        ref={stepRef5}
                        onClick={handleGenerate}
                        disabled={isLoading || !aiEnabled}
                        className={cn(
                            "w-full py-4 rounded-xl font-bold text-lg shadow-float transition-all transform active:scale-95 flex items-center justify-center gap-2",
                            isLoading ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                                : !aiEnabled ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                : "bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:from-teal-500 hover:to-cyan-500"
                        )}
                    >
                        {isLoading ? (
                            <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 生成中...</>
                        ) : !aiEnabled ? (
                            <><Settings className="w-5 h-5" /> AI OFF — ヘッダーのトグルでONにしてください</>
                        ) : (
                            <><Sparkles className="w-5 h-5" /> 学習指導案を作成</>
                        )}
                    </button>
                </div>

                {/* ===== 右カラム: 出力 ===== */}
                <div className={cn(
                    "flex flex-col gap-4 sticky top-24 min-h-0 transition-all duration-500",
                    layoutMode === 'refine' ? "lg:col-span-12 h-[calc(100vh-9rem)]" : "lg:col-span-7 h-[calc(100vh-8rem)]"
                )}>
                    {/* アクションバー */}
                    <div className="bg-white rounded-xl shadow-sm border border-teal-100 p-4 flex flex-col gap-3 shrink-0">
                        <div className="flex items-center gap-3 border-b border-teal-50 pb-3">
                            <div className="p-2 bg-teal-50 rounded-lg text-teal-600 shrink-0"><Sparkles className="w-5 h-5" /></div>
                            <div><h3 className="font-bold text-slate-700 text-sm">保存・共有</h3><p className="text-xs text-slate-500 mt-0.5">指導案を保存して次のステップへ</p></div>
                        </div>

                        {/* 保存先フォルダ */}
                        <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border text-xs", folderHandle ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-slate-50 border-slate-200 text-slate-500")}>
                            <FolderOpen className="w-4 h-4 shrink-0" />
                            <span className="flex-1 truncate font-medium">
                                {folderHandle ? <><span className="opacity-60 font-normal">保存先：</span>{folderName}</> : <span className="opacity-70">保存先フォルダ未設定（毎回ダイアログ）</span>}
                            </span>
                            <button onClick={handlePickFolder} className={cn("shrink-0 px-2 py-1 rounded font-bold transition-colors", folderHandle ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-700" : "bg-teal-100 hover:bg-teal-200 text-teal-700")}>
                                {folderHandle ? '変更' : 'フォルダを選択'}
                            </button>
                            {folderHandle && <button onClick={handleClearFolder} title="解除" className="shrink-0 text-slate-400 hover:text-red-500 transition-colors"><FolderX className="w-4 h-4" /></button>}
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                            <div className="flex gap-2">
                                <button onClick={handleWordExport} disabled={!generatedPlan} className="px-4 py-2 bg-white border-2 border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:border-teal-500 hover:text-teal-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                    <FileText className="w-4 h-4" /><div className="text-left leading-tight"><span className="block">保存 (.docx)</span><span className="text-[9px] text-slate-400 font-normal">Word / Google互換</span></div>
                                </button>
                                <button onClick={handleTextExport} disabled={!generatedPlan} className="px-3 py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-100 transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
                                    <FileIcon className="w-3 h-3" /> .txt
                                </button>
                            </div>
                            <button onClick={handleCopyToClipboard} disabled={!generatedPlan} className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed sm:ml-auto">
                                <Save className="w-4 h-4" /> クリップボードにコピー
                            </button>
                        </div>
                    </div>

                    {/* プレビューエリア */}
                    <div className="bg-white rounded-xl shadow-premium border border-slate-100 flex-grow min-h-0 flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                            <h3 className="font-bold text-slate-700">生成プレビュー</h3>
                            {generatedPlan && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400">修正回数: {chatMessages.filter(m => m.role === 'user').length}</span>
                                    {planHistory.length > 0 && (
                                        <button onClick={() => setShowHistoryModal(true)} className="text-xs flex items-center gap-1 text-slate-400 hover:text-violet-600 font-medium px-2 py-1 rounded transition-colors">
                                            <History className="w-3 h-3" /> 履歴 ({planHistory.length})
                                        </button>
                                    )}
                                    <button onClick={() => navigator.clipboard.writeText(generatedPlan)} className="text-xs flex items-center gap-1 text-slate-400 hover:text-teal-600 font-medium px-2 py-1 rounded transition-colors">
                                        <Save className="w-3 h-3" /> Markdownコピー
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="p-8 flex-grow overflow-y-auto min-h-0">
                            {generatedPlan ? (
                                <div ref={previewRef} className="prose prose-slate max-w-none prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:text-sm prose-li:text-sm prose-table:text-sm prose-th:bg-slate-100 prose-td:border-slate-200">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{generatedPlan}</ReactMarkdown>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                                    <FileText className="w-16 h-16 opacity-20" />
                                    <p className="text-center font-medium">
                                        左側のフォームに入力して<br />「学習指導案を作成」をクリックしてください
                                    </p>
                                    {hasInherited && (
                                        <div className="flex items-center gap-2 text-teal-400 text-sm font-semibold bg-teal-50 px-4 py-2 rounded-lg">
                                            <Link2 className="w-4 h-4" /> 単元計画のデータを引き継ぎ済みです
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* AI修正チャットパネル */}
                    <div className={cn("bg-white rounded-xl border shadow-lg flex flex-col overflow-hidden transition-all duration-300 shrink-0", isChatOpen ? "border-teal-200 max-h-[42vh]" : "border-slate-200 max-h-[52px]")}>
                        <button
                            onClick={() => setIsChatOpen(o => !o)}
                            disabled={!generatedPlan}
                            className={cn("flex items-center justify-between px-4 py-3 w-full text-left transition-colors shrink-0",
                                generatedPlan ? (isChatOpen ? "bg-teal-600 text-white" : "bg-teal-50 hover:bg-teal-100 text-teal-700") : "bg-slate-50 text-slate-400 cursor-not-allowed"
                            )}
                        >
                            <div className="flex items-center gap-2 font-bold text-sm">
                                <MessageCircle className="w-4 h-4" />
                                AI修正チャット
                                {chatMessages.filter(m => m.role === 'user').length > 0 && (
                                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-bold", isChatOpen ? "bg-white/20 text-white" : "bg-teal-100 text-teal-600")}>
                                        {chatMessages.filter(m => m.role === 'user').length}回修正済み
                                    </span>
                                )}
                                {!generatedPlan && <span className="text-xs font-normal opacity-60">（指導案を生成後に使用できます）</span>}
                            </div>
                            {isChatOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </button>

                        {isChatOpen && (
                            <div className="flex flex-col flex-1 min-h-0">
                                <div className="px-3 pt-3 pb-2 border-b border-slate-100 shrink-0">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><Zap className="w-3 h-3" /> ワンタップ修正</p>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {QUICK_CHIPS.map(chip => (
                                            <button key={chip.label} onClick={() => handleChatSend(chip.instruction)} disabled={isChatLoading}
                                                className="text-xs px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg font-medium transition-colors border border-teal-100 disabled:opacity-50 whitespace-nowrap">
                                                {chip.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-2">
                                    {chatMessages.length === 0 ? (
                                        <p className="text-xs text-slate-400 text-center py-4">チップを押すか、自由に修正指示を入力してください</p>
                                    ) : chatMessages.map((msg, i) => (
                                        <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                                            <div className={cn("max-w-[85%] px-3 py-2 rounded-xl text-sm", msg.role === 'user' ? "bg-teal-600 text-white rounded-br-sm" : "bg-slate-100 text-slate-700 rounded-bl-sm")}>{msg.content}</div>
                                        </div>
                                    ))}
                                    {isChatLoading && (
                                        <div className="flex justify-start">
                                            <div className="bg-slate-100 px-4 py-2 rounded-xl rounded-bl-sm flex items-center gap-2 text-sm text-slate-500">
                                                <div className="w-3 h-3 border-2 border-slate-300 border-t-teal-500 rounded-full animate-spin" /> AIが修正中...
                                            </div>
                                        </div>
                                    )}
                                    <div ref={chatEndRef} />
                                </div>
                                <div className="p-3 border-t border-slate-100 shrink-0 flex gap-2 bg-slate-50">
                                    <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                                        placeholder="例：3時目の展開をグループ活動中心に..."
                                        disabled={isChatLoading}
                                        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white disabled:opacity-50"
                                    />
                                    <button onClick={() => handleChatSend()} disabled={!chatInput.trim() || isChatLoading} className="px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center">
                                        <Send className="w-4 h-4" />
                                    </button>
                                    {chatMessages.length > 0 && (
                                        <button onClick={() => setChatMessages([])} className="px-2 py-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors">
                                            <RotateCcw className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* ===== 変更履歴モーダル ===== */}
            <AnimatePresence>
                {showHistoryModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
                        onClick={e => { if (e.target === e.currentTarget) { setShowHistoryModal(false); setDiffTarget(null); } }}>
                        <motion.div initial={{ scale: 0.95, y: 30, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, y: 30, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-4 flex items-center justify-between shrink-0">
                                <div>
                                    <h2 className="text-lg font-bold text-white flex items-center gap-2"><History className="w-5 h-5" /> 変更履歴・差分表示</h2>
                                    <p className="text-violet-200 text-xs mt-0.5">{planHistory.length} バージョン保存済み</p>
                                </div>
                                <button onClick={() => { setShowHistoryModal(false); setDiffTarget(null); }} className="p-2 hover:bg-white/20 rounded-full transition-colors"><X className="w-5 h-5 text-white" /></button>
                            </div>
                            <div className="flex flex-1 min-h-0 overflow-hidden">
                                <div className="w-56 border-r border-slate-100 overflow-y-auto shrink-0 bg-slate-50">
                                    {planHistory.map((h, i) => {
                                        const isSelected = diffTarget === i;
                                        const next = i < planHistory.length - 1 ? planHistory[i + 1].plan : generatedPlan;
                                        const { added, removed } = countChanges(lineDiff(h.plan, next));
                                        return (
                                            <button key={h.id} onClick={() => setDiffTarget(isSelected ? null : i)}
                                                className={cn("w-full text-left px-4 py-3 border-b border-slate-100 transition-colors", isSelected ? "bg-violet-50 border-l-4 border-l-violet-500" : "hover:bg-white")}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-bold text-slate-600">v{i + 1}</span>
                                                    <span className="text-[10px] text-slate-400">{h.ts.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                                <div className="text-xs text-slate-700 truncate mb-1">{h.label}</div>
                                                {(added > 0 || removed > 0) && (
                                                    <div className="flex gap-2 text-[10px] font-mono">
                                                        {added > 0 && <span className="text-emerald-600">+{added}</span>}
                                                        {removed > 0 && <span className="text-red-500">-{removed}</span>}
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                    <div className="w-full text-left px-4 py-3 bg-teal-50 border-l-4 border-l-teal-500">
                                        <div className="flex items-center justify-between mb-1"><span className="text-xs font-bold text-teal-600">現在</span><span className="text-[10px] text-teal-400">最新</span></div>
                                        <div className="text-xs text-teal-700">現在の指導案</div>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-5">
                                    {diffTarget !== null ? (() => {
                                        const h = planHistory[diffTarget];
                                        const next = diffTarget < planHistory.length - 1 ? planHistory[diffTarget + 1].plan : generatedPlan;
                                        const diff = lineDiff(h.plan, next);
                                        const { added, removed } = countChanges(diff);
                                        return (
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <span className="font-bold text-slate-700">v{diffTarget + 1} → {diffTarget < planHistory.length - 1 ? `v${diffTarget + 2}` : '現在'}</span>
                                                        <span className="ml-3 text-xs text-slate-500">「{h.label}」からの変更</span>
                                                    </div>
                                                    <div className="flex gap-3 text-sm font-mono font-bold"><span className="text-emerald-600">+{added} 行</span><span className="text-red-500">-{removed} 行</span></div>
                                                </div>
                                                <div className="font-mono text-xs rounded-xl overflow-hidden border border-slate-200">
                                                    {diff.map((d, idx) => (
                                                        <div key={idx} className={cn("px-3 py-0.5 leading-relaxed whitespace-pre-wrap break-words",
                                                            d.type === 'added' ? "bg-emerald-50 text-emerald-800 border-l-2 border-emerald-400" :
                                                            d.type === 'removed' ? "bg-red-50 text-red-700 border-l-2 border-red-400 line-through opacity-70" : "text-slate-600")}>
                                                            <span className="mr-2 opacity-40 select-none">{d.type === 'added' ? '+' : d.type === 'removed' ? '-' : '\u00A0'}</span>
                                                            {d.line || '\u00A0'}
                                                        </div>
                                                    ))}
                                                </div>
                                                <button onClick={() => { if (window.confirm(`v${diffTarget + 1}「${h.label}」に戻しますか？`)) { setGeneratedPlan(h.plan); setShowHistoryModal(false); setDiffTarget(null); } }}
                                                    className="flex items-center gap-2 px-4 py-2 bg-violet-100 text-violet-700 hover:bg-violet-200 rounded-lg text-sm font-bold transition-colors">
                                                    <RotateCcw className="w-4 h-4" /> このバージョンに戻す
                                                </button>
                                            </div>
                                        );
                                    })() : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-3">
                                            <History className="w-12 h-12 opacity-20" />
                                            <p className="text-center text-sm">左のバージョンを選択すると差分が表示されます</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ===== 本時の詳細設計モーダル ===== */}
            <AnimatePresence>
                {showLessonModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
                        onClick={e => { if (e.target === e.currentTarget) applyLessonProfile(); }}>
                        <motion.div initial={{ scale: 0.95, y: 30, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, y: 30, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                            <div className="bg-gradient-to-r from-teal-500 to-cyan-600 px-6 py-5 flex items-center justify-between shrink-0">
                                <div>
                                    <h2 className="text-xl font-bold text-white flex items-center gap-2"><Lightbulb className="w-5 h-5" /> 本時の詳細設計</h2>
                                    <p className="text-teal-100 text-sm mt-0.5">主発問・展開・支援など。音声入力対応 🎤</p>
                                </div>
                                <button onClick={applyLessonProfile} className="p-2 hover:bg-white/20 rounded-full transition-colors"><X className="w-5 h-5 text-white" /></button>
                            </div>
                            <div className="overflow-y-auto flex-1 p-5 space-y-5">
                                {LESSON_QUESTIONS.map(q => {
                                    const isL = lessonListeningKey === q.key;
                                    return (
                                        <div key={q.key} className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
                                            <div className="flex items-start justify-between gap-3">
                                                <label className="text-sm font-bold text-slate-700 flex items-center gap-1.5 leading-snug">
                                                    <span className="text-base">{q.icon}</span> {q.question}
                                                </label>
                                                <button onClick={() => toggleLessonVoice(q.key)}
                                                    className={cn("shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                                                        isL ? "bg-red-500 text-white border-red-500 animate-pulse" : "bg-white text-slate-500 border-slate-200 hover:border-teal-400 hover:text-teal-600")}>
                                                    {isL ? <><MicOff className="w-3.5 h-3.5" /> 停止</> : <><Mic className="w-3.5 h-3.5" /> 音声入力</>}
                                                </button>
                                            </div>
                                            <div className="relative">
                                                <textarea value={lessonProfile[q.key] || ''} onChange={e => updateLessonProfile(q.key, e.target.value)} placeholder={q.placeholder} rows={3}
                                                    className={cn("w-full px-3 py-2.5 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 transition-all",
                                                        isL ? "border-red-300 ring-2 ring-red-200 bg-red-50" : "border-slate-200 focus:ring-teal-300 bg-white")} />
                                                {isL && <div className="absolute bottom-2 right-2 flex items-center gap-1 text-red-500 text-xs font-bold"><span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" /> 録音中</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="shrink-0 px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
                                <p className="text-xs text-slate-500">入力内容はブラウザに保存されます</p>
                                <button onClick={applyLessonProfile} className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95">
                                    <CheckCircle2 className="w-4 h-4" /> 反映して閉じる
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ===== 先生パーソナライズモーダル ===== */}
            <AnimatePresence>
                {showTeacherModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
                        onClick={e => { if (e.target === e.currentTarget) applyTeacherProfile(); }}>
                        <motion.div initial={{ scale: 0.95, y: 30, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, y: 30, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                            <div className="bg-gradient-to-r from-pink-500 to-rose-600 px-6 py-5 flex items-center justify-between shrink-0">
                                <div>
                                    <h2 className="text-xl font-bold text-white flex items-center gap-2"><Heart className="w-5 h-5" /> 先生の指導理念・パーソナライズ</h2>
                                    <p className="text-pink-100 text-sm mt-0.5">入力内容は単元計画アプリとも共有されます 🎤</p>
                                </div>
                                <button onClick={applyTeacherProfile} className="p-2 hover:bg-white/20 rounded-full transition-colors"><X className="w-5 h-5 text-white" /></button>
                            </div>
                            <div className="overflow-y-auto flex-1 p-5 space-y-5">
                                {TEACHER_QUESTIONS.map(q => {
                                    const isL = listeningKey === q.key;
                                    return (
                                        <div key={q.key} className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
                                            <div className="flex items-start justify-between gap-3">
                                                <label className="text-sm font-bold text-slate-700 flex items-center gap-1.5 leading-snug">
                                                    <span className="text-base">{q.icon}</span> {q.question}
                                                </label>
                                                <button onClick={() => toggleVoice(q.key)}
                                                    className={cn("shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                                                        isL ? "bg-red-500 text-white border-red-500 animate-pulse" : "bg-white text-slate-500 border-slate-200 hover:border-pink-400 hover:text-pink-600")}>
                                                    {isL ? <><MicOff className="w-3.5 h-3.5" /> 停止</> : <><Mic className="w-3.5 h-3.5" /> 音声入力</>}
                                                </button>
                                            </div>
                                            <div className="relative">
                                                <textarea value={teacherProfile[q.key] || ''} onChange={e => updateTeacherProfile(q.key, e.target.value)} placeholder={q.placeholder} rows={3}
                                                    className={cn("w-full px-3 py-2.5 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 transition-all",
                                                        isL ? "border-red-300 ring-2 ring-red-200 bg-red-50" : "border-slate-200 focus:ring-pink-300 bg-white")} />
                                                {isL && <div className="absolute bottom-2 right-2 flex items-center gap-1 text-red-500 text-xs font-bold"><span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" /> 録音中</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="shrink-0 px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
                                <p className="text-xs text-slate-500">入力内容はブラウザに自動保存されます</p>
                                <button onClick={applyTeacherProfile} className="flex items-center gap-2 bg-gradient-to-r from-pink-500 to-rose-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95">
                                    <CheckCircle2 className="w-4 h-4" /> 反映して閉じる
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default LessonPlanGenerator;
